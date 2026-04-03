import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import crypto from "crypto";
import { InterviewRecord } from "../models/InterviewRecord.js";
import { User } from "../models/User.js";
import { SystemSetting, SYSTEM_SETTING_ID } from "../models/SystemSetting.js";
import { requireAuth, requireAdmin, requireApprovedUser } from "../middleware/auth.js";
import { canModifyInterviewRecord } from "../utils/interviewPermissions.js";
import { buildInterviewSummary } from "../utils/interviewSummary.js";
import { importInterviewExcelBuffer } from "../utils/interviewExcelImport.js";
import {
  findInterviewsInCalendarWindow,
  findOverlappingInterviews,
  resolveScheduledEnd
} from "../utils/interviewTimeRange.js";
import { enrichCalendarInterviewsWithProfileColor } from "../utils/interviewCalendarColors.js";
import { migrateJobProfilesIfNeeded } from "../utils/jobProfiles.js";

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

/**
 * Resolve stored profile label + jobProfileId for a linked subject user.
 * @returns {{ jobProfileId: import("mongoose").Types.ObjectId | null, profile: string } | null} null = no change to apply from this helper
 */
function matchProfileForSubject(subjectDoc, { jobProfileIdRaw, profileStr, fallbackProfile }) {
  const profiles = subjectDoc.jobProfiles || [];

  if (jobProfileIdRaw !== undefined) {
    if (jobProfileIdRaw === null || jobProfileIdRaw === "") {
      const prof =
        typeof profileStr === "string"
          ? String(profileStr).trim()
          : typeof fallbackProfile === "string"
            ? String(fallbackProfile).trim()
            : "";
      if (prof) {
        const p = profiles.find((x) => x.label.toLowerCase() === prof.toLowerCase());
        if (p) return { jobProfileId: p._id, profile: p.label };
      }
      return { jobProfileId: null, profile: prof };
    }
    const pid = String(jobProfileIdRaw).trim();
    if (!mongoose.Types.ObjectId.isValid(pid)) {
      const err = new Error("Invalid jobProfileId");
      err.status = 400;
      throw err;
    }
    const p = profiles.find((x) => x._id.toString() === pid);
    if (!p) {
      const err = new Error("jobProfileId does not match this team member's job profiles");
      err.status = 400;
      throw err;
    }
    return { jobProfileId: p._id, profile: p.label };
  }

  if (profileStr !== undefined) {
    const prof = String(profileStr).trim();
    if (!prof) return { jobProfileId: null, profile: "" };
    const p = profiles.find((x) => x.label.toLowerCase() === prof.toLowerCase());
    if (p) return { jobProfileId: p._id, profile: p.label };
    return { jobProfileId: null, profile: prof };
  }

  return null;
}

function ensureToken(v) {
  return v && typeof v === "string" && v.trim() ? v.trim() : crypto.randomBytes(24).toString("hex");
}

function baseUrlFromReq(req) {
  const proto = req.get("x-forwarded-proto") || req.protocol || "http";
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

function icsEscape(v) {
  return String(v ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function dtUtc(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${hh}${mm}${ss}Z`;
}

async function renderUserInterviewIcs({ userDoc, feedBaseUrl }) {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
  const uid = String(userDoc._id);
  const rows = await InterviewRecord.find({
    scheduledAt: { $lt: to },
    $or: [{ subjectUserId: uid }, { createdBy: uid, subjectUserId: null }]
  })
    .sort({ scheduledAt: 1, _id: 1 })
    .lean();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JobTrack//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(userDoc.name || userDoc.email || "Team member")} - Interviews`,
    "X-WR-TIMEZONE:UTC",
    `X-PUBLISHED-TTL:PT15M`
  ];

  for (const r of rows) {
    const start = new Date(r.scheduledAt);
    const end = resolveScheduledEnd(start, r.scheduledEndAt);
    if (start < from || start > to) continue;
    const summary = `${r.subjectName || "Interview"} - ${r.company || ""}`.trim();
    const desc = [
      r.roleTitle ? `Role: ${r.roleTitle}` : "",
      r.interviewType ? `Type: ${r.interviewType}` : "",
      r.resultStatus ? `Result: ${r.resultStatus}` : "",
      r.interviewerName ? `Interviewer: ${r.interviewerName}` : "",
      r.notes ? `Notes: ${r.notes}` : "",
      r.jobLinkUrl ? `Job link: ${r.jobLinkUrl}` : "",
      `Source: ${feedBaseUrl}`
    ]
      .filter(Boolean)
      .join("\n");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${r._id}@jobtrack`);
    lines.push(`DTSTAMP:${dtUtc(now)}`);
    lines.push(`DTSTART:${dtUtc(start)}`);
    lines.push(`DTEND:${dtUtc(end)}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    if (r.contactInfo) lines.push(`LOCATION:${icsEscape(r.contactInfo)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

async function getOrCreateCombinedToken() {
  let doc = await SystemSetting.findById(SYSTEM_SETTING_ID).lean();
  if (!doc) {
    const tok = ensureToken("");
    await SystemSetting.create({ _id: SYSTEM_SETTING_ID, combinedCalendarFeedToken: tok });
    return tok;
  }
  if (!doc.combinedCalendarFeedToken) {
    const tok = ensureToken("");
    await SystemSetting.updateOne({ _id: SYSTEM_SETTING_ID }, { $set: { combinedCalendarFeedToken: tok } });
    return tok;
  }
  return doc.combinedCalendarFeedToken;
}

/** All team interviews in one ICS (subscribe once for the whole org). */
async function renderCombinedIcs({ feedBaseUrl }) {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
  const rows = await InterviewRecord.find({
    scheduledAt: { $lt: to }
  })
    .sort({ scheduledAt: 1, _id: 1 })
    .lean();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JobTrack//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape("JobTrack — Team interviews")}`,
    "X-WR-TIMEZONE:UTC",
    "X-PUBLISHED-TTL:PT15M"
  ];

  for (const r of rows) {
    const start = new Date(r.scheduledAt);
    const end = resolveScheduledEnd(start, r.scheduledEndAt);
    if (start < from || start > to) continue;
    const summary = `${r.subjectName || "Interview"} - ${r.company || ""}`.trim();
    const desc = [
      r.roleTitle ? `Role: ${r.roleTitle}` : "",
      r.interviewType ? `Type: ${r.interviewType}` : "",
      r.resultStatus ? `Result: ${r.resultStatus}` : "",
      r.interviewerName ? `Interviewer: ${r.interviewerName}` : "",
      r.notes ? `Notes: ${r.notes}` : "",
      r.jobLinkUrl ? `Job link: ${r.jobLinkUrl}` : "",
      `Source: ${feedBaseUrl}`
    ]
      .filter(Boolean)
      .join("\n");
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${r._id}@jobtrack`);
    lines.push(`DTSTAMP:${dtUtc(now)}`);
    lines.push(`DTSTART:${dtUtc(start)}`);
    lines.push(`DTEND:${dtUtc(end)}`);
    lines.push(`SUMMARY:${icsEscape(summary)}`);
    if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
    if (r.contactInfo) lines.push(`LOCATION:${icsEscape(r.contactInfo)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

/** Public combined team ICS (must be registered before /feed/:token so "combined" is not captured as a user token). */
router.get("/feed/combined/:token.ics", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(404).send("Not found");
    const doc = await SystemSetting.findById(SYSTEM_SETTING_ID).lean();
    if (!doc || doc.combinedCalendarFeedToken !== token) return res.status(404).send("Not found");
    const feedBaseUrl = `${baseUrlFromReq(req)}/api/interviews/feed/combined/${token}.ics`;
    const ics = await renderCombinedIcs({ feedBaseUrl });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(ics);
  } catch (error) {
    res.status(500).send(`Failed to render feed: ${error.message}`);
  }
});

/** Public tokenized ICS feed for calendar subscriptions. */
router.get("/feed/:token.ics", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim();
    if (!token) return res.status(404).send("Not found");
    const user = await User.findOne({ calendarFeedToken: token }).select("email name").lean();
    if (!user) return res.status(404).send("Not found");
    const feedBaseUrl = `${baseUrlFromReq(req)}/api/interviews/feed/${token}.ics`;
    const ics = await renderUserInterviewIcs({ userDoc: user, feedBaseUrl });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(ics);
  } catch (error) {
    res.status(500).send(`Failed to render feed: ${error.message}`);
  }
});

router.use(requireAuth, requireApprovedUser);

router.get("/feeds", async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select("email name calendarFeedToken").lean();
    if (!me) return res.status(401).json({ message: "User not found" });

    const myToken = ensureToken(me.calendarFeedToken);
    if (myToken !== (me.calendarFeedToken || "")) {
      await User.updateOne({ _id: me._id }, { $set: { calendarFeedToken: myToken } });
    }
    const base = baseUrlFromReq(req);
    const own = {
      userId: me._id.toString(),
      email: me.email || "",
      name: me.name || "",
      url: `${base}/api/interviews/feed/${myToken}.ics`
    };

    let team = [];
    if (req.user.role === "admin") {
      const users = await User.find().select("email name calendarFeedToken").sort({ email: 1 }).lean();
      const ops = [];
      team = users.map((u) => {
        const tok = ensureToken(u.calendarFeedToken);
        if (tok !== (u.calendarFeedToken || "")) {
          ops.push({
            updateOne: { filter: { _id: u._id }, update: { $set: { calendarFeedToken: tok } } }
          });
        }
        return {
          userId: u._id.toString(),
          email: u.email || "",
          name: u.name || "",
          url: `${base}/api/interviews/feed/${tok}.ics`
        };
      });
      if (ops.length) await User.bulkWrite(ops);
    }

    const combinedToken = await getOrCreateCombinedToken();
    const combined = {
      url: `${base}/api/interviews/feed/combined/${combinedToken}.ics`
    };

    res.json({ own, team, combined });
  } catch (error) {
    res.status(500).json({ message: "Failed to load feed links", error: error.message });
  }
});

/** Regenerate the team combined ICS URL (invalidates old subscriptions). Admin only. */
router.post("/feeds/combined-token", requireAdmin, async (req, res) => {
  try {
    const tok = ensureToken("");
    await SystemSetting.findOneAndUpdate(
      { _id: SYSTEM_SETTING_ID },
      { $set: { combinedCalendarFeedToken: tok } },
      { upsert: true, new: true }
    );
    const base = baseUrlFromReq(req);
    res.json({ url: `${base}/api/interviews/feed/combined/${tok}.ics` });
  } catch (error) {
    res.status(500).json({ message: "Failed to rotate combined feed token", error: error.message });
  }
});

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
    const interviews = await enrichCalendarInterviewsWithProfileColor(rows);
    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      interviews
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

router.get("/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid id" });
    }
    const doc = await InterviewRecord.findById(id)
      .populate("createdBy", "email name")
      .populate("subjectUserId", "email name")
      .lean();
    if (!doc) {
      return res.status(404).json({ message: "Not found" });
    }
    res.json(doc);
  } catch (error) {
    res.status(500).json({ message: "Failed to load interview", error: error.message });
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

    let profile = typeof b.profile === "string" ? b.profile.trim() : "";
    let jobProfileId = null;
    if (subjectUserId) {
      const subject = await User.findById(subjectUserId).select("jobProfiles interviewProfiles");
      if (!subject) {
        return res.status(400).json({ message: "subjectUserId user not found" });
      }
      await migrateJobProfilesIfNeeded(subject);
      try {
        const hasExplicitJobProfileId =
          b.jobProfileId !== undefined &&
          b.jobProfileId !== null &&
          String(b.jobProfileId).trim() !== "";
        const resolved = matchProfileForSubject(subject, {
          jobProfileIdRaw: hasExplicitJobProfileId ? b.jobProfileId : undefined,
          profileStr: hasExplicitJobProfileId ? undefined : profile,
          fallbackProfile: profile
        });
        if (resolved) {
          jobProfileId = resolved.jobProfileId;
          profile = resolved.profile;
        }
      } catch (e) {
        return res.status(e.status || 400).json({ message: e.message });
      }
    } else if (b.jobProfileId != null && String(b.jobProfileId).trim() !== "") {
      return res.status(400).json({ message: "jobProfileId requires subjectUserId" });
    }

    const timezone =
      typeof b.timezone === "string" ? b.timezone.trim().slice(0, 120) : "";

    const doc = await InterviewRecord.create({
      subjectName,
      subjectUserId: subjectUserId || undefined,
      company,
      roleTitle,
      profile,
      jobProfileId: jobProfileId || undefined,
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

    const effectiveSubjectId =
      b.subjectUserId !== undefined
        ? b.subjectUserId === null || b.subjectUserId === ""
          ? null
          : String(b.subjectUserId).trim()
        : doc.subjectUserId
          ? doc.subjectUserId.toString()
          : null;

    const subjectChanged =
      Boolean(b.subjectUserId !== undefined) &&
      String(effectiveSubjectId || "") !== String(doc.subjectUserId || "");

    const touchesProfile =
      b.jobProfileId !== undefined || b.profile !== undefined || subjectChanged;

    if (touchesProfile) {
      if (!effectiveSubjectId) {
        updates.jobProfileId = null;
        if (b.profile !== undefined) updates.profile = String(b.profile).trim();
        if (
          b.jobProfileId !== undefined &&
          b.jobProfileId !== null &&
          String(b.jobProfileId).trim() !== ""
        ) {
          return res.status(400).json({ message: "jobProfileId requires a linked team member" });
        }
      } else {
        const subject = await User.findById(effectiveSubjectId).select("jobProfiles interviewProfiles");
        if (!subject) return res.status(400).json({ message: "Subject user not found" });
        await migrateJobProfilesIfNeeded(subject);
        let resolved = null;
        if (b.jobProfileId !== undefined || b.profile !== undefined) {
          const hasExplicitJobProfileId =
            b.jobProfileId !== undefined &&
            b.jobProfileId !== null &&
            String(b.jobProfileId).trim() !== "";
          resolved = matchProfileForSubject(subject, {
            jobProfileIdRaw: b.jobProfileId !== undefined ? b.jobProfileId : undefined,
            profileStr: hasExplicitJobProfileId
              ? undefined
              : b.profile !== undefined
                ? b.profile
                : undefined,
            fallbackProfile: doc.profile
          });
        } else if (subjectChanged) {
          resolved = matchProfileForSubject(subject, {
            jobProfileIdRaw: undefined,
            profileStr: doc.profile,
            fallbackProfile: doc.profile
          });
        }
        if (resolved) {
          updates.jobProfileId = resolved.jobProfileId;
          updates.profile = resolved.profile;
        }
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
