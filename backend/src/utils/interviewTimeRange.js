import { InterviewRecord } from "../models/InterviewRecord.js";

/** Default slot length when `scheduledEndAt` is missing (legacy imports). */
export const DEFAULT_INTERVIEW_DURATION_MS = 60 * 60 * 1000;

/** How far back to look for overlapping rows (long meetings). */
const OVERLAP_LOOKBACK_MS = 72 * 60 * 60 * 1000;

export function effectiveStartMs(doc) {
  return new Date(doc.scheduledAt).getTime();
}

export function effectiveEndMs(doc) {
  if (doc.scheduledEndAt != null) {
    const e = new Date(doc.scheduledEndAt).getTime();
    if (!Number.isNaN(e)) return e;
  }
  return effectiveStartMs(doc) + DEFAULT_INTERVIEW_DURATION_MS;
}

export function rangesOverlapMs(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

/**
 * Resolve end time from body: explicit scheduledEndAt, or start + default duration.
 */
export function resolveScheduledEnd(scheduledAt, scheduledEndAtRaw) {
  const start = scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  if (scheduledEndAtRaw == null || scheduledEndAtRaw === "") {
    return new Date(start.getTime() + DEFAULT_INTERVIEW_DURATION_MS);
  }
  const end = new Date(scheduledEndAtRaw);
  if (Number.isNaN(end.getTime())) return null;
  return end;
}

/**
 * Find interviews whose time range overlaps [start, end] (half-open could be used; we use standard overlap).
 */
export async function findOverlappingInterviews(start, end, excludeId) {
  const s = start.getTime();
  const e = end.getTime();
  if (e <= s) return [];

  const filter = {
    scheduledAt: {
      $lt: end,
      $gte: new Date(s - OVERLAP_LOOKBACK_MS)
    }
  };
  if (excludeId && String(excludeId).trim()) {
    filter._id = { $ne: excludeId };
  }

  const raw = await InterviewRecord.find(filter)
    .populate("createdBy", "email name")
    .populate("subjectUserId", "email name")
    .sort({ scheduledAt: 1 })
    .lean();

  return raw.filter((doc) => {
    const ds = effectiveStartMs(doc);
    const de = effectiveEndMs(doc);
    return rangesOverlapMs(s, e, ds, de);
  });
}

/**
 * Interviews visible in calendar window [from, to) — overlap with window.
 */
export async function findInterviewsInCalendarWindow(from, to) {
  const ft = from.getTime();
  const tt = to.getTime();
  if (tt <= ft) return [];

  const raw = await InterviewRecord.find({
    scheduledAt: {
      $lt: to,
      $gte: new Date(ft - OVERLAP_LOOKBACK_MS)
    }
  })
    .populate("createdBy", "email name")
    .populate("subjectUserId", "email name")
    .sort({ scheduledAt: 1 })
    .lean();

  return raw.filter((doc) => {
    const ds = effectiveStartMs(doc);
    const de = effectiveEndMs(doc);
    return rangesOverlapMs(ft, tt, ds, de);
  });
}
