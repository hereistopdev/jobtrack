import express from "express";
import { JobLink } from "../models/JobLink.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/summary", async (_req, res) => {
  try {
    const totalLinks = await JobLink.countDocuments();

    const byUserRaw = await JobLink.aggregate([
      { $match: { createdBy: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: "$createdBy",
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$_id",
          email: "$user.email",
          name: "$user.name",
          count: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    const byUser = byUserRaw.map((row) => ({
      userId: row.userId?.toString(),
      email: row.email || "(unknown)",
      name: row.name || "",
      count: row.count
    }));

    const byMonth = await JobLink.aggregate([
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          month: "$_id",
          count: 1
        }
      }
    ]);

    const statusBreakdown = await JobLink.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1
        }
      }
    ]);

    const userCount = await User.countDocuments();

    res.json({
      totalLinks,
      userCount,
      byUser,
      byMonth,
      statusBreakdown
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load analytics", error: error.message });
  }
});

export default router;
