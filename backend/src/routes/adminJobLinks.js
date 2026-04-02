import express from "express";
import mongoose from "mongoose";
import { JobLink } from "../models/JobLink.js";
import { requireAuth, requireAdmin, requireApprovedUser } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireApprovedUser, requireAdmin);

const CONFIRM_PHRASE = "DELETE_JOB_LINKS";

function parseYmd(ymd) {
  if (!ymd || typeof ymd !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, mo, d };
}

function startOfUtcDay(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, 0, 0, 0, 0));
}

function endOfUtcDay(ymd) {
  const p = parseYmd(ymd);
  if (!p) return null;
  return new Date(Date.UTC(p.y, p.mo - 1, p.d, 23, 59, 59, 999));
}

router.post("/bulk-delete", async (req, res) => {
  try {
    const { confirm, deleteAll, dateFrom, dateTo, userIds } = req.body || {};

    if (confirm !== CONFIRM_PHRASE) {
      return res.status(400).json({
        message: `Confirmation failed. Type exactly: ${CONFIRM_PHRASE}`
      });
    }

    if (deleteAll === true) {
      const result = await JobLink.deleteMany({});
      return res.json({
        deletedCount: result.deletedCount,
        message: `Removed ${result.deletedCount} job link record(s).`
      });
    }

    const filter = {};
    const hasDateFrom = dateFrom && String(dateFrom).trim();
    const hasDateTo = dateTo && String(dateTo).trim();
    const ids = Array.isArray(userIds) ? userIds.filter((id) => id && String(id).trim()) : [];

    if (!hasDateFrom && !hasDateTo && ids.length === 0) {
      return res.status(400).json({
        message:
          "Provide a job date range and/or at least one user, or enable delete-all in the admin UI and submit again."
      });
    }

    if (hasDateFrom) {
      const start = startOfUtcDay(String(dateFrom).trim());
      if (!start) {
        return res.status(400).json({ message: "dateFrom must be YYYY-MM-DD" });
      }
      filter.date = { ...filter.date, $gte: start };
    }
    if (hasDateTo) {
      const end = endOfUtcDay(String(dateTo).trim());
      if (!end) {
        return res.status(400).json({ message: "dateTo must be YYYY-MM-DD" });
      }
      filter.date = { ...filter.date, $lte: end };
    }

    if (ids.length) {
      const oids = [];
      for (const id of ids) {
        if (!mongoose.Types.ObjectId.isValid(id)) {
          return res.status(400).json({ message: `Invalid user id: ${id}` });
        }
        oids.push(new mongoose.Types.ObjectId(id));
      }
      filter.createdBy = { $in: oids };
    }

    const result = await JobLink.deleteMany(filter);
    return res.json({
      deletedCount: result.deletedCount,
      message: `Removed ${result.deletedCount} job link record(s) matching the filters.`
    });
  } catch (error) {
    res.status(400).json({ message: "Bulk delete failed", error: error.message });
  }
});

export default router;
