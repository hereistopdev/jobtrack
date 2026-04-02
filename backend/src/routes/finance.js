import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { FinanceTransaction } from "../models/FinanceTransaction.js";
import { User } from "../models/User.js";
import { requireAuth, requireAdmin, requireApprovedUser } from "../middleware/auth.js";
import {
  attachRunningBalances,
  buildByOwnerSummary,
  buildSummary,
  filterTransactionsByOwner,
  filterTransactionsForDashboard
} from "../utils/financeSummary.js";
import { importFinanceFromExcelBuffer } from "../utils/financeExcelImport.js";
import { findDuplicateFinanceRow } from "../utils/duplicateFinanceTransaction.js";
import { ledgerOwnerLabelFromUserDoc, normalizeOwnerName } from "../utils/financeOwnerIdentity.js";

const router = express.Router();
router.use(requireAuth, requireApprovedUser);

async function attachFinanceViewer(req, res, next) {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(401).json({ message: "User not found" });
    const isAdmin = req.user.role === "admin";
    const ledgerOwnerLabel = ledgerOwnerLabelFromUserDoc(user);
    const normalizedOwner = normalizeOwnerName(ledgerOwnerLabel);
    req.financeViewer = {
      isAdmin,
      ledgerOwnerLabel,
      normalizedOwner,
      canViewFinance: isAdmin || normalizedOwner.length > 0
    };
    next();
  } catch (err) {
    next(err);
  }
}

function requireFinanceRead(_req, res, next) {
  if (!_req.financeViewer.canViewFinance) {
    return res.status(403).json({
      message:
        "Set your display name or ask an admin to set your Finance owner label (Users page) so it matches the ledger Owner column."
    });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /\.(xlsx|xls)$/i.test(file.originalname || ""));
  }
});

function parseBodyNumber(v, fallback = 0) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseIncludeServiceIncomeRefs(req) {
  const v = req.query.includeServiceIncomeRefs;
  if (v === "0" || v === "false") return false;
  return true;
}

router.get("/summary", attachFinanceViewer, requireFinanceRead, async (req, res) => {
  try {
    const raw = await FinanceTransaction.find().sort({ date: 1, _id: 1 }).lean();
    const v = req.financeViewer;
    let ownerParam = String(req.query.owner ?? "").trim();
    if (!v.isAdmin) {
      ownerParam = v.ledgerOwnerLabel;
    }
    const includeServiceIncomeRefs = parseIncludeServiceIncomeRefs(req);
    const dashOpts = { includeServiceIncomeRefs };

    const forOwnerScope = filterTransactionsByOwner(raw, ownerParam);
    const forSummary = filterTransactionsForDashboard(forOwnerScope, dashOpts);
    const forByOwner = filterTransactionsForDashboard(raw, dashOpts);

    let byOwner = buildByOwnerSummary(forByOwner);
    if (!v.isAdmin) {
      byOwner = byOwner.filter((row) => normalizeOwnerName(row.owner) === v.normalizedOwner);
    }

    res.json({
      ...buildSummary(forSummary),
      byOwner,
      activeOwnerFilter: ownerParam || null,
      includeServiceIncomeRefs,
      viewerScope: v.isAdmin ? "admin" : "own",
      matchedLedgerOwner: v.ledgerOwnerLabel || null
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to build summary", error: error.message });
  }
});

router.get("/transactions", attachFinanceViewer, requireFinanceRead, async (_req, res) => {
  try {
    const raw = await FinanceTransaction.find().sort({ date: 1, _id: 1 }).lean();
    const v = _req.financeViewer;
    const scoped = v.isAdmin
      ? raw
      : raw.filter((t) => normalizeOwnerName(t.owner) === v.normalizedOwner);
    const withBal = attachRunningBalances(scoped);
    res.json(withBal);
  } catch (error) {
    res.status(500).json({ message: "Failed to list transactions", error: error.message });
  }
});

router.post("/transactions/bulk-delete", requireAdmin, async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids must be a non-empty array" });
    }
    if (ids.length > 500) {
      return res.status(400).json({ message: "At most 500 ids per request" });
    }
    const objectIds = [];
    for (const id of ids) {
      const s = String(id ?? "").trim();
      if (!mongoose.Types.ObjectId.isValid(s)) {
        return res.status(400).json({ message: `Invalid id: ${id}` });
      }
      objectIds.push(s);
    }
    const result = await FinanceTransaction.deleteMany({ _id: { $in: objectIds } });
    res.json({ deletedCount: result.deletedCount ?? 0 });
  } catch (error) {
    res.status(400).json({ message: "Bulk delete failed", error: error.message });
  }
});

router.post("/transactions", requireAdmin, async (req, res) => {
  try {
    const { type, entryType, date, purpose, owner, ref, deposit, withdraw, txId, serviceEarnings } =
      req.body || {};
    const et = String(entryType || type || "").trim();
    if (!et) {
      return res.status(400).json({ message: "type (entry category) is required" });
    }
    const d = date ? new Date(date) : null;
    if (!d || Number.isNaN(d.getTime())) {
      return res.status(400).json({ message: "Valid date is required" });
    }

    const dep = parseBodyNumber(deposit, 0);
    const wdr = parseBodyNumber(withdraw, 0);
    const tid = typeof txId === "string" ? txId.trim() : String(txId ?? "").trim();
    const dup = await findDuplicateFinanceRow({
      txId: tid,
      entryType: et,
      date: d,
      deposit: dep,
      withdraw: wdr,
      purpose: typeof purpose === "string" ? purpose : "",
      owner: typeof owner === "string" ? owner : "",
      ref: typeof ref === "string" ? ref : ""
    });
    if (dup) {
      return res.status(409).json({
        message: "Duplicate record (same TXid or an identical row without TXid already exists)."
      });
    }

    const doc = await FinanceTransaction.create({
      entryType: et,
      date: d,
      purpose: typeof purpose === "string" ? purpose.trim() : "",
      owner: typeof owner === "string" ? owner.trim() : "",
      ref: typeof ref === "string" ? ref.trim() : "",
      deposit: dep,
      withdraw: wdr,
      txId: tid,
      serviceEarnings: typeof serviceEarnings === "string" ? serviceEarnings.trim() : "",
      createdBy: req.user.id
    });
    res.status(201).json(doc);
  } catch (error) {
    res.status(400).json({ message: "Failed to create transaction", error: error.message });
  }
});

router.patch("/transactions/:id", requireAdmin, async (req, res) => {
  try {
    const { type, entryType, date, purpose, owner, ref, deposit, withdraw, txId, serviceEarnings } =
      req.body || {};
    const updates = {};
    if (entryType !== undefined || type !== undefined) {
      const et = String(entryType || type || "").trim();
      if (!et) return res.status(400).json({ message: "type cannot be empty" });
      updates.entryType = et;
    }
    if (date !== undefined) {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid date" });
      updates.date = d;
    }
    if (purpose !== undefined) updates.purpose = typeof purpose === "string" ? purpose.trim() : "";
    if (owner !== undefined) updates.owner = typeof owner === "string" ? owner.trim() : "";
    if (ref !== undefined) updates.ref = typeof ref === "string" ? ref.trim() : "";
    if (deposit !== undefined) updates.deposit = parseBodyNumber(deposit, 0);
    if (withdraw !== undefined) updates.withdraw = parseBodyNumber(withdraw, 0);
    if (txId !== undefined) updates.txId = typeof txId === "string" ? txId.trim() : "";
    if (serviceEarnings !== undefined) {
      updates.serviceEarnings = typeof serviceEarnings === "string" ? serviceEarnings.trim() : "";
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const doc = await FinanceTransaction.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    });
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json(doc);
  } catch (error) {
    res.status(400).json({ message: "Failed to update", error: error.message });
  }
});

router.delete("/transactions/:id", requireAdmin, async (req, res) => {
  try {
    const doc = await FinanceTransaction.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(400).json({ message: "Failed to delete", error: error.message });
  }
});

router.post("/import", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File too large (max 8 MB)" });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) return next(err);
    next();
  });
}, requireAdmin, async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Upload .xlsx or .xls (field name: file)" });
    }
    const result = await importFinanceFromExcelBuffer(req.file.buffer, { userId: req.user.id });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: "Import failed", error: error.message });
  }
});

export default router;
