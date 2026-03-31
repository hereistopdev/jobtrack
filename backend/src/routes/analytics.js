import mongoose from "mongoose";
import express from "express";
import { JobLink } from "../models/JobLink.js";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.use(requireAuth);

const STATUS_VALUES = ["Saved", "Applied", "Interview", "Offer", "Rejected"];

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

    const byUserStatusGroups = await JobLink.aggregate([
      { $match: { createdBy: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { user: "$createdBy", status: "$status" },
          count: { $sum: 1 }
        }
      }
    ]);

    const perUserStatus = new Map();
    for (const g of byUserStatusGroups) {
      const uid = g._id.user.toString();
      const st = STATUS_VALUES.includes(g._id.status) ? g._id.status : "Saved";
      if (!perUserStatus.has(uid)) {
        perUserStatus.set(uid, Object.fromEntries(STATUS_VALUES.map((s) => [s, 0])));
      }
      perUserStatus.get(uid)[st] += g.count;
    }

    const userIdsForStatus = [...perUserStatus.keys()]
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));
    const usersForStatus = await User.find({ _id: { $in: userIdsForStatus } })
      .select("email name")
      .lean();
    const userById = new Map(usersForStatus.map((u) => [u._id.toString(), u]));

    const byUserStatus = [...perUserStatus.entries()]
      .map(([userId, counts]) => {
        const u = userById.get(userId);
        return {
          userId,
          email: u?.email || "",
          name: u?.name || "",
          ...counts
        };
      })
      .sort((a, b) => {
        const ta = STATUS_VALUES.reduce((s, k) => s + (a[k] || 0), 0);
        const tb = STATUS_VALUES.reduce((s, k) => s + (b[k] || 0), 0);
        return tb - ta;
      });

    const userCount = await User.countDocuments();

    res.json({
      totalLinks,
      userCount,
      byUser,
      byMonth,
      statusBreakdown,
      byUserStatus
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load analytics", error: error.message });
  }
});

function emptyStatusCounts() {
  return Object.fromEntries(STATUS_VALUES.map((s) => [s, 0]));
}

function normalizeStatus(s) {
  return STATUS_VALUES.includes(s) ? s : "Saved";
}

function monthLabelYm(ym) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** UTC calendar days inclusive from start to end (date-only). */
function enumerateUtcDays(startMidnightUtc, endMidnightUtc) {
  const keys = [];
  for (let t = startMidnightUtc.getTime(); t <= endMidnightUtc.getTime(); t += 86400000) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

/** Last `count` months as YYYY-MM (UTC), oldest first. */
function enumerateLastMonthsUtc(count) {
  const out = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Job links added per period (createdAt), stacked by current status at query time.
 * Daily: last `dayCount` UTC days (zero-filled). Weekly: last `weekCount` ISO weeks with data (sparse).
 * Monthly: last `monthCount` calendar months (zero-filled).
 */
router.get("/pipeline-timeseries", async (_req, res) => {
  try {
    const dayCount = 30;
    const weekCount = 26;
    const monthCount = 24;

    const endDay = new Date();
    const endUtc = new Date(Date.UTC(endDay.getUTCFullYear(), endDay.getUTCMonth(), endDay.getUTCDate()));
    const startDailyUtc = new Date(endUtc);
    startDailyUtc.setUTCDate(startDailyUtc.getUTCDate() - (dayCount - 1));

    const dailyAgg = await JobLink.aggregate([
      { $match: { createdAt: { $gte: startDailyUtc } } },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const dayKeys = enumerateUtcDays(startDailyUtc, endUtc);
    const dailyMap = new Map(
      dayKeys.map((k) => {
        const d = new Date(`${k}T12:00:00.000Z`);
        const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return [k, { period: k, label, ...emptyStatusCounts(), total: 0 }];
      })
    );
    for (const row of dailyAgg) {
      const day = row._id.day;
      const st = normalizeStatus(row._id.status);
      const c = row.count;
      if (!dailyMap.has(day)) continue;
      const r = dailyMap.get(day);
      r[st] += c;
      r.total += c;
    }
    const daily = dayKeys.map((k) => dailyMap.get(k));

    const weekCutoff = new Date();
    weekCutoff.setUTCDate(weekCutoff.getUTCDate() - 7 * weekCount);

    const weeklyAgg = await JobLink.aggregate([
      { $match: { createdAt: { $gte: weekCutoff } } },
      {
        $group: {
          _id: {
            y: { $isoWeekYear: "$createdAt" },
            w: { $isoWeek: "$createdAt" },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.y": 1, "_id.w": 1 } }
    ]);

    const weekMap = new Map();
    for (const row of weeklyAgg) {
      const y = row._id.y;
      const w = row._id.w;
      const key = `${y}-${w}`;
      if (!weekMap.has(key)) {
        const label = `${y} W${String(w).padStart(2, "0")}`;
        weekMap.set(key, { period: key, label, y, w, ...emptyStatusCounts(), total: 0 });
      }
      const r = weekMap.get(key);
      const st = normalizeStatus(row._id.status);
      r[st] += row.count;
      r.total += row.count;
    }
    let weekly = [...weekMap.values()].sort((a, b) => a.y - b.y || a.w - b.w);
    if (weekly.length > weekCount) {
      weekly = weekly.slice(-weekCount);
    }

    const monthKeys = enumerateLastMonthsUtc(monthCount);
    const monthStart = new Date(`${monthKeys[0]}-01T00:00:00.000Z`);

    const monthlyAgg = await JobLink.aggregate([
      { $match: { createdAt: { $gte: monthStart } } },
      {
        $group: {
          _id: {
            m: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            status: "$status"
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const monthlyMap = new Map(
      monthKeys.map((k) => [k, { period: k, label: monthLabelYm(k), ...emptyStatusCounts(), total: 0 }])
    );
    for (const row of monthlyAgg) {
      const m = row._id.m;
      const st = normalizeStatus(row._id.status);
      const c = row.count;
      if (!monthlyMap.has(m)) continue;
      const r = monthlyMap.get(m);
      r[st] += c;
      r.total += c;
    }
    const monthly = monthKeys.map((k) => monthlyMap.get(k));

    res.json({
      daily,
      weekly,
      monthly,
      meta: {
        basis: "createdAt",
        dailyDays: dayCount,
        weeklyWeeksMax: weekCount,
        monthlyMonths: monthCount
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load pipeline timeseries", error: error.message });
  }
});

export default router;
