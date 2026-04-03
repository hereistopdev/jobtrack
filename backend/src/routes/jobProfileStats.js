import express from "express";
import mongoose from "mongoose";
import { InterviewRecord } from "../models/InterviewRecord.js";
import { JobLink } from "../models/JobLink.js";
import { User } from "../models/User.js";
import { requireAuth, requireApprovedUser } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth, requireApprovedUser);

/** GET /api/auth/job-profile-stats/:profileId — applications + interviews for this profile (current user). */
router.get("/:profileId", async (req, res) => {
  try {
    const pid = String(req.params.profileId || "");
    if (!mongoose.Types.ObjectId.isValid(pid)) {
      return res.status(400).json({ message: "Invalid profile id" });
    }

    const user = await User.findById(req.user.id).select("jobProfiles");
    if (!user) return res.status(404).json({ message: "User not found" });

    const owns = (user.jobProfiles || []).some((p) => p._id.toString() === pid);
    if (!owns) return res.status(404).json({ message: "Profile not found" });

    const profileOid = new mongoose.Types.ObjectId(pid);

    const [interviewsLoggedCount, appliedJobsCount] = await Promise.all([
      InterviewRecord.countDocuments({
        subjectUserId: req.user.id,
        jobProfileId: profileOid
      }),
      JobLink.countDocuments({
        createdBy: req.user.id,
        jobProfileId: profileOid,
        status: { $in: ["Applied", "Interview", "Offer", "Rejected"] }
      })
    ]);

    res.json({
      interviewsLoggedCount,
      appliedJobsCount,
      /** Jobs still in "Saved" with this profile (optional insight). */
      savedJobsCount: await JobLink.countDocuments({
        createdBy: req.user.id,
        jobProfileId: profileOid,
        status: "Saved"
      })
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load stats", error: error.message });
  }
});

export default router;
