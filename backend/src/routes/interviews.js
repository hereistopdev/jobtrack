import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { InterviewRecord } from "../models/InterviewRecord.js";
import { requireAuth } from "../middleware/auth.js";
import { canModifyInterviewRecord } from "../utils/interviewPermissions.js";
import { buildInterviewSummary } from "../utils/interviewSummary.js";
import { importInterviewExcelBuffer } from "../utils/interviewExcelImport.js";
import {
  findInterviewsInCalendarWindow,
  findOverlappingInterviews,
  resolveScheduledEnd
} from "../utils/interviewTimeRange.js";

function serializeConflict(o) {
  return {
    _id: o._id,
    subjectName: o.subjectName,
    company: o.company,
    roleTitle: o.roleTitle,
    scheduledAt: o.scheduledAt,
    scheduledEndAt: o.scheduledEndAt ?? null,
    createdBy: o.createdBy
  };
}

const router = express.Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /\.(xlsx|xls)$/i.test(file.originalname || ""));
  }
});

router.get("/calendar", async (req, res) => {
  try {
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return res.status(400).json({ message: "Query params from and to (ISO dates) are required" });
    }
    if (to.getTime() <= from.getTime()) {
      return res.status(400).json({ message: "to must be after from" });
    }
    const span = to.getTime() - from.getTime();
    if (span > 120 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Range too large (max 120 days)" });
    }
    const rows = await findInterviewsInCalendarWindow(from, to);
    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      interviews: rows
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load calendar", error: error.message });
  }
});

router.post("/conflicts-check", async (req, res) => {
  try {
    const b = req.body || {};
    const start = b.scheduledAt ? new Date(b.scheduledAt) : null;
    const end = resolveScheduledEnd(start, b.scheduledEndAt);
    if (!start || Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: "scheduledAt is required" });
    }
    if (!end || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: "scheduledEndAt must be a valid end time after start" });
    }
    if (end.getTime() <= start.getTime()) {
      return res.status(400).json({ message: "End time must be after start time" });
    }
    const excludeId = b.excludeId ? String(b.excludeId).trim() : null;
    const overlaps = await findOverlappingInterviews(start, end, excludeId);
    res.json({
      conflicts: overlaps.map((o) => ({
        _id: o._id,
        subjectName: o.subjectName,
        company: o.company,
        roleTitle: o.roleTitle,
        scheduledAt: o.scheduledAt,
        scheduledEndAt: o.scheduledEndAt ?? null,
        createdBy: o.createdBy
      }))
    });
  } catch (error) {
    res.status(500).json({ message: "Conflict check failed", error: error.message });
  }
});

router.get("/summary", async (_req, res) => {
  try {
    const summary = await buildInterviewSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: "Failed to build interview summary", error: error.message });
  }
});

router.get("/", async (_req, res) => {
  try {
    const rows = await InterviewRecord.find()
      .populate("createdBy", "email name")
      .populate("subjectUserId", "email name")
      .sort({ scheduledAt: -1, _id: -1 })
      .lean();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Failed to list interviews", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    const subjectName = String(b.subjectName ?? "").trim();
    const company = String(b.company ?? "").trim();
    const roleTitle = String(b.roleTitle ?? b.title ?? "").trim();
    const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;

    if (!subjectName || !company || !roleTitle) {
      return res.status(400).json({ message: "subjectName, company, and roleTitle are required" });
    }
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ message: "Valid scheduledAt is required" });
    }

    const scheduledEnd = resolveScheduledEnd(scheduledAt, b.scheduledEndAt);
    if (!scheduledEnd || Number.isNaN(scheduledEnd.getTime())) {
      return res.status(400).json({ message: "Valid scheduledEndAt is required (must be after start)" });
    }
    if (scheduledEnd.getTime() <= scheduledAt.getTime()) {
      return res.status(400).json({ message: "End time must be after start time" });
    }

    const skipOverlapCheck = Boolean(b.skipOverlapCheck);
    if (!skipOverlapCheck) {
      const overlaps = await findOverlappingInterviews(scheduledAt, scheduledEnd, null);
      if (overlaps.length) {
        return res.status(409).json({
          message: "This time overlaps another interview",
          conflicts: overlaps.map(serializeConflict)
        });
      }
    }

    let subjectUserId = null;
    if (b.subjectUserId != null && String(b.subjectUserId).trim() !== "") {
      const sid = String(b.subjectUserId).trim();
      if (!mongoose.Types.ObjectId.isValid(sid)) {
        return res.status(400).json({ message: "Invalid subjectUserId" });
      }
      subjectUserId = sid;
    }

    const timezone =
      typeof b.timezone === "string" ? b.timezone.trim().slice(0, 120) : "";

    const doc = await InterviewRecord.create({
      subjectName,
      subjectUserId: subjectUserId || undefined,
      company,
      roleTitle,
      profile: typeof b.profile === "string" ? b.profile.trim() : "",
      stack: typeof b.stack === "string" ? b.stack.trim() : "",
      scheduledAt,
      scheduledEndAt: scheduledEnd,
      timezone,
      interviewType: typeof b.interviewType === "string" ? b.interviewType.trim() : "",
      resultStatus: typeof b.resultStatus === "string" ? b.resultStatus.trim() : "",
      notes: typeof b.notes === "string" ? b.notes.trim() : "",
      jobLinkUrl: typeof b.jobLinkUrl === "string" ? b.jobLinkUrl.trim() : "",
      interviewerName: typeof b.interviewerName === "string" ? b.interviewerName.trim() : "",
      contactInfo: typeof b.contactInfo === "string" ? b.contactInfo.trim() : "",
      sourceSheet: typeof b.sourceSheet === "string" ? b.sourceSheet.trim() : "",
      createdBy: req.user.id
    });
    const populated = await InterviewRecord.findById(doc._id)
      .populate("createdBy", "email name")
      .populate("subjectUserId", "email name");
    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: "Failed to create interview record", error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const doc = await InterviewRecord.findById(req.params.id).populate("createdBy", "email name");
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (!canModifyInterviewRecord(doc, req.user)) {
      return res.status(403).json({ message: "You can only edit records you created (or be an admin)" });
    }

    const b = req.body || {};
    const updates = {};
    if (b.subjectName !== undefined) updates.subjectName = String(b.subjectName).trim();
    if (b.company !== undefined) updates.company = String(b.company).trim();
    if (b.roleTitle !== undefined || b.title !== undefined) {
      updates.roleTitle = String(b.roleTitle ?? b.title ?? "").trim();
    }
    if (b.profile !== undefined) updates.profile = String(b.profile).trim();
    if (b.stack !== undefined) updates.stack = String(b.stack).trim();
    if (b.scheduledAt !== undefined) {
      const d = new Date(b.scheduledAt);
      if (Number.isNaN(d.getTime())) return res.status(400).json({ message: "Invalid scheduledAt" });
      updates.scheduledAt = d;
    }

    const timeFieldsChanged = b.scheduledAt !== undefined || b.scheduledEndAt !== undefined;
    const backfillEnd = doc.scheduledEndAt == null;
    if (timeFieldsChanged || backfillEnd) {
      const nextStart = updates.scheduledAt !== undefined ? updates.scheduledAt : doc.scheduledAt;
      const nextEndRaw =
        b.scheduledEndAt !== undefined
          ? b.scheduledEndAt === null || b.scheduledEndAt === ""
            ? null
            : b.scheduledEndAt
          : doc.scheduledEndAt != null
            ? doc.scheduledEndAt
            : null;
      const nextEnd = resolveScheduledEnd(nextStart, nextEndRaw);
      if (!nextEnd || Number.isNaN(nextEnd.getTime())) {
        return res.status(400).json({ message: "Could not resolve end time" });
      }
      if (nextEnd.getTime() <= nextStart.getTime()) {
        return res.status(400).json({ message: "End time must be after start time" });
      }
      updates.scheduledEndAt = nextEnd;

      const skipOverlapCheck = Boolean(b.skipOverlapCheck);
      if (!skipOverlapCheck) {
        const overlaps = await findOverlappingInterviews(nextStart, nextEnd, doc._id);
        if (overlaps.length) {
          return res.status(409).json({
            message: "This time overlaps another interview",
            conflicts: overlaps.map(serializeConflict)
          });
        }
      }
    }
    if (b.interviewType !== undefined) updates.interviewType = String(b.interviewType).trim();
    if (b.resultStatus !== undefined) updates.resultStatus = String(b.resultStatus).trim();
    if (b.notes !== undefined) updates.notes = String(b.notes).trim();
    if (b.jobLinkUrl !== undefined) updates.jobLinkUrl = String(b.jobLinkUrl).trim();
    if (b.interviewerName !== undefined) updates.interviewerName = String(b.interviewerName).trim();
    if (b.contactInfo !== undefined) updates.contactInfo = String(b.contactInfo).trim();
    if (b.timezone !== undefined) {
      updates.timezone = typeof b.timezone === "string" ? b.timezone.trim().slice(0, 120) : "";
    }
    if (b.subjectUserId !== undefined) {
      if (b.subjectUserId === null || b.subjectUserId === "") {
        updates.subjectUserId = null;
      } else {
        const sid = String(b.subjectUserId).trim();
        if (!mongoose.Types.ObjectId.isValid(sid)) {
          return res.status(400).json({ message: "Invalid subjectUserId" });
        }
        updates.subjectUserId = sid;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    Object.assign(doc, updates);
    await doc.save();
    const out = await InterviewRecord.findById(doc._id)
      .populate("createdBy", "email name")
      .populate("subjectUserId", "email name");
    res.json(out);
  } catch (error) {
    res.status(400).json({ message: "Failed to update", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const doc = await InterviewRecord.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    if (!canModifyInterviewRecord(doc, req.user)) {
      return res.status(403).json({ message: "You can only delete records you created (or be an admin)" });
    }
    await InterviewRecord.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (error) {
    res.status(400).json({ message: "Failed to delete", error: error.message });
  }
});

router.post("/import", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File too large (max 12 MB)" });
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
    const result = await importInterviewExcelBuffer(req.file.buffer, { userId: req.user.id });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: "Import failed", error: error.message });
  }
});

export default router;
