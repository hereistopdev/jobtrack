import express from "express";
import { JobLink } from "../models/JobLink.js";
import { parseJobUrl } from "../services/parseJobUrl.js";
import { requireAuth } from "../middleware/auth.js";
import { canModifyJobLink } from "../utils/jobPermissions.js";
import { findDuplicateJobLink, formatDuplicateResponse } from "../utils/duplicateJobLink.js";

const router = express.Router();

router.use(requireAuth);

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
      .sort({ date: -1, createdAt: -1 });
    res.json(links);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch job links" });
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

    const { label, scheduledAt } = req.body || {};
    if (!scheduledAt) {
      return res.status(400).json({ message: "scheduledAt is required" });
    }

    const at = new Date(scheduledAt);
    if (Number.isNaN(at.getTime())) {
      return res.status(400).json({ message: "Invalid scheduledAt" });
    }

    job.interviews.push({
      label: typeof label === "string" && label.trim() ? label.trim() : "Interview",
      scheduledAt: at
    });
    await job.save();

    const populated = await JobLink.findById(job._id).populate("createdBy", "email name");
    res.status(201).json(populated);
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

    if (!job.interviews.id(req.params.interviewId)) {
      return res.status(404).json({ message: "Interview not found" });
    }
    job.interviews.pull(req.params.interviewId);
    await job.save();

    const populated = await JobLink.findById(job._id).populate("createdBy", "email name");
    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: "Failed to remove interview", error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const { company, title, link, date, status, notes, country } = req.body || {};

    const dup = await findDuplicateJobLink({
      link,
      title,
      country,
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
      createdBy: req.user.id
    });
    const populated = await JobLink.findById(newLink._id).populate("createdBy", "email name");
    res.status(201).json(populated);
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

    const { company, title, link, date, status, notes, country } = req.body || {};

    const dup = await findDuplicateJobLink({
      link,
      title,
      country,
      excludeId: req.params.id
    });
    if (dup) {
      return res.status(409).json(formatDuplicateResponse(dup));
    }

    const updated = await JobLink.findByIdAndUpdate(
      req.params.id,
      { company, title, link, date, status, notes, country: typeof country === "string" ? country : "" },
      { new: true, runValidators: true }
    ).populate("createdBy", "email name");

    res.json(updated);
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
