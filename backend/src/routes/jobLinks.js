import express from "express";
import { JobLink } from "../models/JobLink.js";

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    const links = await JobLink.find().sort({ date: -1, createdAt: -1 });
    res.json(links);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch job links" });
  }
});

router.post("/", async (req, res) => {
  try {
    const newLink = await JobLink.create(req.body);
    res.status(201).json(newLink);
  } catch (error) {
    res.status(400).json({ message: "Failed to create job link", error: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updated = await JobLink.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ message: "Job link not found" });
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: "Failed to update job link", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const deleted = await JobLink.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Job link not found" });
    }

    res.json({ message: "Job link deleted" });
  } catch (error) {
    res.status(400).json({ message: "Failed to delete job link", error: error.message });
  }
});

export default router;
