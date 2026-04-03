import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { JobLink } from "../models/JobLink.js";
import { User } from "../models/User.js";
import { InterviewRecord } from "../models/InterviewRecord.js";
import { parseJobUrl } from "../services/parseJobUrl.js";
import { requireAuth, requireApprovedUser } from "../middleware/auth.js";
import { canModifyJobLink } from "../utils/jobPermissions.js";
import { findDuplicateJobLink, formatDuplicateResponse } from "../utils/duplicateJobLink.js";
import { importJobLinksFromExcelBuffer } from "../utils/excelJobImport.js";
import { findOverlappingInterviews, resolveScheduledEnd } from "../utils/interviewTimeRange.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname || "");
    cb(null, ok);
  }
});

router.use(requireAuth, requireApprovedUser);

async function resolveJobProfileIdForUser(userId, raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) {
    const err = new Error("Invalid jobProfileId");
    err.status = 400;
    throw err;
  }
  const user = await User.findById(userId).select("jobProfiles");
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  const ok = (user.jobProfiles || []).some((p) => p._id.toString() === s);
  if (!ok) {
    const err = new Error("jobProfileId must be one of your job profiles");
    err.status = 400;
    throw err;
  }
  return new mongoose.Types.ObjectId(s);
}

async function attachJobProfileLabel(doc) {
  const plain = doc?.toObject ? doc.toObject() : { ...doc };
  if (!plain.jobProfileId) {
    return { ...plain, jobProfileLabel: "" };
  }
  const uid = plain.createdBy?._id ? String(plain.createdBy._id) : String(plain.createdBy || "");
  if (!uid) {
    return { ...plain, jobProfileLabel: "" };
  }
  const u = await User.findById(uid).select("jobProfiles").lean();
  const pid = String(plain.jobProfileId);
  const jobProfileLabel = (u?.jobProfiles || []).find((p) => String(p._id) === pid)?.label || "";
  return { ...plain, jobProfileLabel };
}

router.post("/parse", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "url is required" });
    }
    const result = await parseJobUrl(url.trim());
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to parse job URL", error: error.message });
  }
});

// Team-wide board: every authenticated user sees all links (who added each row is shown on the record).
router.get("/", async (_req, res) => {
  try {
    const links = await JobLink.find()
      .populate("createdBy", "email name")
      .populate({
        path: "interviews.linkedInterviewRecordId",
        select: "subjectName company roleTitle scheduledAt jobLinkUrl jobLinkId"
      })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const creatorIds = [
      ...new Set(
        links
          .map((l) => (l.createdBy && l.createdBy._id ? String(l.createdBy._id) : ""))
          .filter(Boolean)
      )
    ];
    const users = await User.find({ _id: { $in: creatorIds } })
      .select("jobProfiles")
      .lean();

    const labelByCreatorAndProfile = new Map();
    for (const u of users) {
      const m = new Map((u.jobProfiles || []).map((p) => [String(p._id), p.label || ""]));
      labelByCreatorAndProfile.set(String(u._id), m);
    }

    const enriched = links.map((l) => {
      const uid = l.createdBy && l.createdBy._id ? String(l.createdBy._id) : "";
      const pid = l.jobProfileId ? String(l.jobProfileId) : "";
      let jobProfileLabel = "";
      if (uid && pid && labelByCreatorAndProfile.has(uid)) {
        jobProfileLabel = labelByCreatorAndProfile.get(uid).get(pid) || "";
      }
      return { ...l, jobProfileLabel };
    });

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch job links" });
  }
});

router.post("/import", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "File too large (max 5 MB)" });
      }
      return res.status(400).json({ message: err.message });
    }
    if (err) return next(err);
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        message: "Upload an Excel file (.xlsx or .xls). Form field name must be \"file\"."
      });
    }
    const result = await importJobLinksFromExcelBuffer(req.file.buffer, { userId: req.user.id });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ message: "Import failed", error: error.message });
  }
});

router.post("/:id/interviews", async (req, res) => {
  try {
    const job = await JobLink.findById(req.params.id).populate("createdBy", "email name");
    if (!job) {
      return res.status(404).json({ message: "Job link not found" });
    }
    if (!canModifyJobLink(job, req.user)) {
      return res.status(403).json({ message: "You can only edit links you added" });
    }

    const { label, scheduledAt: schedRaw, linkedInterviewRecordId: linkRaw } = req.body || {};
    let at;
    let linkedId = null;

    if (linkRaw != null && String(linkRaw).trim() !== "") {
      const lid = String(linkRaw).trim();
      if (!mongoose.Types.ObjectId.isValid(lid)) {
        return res.status(400).json({ message: "Invalid linkedInterviewRecordId" });
      }
      const rec = await InterviewRecord.findById(lid).lean();
      if (!rec) {
        return res.status(404).json({ message: "Interview record not found" });
      }
      linkedId = new mongoose.Types.ObjectId(lid);
      at = schedRaw ? new Date(schedRaw) : new Date(rec.scheduledAt);
      if (Number.isNaN(at.getTime())) {
        return res.status(400).json({ message: "Invalid scheduledAt" });
      }
      await InterviewRecord.findByIdAndUpdate(lid, {
        $set: {
          jobLinkUrl: job.link,
          jobLinkId: job._id
        }
      });
    } else {
      if (schedRaw == null || schedRaw === "") {
        return res.status(400).json({ message: "scheduledAt is required" });
      }
      at = new Date(schedRaw);
      if (Number.isNaN(at.getTime())) {
        return res.status(400).json({ message: "Invalid scheduledAt" });
      }
      const scheduledEnd = resolveScheduledEnd(at, null);
      if (!scheduledEnd || Number.isNaN(scheduledEnd.getTime())) {
        return res.status(400).json({ message: "Could not resolve interview end time" });
      }
      const overlaps = await findOverlappingInterviews(at, scheduledEnd, null);
      if (overlaps.length) {
        return res.status(409).json({
          message: "That time overlaps another interview in the team log. Pick a different slot or link an existing row.",
          conflicts: overlaps.map((o) => ({
            _id: o._id,
            company: o.company,
            roleTitle: o.roleTitle,
            scheduledAt: o.scheduledAt
          }))
        });
      }
      const creatorUser = await User.findById(req.user.id).select("name email").lean();
      const subjectName = String(creatorUser?.name || creatorUser?.email || "Team").trim() || "Team";
      const roundLabel = typeof label === "string" && label.trim() ? label.trim() : "";
      const newRec = await InterviewRecord.create({
        subjectName,
        company: job.company,
        roleTitle: job.title,
        profile: "",
        scheduledAt: at,
        scheduledEndAt: scheduledEnd,
        jobLinkUrl: job.link,
        jobLinkId: job._id,
        interviewType: roundLabel,
        createdFromJobBoard: true,
        createdBy: req.user.id
      });
      linkedId = newRec._id;
    }

    job.interviews.push({
      label: typeof label === "string" && label.trim() ? label.trim() : "Interview",
      scheduledAt: at,
      linkedInterviewRecordId: linkedId
    });
    await job.save();

    const populated = await JobLink.findById(job._id)
      .populate("createdBy", "email name")
      .populate({
        path: "interviews.linkedInterviewRecordId",
        select: "subjectName company roleTitle scheduledAt jobLinkUrl jobLinkId"
      });
    res.status(201).json(await attachJobProfileLabel(populated));
  } catch (error) {
    res.status(400).json({ message: "Failed to add interview", error: error.message });
  }
});

router.delete("/:id/interviews/:interviewId", async (req, res) => {
  try {
    const job = await JobLink.findById(req.params.id).populate("createdBy", "email name");
    if (!job) {
      return res.status(404).json({ message: "Job link not found" });
    }
    if (!canModifyJobLink(job, req.user)) {
      return res.status(403).json({ message: "You can only edit links you added" });
    }

    const sub = job.interviews.id(req.params.interviewId);
    if (!sub) {
      return res.status(404).json({ message: "Interview not found" });
    }
    const linkedRef = sub.linkedInterviewRecordId;
    job.interviews.pull(req.params.interviewId);
    await job.save();

    if (linkedRef) {
      const rec = await InterviewRecord.findById(linkedRef).lean();
      if (rec && rec.jobLinkId && String(rec.jobLinkId) === String(job._id)) {
        if (rec.createdFromJobBoard) {
          await InterviewRecord.deleteOne({ _id: linkedRef });
        } else {
          await InterviewRecord.updateOne(
            { _id: linkedRef },
            { $set: { jobLinkUrl: "", jobLinkId: null } }
          );
        }
      }
    }

    const populated = await JobLink.findById(job._id)
      .populate("createdBy", "email name")
      .populate({
        path: "interviews.linkedInterviewRecordId",
        select: "subjectName company roleTitle scheduledAt jobLinkUrl jobLinkId"
      });
    res.json(await attachJobProfileLabel(populated));
  } catch (error) {
    res.status(400).json({ message: "Failed to remove interview", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { company, title, link, date, status, notes, country, jobProfileId: jobProfileIdRaw } = req.body || {};

    let jobProfileId = null;
    try {
      jobProfileId = await resolveJobProfileIdForUser(req.user.id, jobProfileIdRaw);
    } catch (e) {
      const st = e.status || 400;
      return res.status(st).json({ message: e.message || "Invalid job profile" });
    }

    const dup = await findDuplicateJobLink({
      link,
      company,
      excludeId: null
    });
    if (dup) {
      return res.status(409).json(formatDuplicateResponse(dup));
    }

    const newLink = await JobLink.create({
      company,
      title,
      link,
      date,
      status,
      notes,
      country: typeof country === "string" ? country : "",
      jobProfileId,
      createdBy: req.user.id
    });
    const populated = await JobLink.findById(newLink._id)
      .populate("createdBy", "email name")
      .populate({
        path: "interviews.linkedInterviewRecordId",
        select: "subjectName company roleTitle scheduledAt jobLinkUrl jobLinkId"
      });
    res.status(201).json(await attachJobProfileLabel(populated));
  } catch (error) {
    res.status(400).json({ message: "Failed to create job link", error: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const job = await JobLink.findById(req.params.id).populate("createdBy", "email name");
    if (!job) {
      return res.status(404).json({ message: "Job link not found" });
    }
    if (!canModifyJobLink(job, req.user)) {
      return res.status(403).json({ message: "You can only edit links you added" });
    }

    const { company, title, link, date, status, notes, country, jobProfileId: jobProfileIdRaw } = req.body || {};

    let jobProfileIdUpdate = undefined;
    if (jobProfileIdRaw !== undefined) {
      if (jobProfileIdRaw === null || jobProfileIdRaw === "") {
        jobProfileIdUpdate = null;
      } else {
        try {
          jobProfileIdUpdate = await resolveJobProfileIdForUser(req.user.id, jobProfileIdRaw);
        } catch (e) {
          const st = e.status || 400;
          return res.status(st).json({ message: e.message || "Invalid job profile" });
        }
      }
    }

    const nextLink = link !== undefined ? link : job.link;
    const nextCompany = company !== undefined ? company : job.company;
    const dup = await findDuplicateJobLink({
      link: nextLink,
      company: nextCompany,
      excludeId: req.params.id
    });
    if (dup) {
      return res.status(409).json(formatDuplicateResponse(dup));
    }

    const patch = { company, title, link, date, status, notes, country: typeof country === "string" ? country : "" };
    if (jobProfileIdUpdate !== undefined) {
      patch.jobProfileId = jobProfileIdUpdate;
    }

    const updated = await JobLink.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true })
      .populate("createdBy", "email name")
      .populate({
        path: "interviews.linkedInterviewRecordId",
        select: "subjectName company roleTitle scheduledAt jobLinkUrl jobLinkId"
      });

    res.json(await attachJobProfileLabel(updated));
  } catch (error) {
    res.status(400).json({ message: "Failed to update job link", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const job = await JobLink.findById(req.params.id).populate("createdBy", "email name");
    if (!job) {
      return res.status(404).json({ message: "Job link not found" });
    }
    if (!canModifyJobLink(job, req.user)) {
      return res.status(403).json({ message: "You can only delete links you added" });
    }

    await JobLink.findByIdAndDelete(req.params.id);
    res.json({ message: "Job link deleted" });
  } catch (error) {
    res.status(400).json({ message: "Failed to delete job link", error: error.message });
  }
});

export default router;
