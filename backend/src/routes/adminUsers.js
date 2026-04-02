import express from "express";
import mongoose from "mongoose";
import { User } from "../models/User.js";
import { JobLink } from "../models/JobLink.js";
import { InterviewRecord } from "../models/InterviewRecord.js";
import { CalendarSource } from "../models/CalendarSource.js";
import { TotpEntry } from "../models/TotpEntry.js";
import { TeamAccount } from "../models/TeamAccount.js";
import { FinanceTransaction } from "../models/FinanceTransaction.js";
import { requireAuth, requireAdmin, requireApprovedUser } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireApprovedUser, requireAdmin);

router.get("/", async (_req, res) => {
  try {
    const users = await User.find().sort({ email: 1 }).select("-passwordHash").lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Failed to list users", error: error.message });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const { name, role, financeOwnerLabel, signupApproved } = req.body || {};
    const updates = {};

    if (typeof name === "string") {
      updates.name = name.trim();
    }
    if (typeof financeOwnerLabel === "string") {
      updates.financeOwnerLabel = financeOwnerLabel.trim();
    }
    if (role !== undefined) {
      if (!["user", "admin"].includes(role)) {
        return res.status(400).json({ message: "role must be user or admin" });
      }
      updates.role = role;
    }
    if (signupApproved !== undefined) {
      if (typeof signupApproved !== "boolean") {
        return res.status(400).json({ message: "signupApproved must be a boolean" });
      }
      if (signupApproved === false && String(req.params.id) === String(req.user.id)) {
        return res.status(400).json({ message: "You cannot revoke your own access" });
      }
      updates.signupApproved = signupApproved;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).select("-passwordHash");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(400).json({ message: "Failed to update user", error: error.message });
  }
});

/**
 * Remove a team member and their owned data. Interviews where this user was only the subject
 * stay in the log with the directory link cleared.
 */
router.delete("/:id", async (req, res) => {
  try {
    const rawId = String(req.params.id || "").trim();
    if (!mongoose.Types.ObjectId.isValid(rawId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (rawId === String(req.user.id)) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const target = await User.findById(rawId).select("role");
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }

    if (target.role === "admin") {
      const adminCount = await User.countDocuments({ role: "admin" });
      if (adminCount <= 1) {
        return res.status(400).json({ message: "Cannot delete the only administrator" });
      }
    }

    const uid = target._id;

    const calDocs = await CalendarSource.find({ owner: uid }).select("_id").lean();
    const calIds = calDocs.map((c) => c._id);
    if (calIds.length) {
      await InterviewRecord.deleteMany({ calendarSourceId: { $in: calIds } });
      await CalendarSource.deleteMany({ _id: { $in: calIds } });
    }

    await InterviewRecord.deleteMany({ createdBy: uid });
    await InterviewRecord.updateMany(
      { subjectUserId: uid },
      { $set: { subjectUserId: null, jobProfileId: null } }
    );

    await JobLink.deleteMany({ createdBy: uid });
    await TotpEntry.deleteMany({ owner: uid });
    await TeamAccount.deleteMany({ owner: uid });
    await FinanceTransaction.updateMany({ createdBy: uid }, { $set: { createdBy: null } });

    await User.findByIdAndDelete(uid);
    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(400).json({ message: "Failed to delete user", error: error.message });
  }
});

export default router;
