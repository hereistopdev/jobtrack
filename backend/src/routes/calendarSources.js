import express from "express";
import mongoose from "mongoose";
import { CalendarSource, CALENDAR_SOURCE_TYPES } from "../models/CalendarSource.js";
import { InterviewRecord } from "../models/InterviewRecord.js";
import { requireAuth } from "../middleware/auth.js";
import { syncCalendarSourceToInterviews } from "../utils/calendarIcsSync.js";
import { assertSafeIcsUrl } from "../utils/calendarIcsFetch.js";

const router = express.Router();
router.use(requireAuth);

const MAX_PER_USER = 30;

function canManageSource(doc, user) {
  if (!user?.id) return false;
  if (user.role === "admin") return true;
  const oid = doc.owner?._id ? doc.owner._id.toString() : doc.owner?.toString?.();
  return oid === user.id;
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
    label: doc.label || "",
    sourceType: doc.sourceType || "ics",
    icsUrl: doc.icsUrl || "",
    lastSyncedAt: doc.lastSyncedAt ?? null,
    lastError: doc.lastError || "",
    lastEventCount: doc.lastEventCount ?? 0,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function sanitizeBody(body) {
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 200) : "";
  const st = typeof body?.sourceType === "string" ? body.sourceType.trim() : "ics";
  const sourceType = CALENDAR_SOURCE_TYPES.includes(st) ? st : "ics";
  const icsUrl = typeof body?.icsUrl === "string" ? body.icsUrl.trim().slice(0, 4000) : "";
  return { label, sourceType, icsUrl };
}

/** Own sources, or all when admin uses ?view=all */
router.get("/", async (req, res) => {
  try {
    const viewAll = req.query.view === "all" && req.user.role === "admin";
    if (req.query.view === "all" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }

    if (viewAll) {
      const rows = await CalendarSource.find()
        .populate("owner", "email name")
        .sort({ updatedAt: -1 })
        .lean();
      return res.json({ sources: rows.map(serializeDoc) });
    }

    const rows = await CalendarSource.find({ owner: req.user.id })
      .populate("owner", "email name")
      .sort({ updatedAt: -1 })
      .lean();
    return res.json({ sources: rows.map(serializeDoc) });
  } catch (error) {
    res.status(500).json({ message: "Failed to load calendar sources", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const count = await CalendarSource.countDocuments({ owner: req.user.id });
    if (count >= MAX_PER_USER) {
      return res.status(400).json({ message: `At most ${MAX_PER_USER} calendar sources per user` });
    }
    const { label, sourceType, icsUrl } = sanitizeBody(req.body || {});
    if (!label) {
      return res.status(400).json({ message: "label is required" });
    }
    if (!icsUrl) {
      return res.status(400).json({ message: "icsUrl is required" });
    }
    try {
      assertSafeIcsUrl(icsUrl);
    } catch (e) {
      return res.status(400).json({ message: e.message || "Invalid URL" });
    }

    const created = await CalendarSource.create({
      owner: req.user.id,
      label,
      sourceType,
      icsUrl
    });
    const populated = await CalendarSource.findById(created._id).populate("owner", "email name").lean();
    res.status(201).json(serializeDoc(populated));
  } catch (error) {
    res.status(400).json({ message: "Failed to create calendar source", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const doc = await CalendarSource.findById(id).populate("owner", "email name");
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (!canManageSource(doc, req.user)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await InterviewRecord.deleteMany({ calendarSourceId: doc._id });
    await doc.deleteOne();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete", error: error.message });
  }
});

router.post("/:id/sync", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const doc = await CalendarSource.findById(id).populate("owner", "email name");
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (!canManageSource(doc, req.user)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const ownerId = doc.owner?._id ? doc.owner._id.toString() : doc.owner.toString();
    const result = await syncCalendarSourceToInterviews(doc, ownerId);

    doc.lastSyncedAt = new Date();
    doc.lastError = result.errors.length ? result.errors.join("; ").slice(0, 2000) : "";
    doc.lastEventCount = result.processed;
    await doc.save();

    const out = await CalendarSource.findById(doc._id).populate("owner", "email name").lean();
    res.json({
      processed: result.processed,
      errors: result.errors,
      source: serializeDoc(out)
    });
  } catch (error) {
    try {
      const id = String(req.params.id || "").trim();
      if (mongoose.Types.ObjectId.isValid(id)) {
        await CalendarSource.updateOne(
          { _id: id },
          { $set: { lastError: String(error.message || error).slice(0, 2000) } }
        );
      }
    } catch {
      /* ignore */
    }
    res.status(400).json({ message: error.message || "Sync failed", error: error.message });
  }
});

/** Admin-only: sync every registered source once. */
router.post("/sync-all", async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const rows = await CalendarSource.find().populate("owner", "email name");
    const results = [];
    for (const doc of rows) {
      const ownerId = doc.owner?._id ? doc.owner._id.toString() : doc.owner?.toString?.();
      if (!ownerId) continue;
      try {
        const result = await syncCalendarSourceToInterviews(doc, ownerId);
        doc.lastSyncedAt = new Date();
        doc.lastError = result.errors.length ? result.errors.join("; ").slice(0, 2000) : "";
        doc.lastEventCount = result.processed;
        await doc.save();
        results.push({
          sourceId: doc._id.toString(),
          label: doc.label || "",
          owner: doc.owner?.email || doc.owner?.name || ownerId,
          processed: result.processed,
          errors: result.errors
        });
      } catch (e) {
        const msg = String(e?.message || e).slice(0, 2000);
        doc.lastError = msg;
        await doc.save();
        results.push({
          sourceId: doc._id.toString(),
          label: doc.label || "",
          owner: doc.owner?.email || doc.owner?.name || ownerId,
          processed: 0,
          errors: [msg]
        });
      }
    }
    const totalProcessed = results.reduce((sum, x) => sum + (x.processed || 0), 0);
    res.json({ totalSources: results.length, totalProcessed, results });
  } catch (error) {
    res.status(500).json({ message: "Failed to sync all sources", error: error.message });
  }
});

export default router;
