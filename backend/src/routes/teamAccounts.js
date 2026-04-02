import express from "express";
import mongoose from "mongoose";
import { TeamAccount, TEAM_ACCOUNT_CATEGORIES } from "../models/TeamAccount.js";
import { requireAuth, requireApprovedUser } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireApprovedUser);

const MAX_PER_USER = 100;

function sanitizeBody(body) {
  const category = TEAM_ACCOUNT_CATEGORIES.includes(body?.category) ? body.category : "other";
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 200) : "";
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim().slice(0, 500) : "";
  const credentials = typeof body?.credentials === "string" ? body.credentials.slice(0, 8000) : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
  return { category, label, identifier, credentials, notes };
}

function serializeDoc(doc) {
  if (!doc) return null;
  const o = doc.owner && typeof doc.owner === "object" && doc.owner._id ? doc.owner : null;
  const ownerId = o ? o._id.toString() : doc.owner?.toString?.() || String(doc.owner);
  return {
    _id: doc._id.toString(),
    ownerId,
    ownerEmail: o?.email || "",
    ownerName: o?.name || "",
    category: doc.category,
    label: doc.label,
    identifier: doc.identifier || "",
    credentials: doc.credentials || "",
    notes: doc.notes || "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

/** Own entries, or all when admin uses ?view=all */
router.get("/", async (req, res) => {
  try {
    const viewAll = req.query.view === "all" && req.user.role === "admin";
    if (req.query.view === "all" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    if (viewAll) {
      const rows = await TeamAccount.find()
        .populate("owner", "email name")
        .sort({ updatedAt: -1 })
        .lean();
      return res.json({ entries: rows.map(serializeDoc) });
    }

    const rows = await TeamAccount.find({ owner: req.user.id })
      .populate("owner", "email name")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ entries: rows.map(serializeDoc) });
  } catch (error) {
    res.status(500).json({ message: "Failed to load accounts", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const count = await TeamAccount.countDocuments({ owner: req.user.id });
    if (count >= MAX_PER_USER) {
      return res.status(400).json({ message: `At most ${MAX_PER_USER} account rows per user` });
    }
    const { category, label, identifier, credentials, notes } = sanitizeBody(req.body || {});
    if (!label) {
      return res.status(400).json({ message: "label is required" });
    }
    const created = await TeamAccount.create({
      owner: req.user.id,
      category,
      label,
      identifier,
      credentials,
      notes
    });
    const populated = await TeamAccount.findById(created._id).populate("owner", "email name").lean();
    res.status(201).json(serializeDoc(populated));
  } catch (error) {
    res.status(400).json({ message: "Failed to create account row", error: error.message });
  }
});

async function loadOwned(id, userId, isAdmin) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const q = isAdmin ? { _id: id } : { _id: id, owner: userId };
  return TeamAccount.findOne(q).populate("owner", "email name").lean();
}

router.patch("/:id", async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const existing = await loadOwned(req.params.id, req.user.id, isAdmin);
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }
    const { category, label, identifier, credentials, notes } = sanitizeBody(req.body || {});
    if (!label) {
      return res.status(400).json({ message: "label is required" });
    }
    const updated = await TeamAccount.findByIdAndUpdate(
      req.params.id,
      { $set: { category, label, identifier, credentials, notes } },
      { new: true }
    )
      .populate("owner", "email name")
      .lean();
    res.json(serializeDoc(updated));
  } catch (error) {
    res.status(400).json({ message: "Failed to update", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const existing = await loadOwned(req.params.id, req.user.id, isAdmin);
    if (!existing) {
      return res.status(404).json({ message: "Not found" });
    }
    await TeamAccount.deleteOne({ _id: req.params.id });
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: "Failed to delete", error: error.message });
  }
});

export default router;
