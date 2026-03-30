import express from "express";
import multer from "multer";
import { FinanceTransaction } from "../models/FinanceTransaction.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  attachRunningBalances,
  buildByOwnerSummary,
  buildSummary,
  filterTransactionsByOwner,
  filterTransactionsForDashboard
} from "../utils/financeSummary.js";
import { importFinanceFromExcelBuffer } from "../utils/financeExcelImport.js";
import { findDuplicateFinanceRow } from "../utils/duplicateFinanceTransaction.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

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

router.get("/summary", async (req, res) => {
  try {
    const raw = await FinanceTransaction.find().sort({ date: 1, _id: 1 }).lean();
    const ownerParam = String(req.query.owner ?? "").trim();
    const includeServiceIncomeRefs = parseIncludeServiceIncomeRefs(req);
    const dashOpts = { includeServiceIncomeRefs };

    const forOwnerScope = filterTransactionsByOwner(raw, ownerParam);
    const forSummary = filterTransactionsForDashboard(forOwnerScope, dashOpts);
    const forByOwner = filterTransactionsForDashboard(raw, dashOpts);

    res.json({
      ...buildSummary(forSummary),
      byOwner: buildByOwnerSummary(forByOwner),
      activeOwnerFilter: ownerParam || null,
      includeServiceIncomeRefs
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to build summary", error: error.message });
  }
});

router.get("/transactions", async (_req, res) => {
  try {
    const raw = await FinanceTransaction.find().sort({ date: 1, _id: 1 }).lean();
    const withBal = attachRunningBalances(raw);
    res.json(withBal);
  } catch (error) {
    res.status(500).json({ message: "Failed to list transactions", error: error.message });
  }
});

router.post("/transactions", async (req, res) => {
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

router.patch("/transactions/:id", async (req, res) => {
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

router.delete("/transactions/:id", async (req, res) => {
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
}, async (req, res) => {
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
