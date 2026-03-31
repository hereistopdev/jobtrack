import { InterviewRecord } from "../models/InterviewRecord.js";

function monthKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

function ymdLocal(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Monday-based week start in local time (date string YYYY-MM-DD). */
function weekStartLocal(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return ymdLocal(x);
}

function userLabelFromPopulated(createdBy) {
  if (!createdBy) return "(unknown)";
  const n = String(createdBy.name || "").trim();
  if (n) return n;
  const e = String(createdBy.email || "").trim();
  return e || "(unknown)";
}

function lastNWeekStartsAscending(n) {
  const now = new Date();
  const end = weekStartLocal(now);
  if (!end) return [];
  const start = new Date(`${end}T12:00:00`);
  start.setDate(start.getDate() - (n - 1) * 7);
  const first = weekStartLocal(start);
  if (!first) return [];
  const weeks = [];
  let cur = new Date(`${first}T12:00:00`);
  for (let i = 0; i < n; i++) {
    weeks.push(ymdLocal(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

function lastNMonthsAscending(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

function sortMap(m) {
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }));
}

export async function buildInterviewSummary() {
  const rows = await InterviewRecord.find().populate("createdBy", "name email").lean();

  const now = new Date();
  const start30 = new Date(now);
  start30.setDate(start30.getDate() - 30);

  let last30 = 0;
  const total = rows.length;
  const byResult = new Map();
  const byType = new Map();
  /** userId -> { label, count } */
  const byLoggedBy = new Map();
  const byProfile = new Map();
  const byMonthGlobal = new Map();

  /** userId -> { label, weekly: Map weekStr -> count, monthly: Map monthStr -> count, total } */
  const perUser = new Map();

  for (const r of rows) {
    const t = new Date(r.scheduledAt).getTime();
    if (t >= start30.getTime() && t <= now.getTime()) last30 += 1;

    const res = (r.resultStatus || "").trim() || "(none)";
    byResult.set(res, (byResult.get(res) || 0) + 1);

    const typ = (r.interviewType || "").trim() || "(none)";
    byType.set(typ, (byType.get(typ) || 0) + 1);

    const prof = (r.profile || "").trim() || "(none)";
    byProfile.set(prof, (byProfile.get(prof) || 0) + 1);

    const mk = monthKey(r.scheduledAt);
    byMonthGlobal.set(mk, (byMonthGlobal.get(mk) || 0) + 1);

    const cb = r.createdBy;
    const uid = cb && cb._id ? String(cb._id) : r.createdBy ? String(r.createdBy) : "";
    const label = userLabelFromPopulated(cb);

    if (uid) {
      if (!byLoggedBy.has(uid)) {
        byLoggedBy.set(uid, { label, count: 0 });
      }
      const lb = byLoggedBy.get(uid);
      lb.count += 1;
      lb.label = label;

      if (!perUser.has(uid)) {
        perUser.set(uid, {
          userId: uid,
          label,
          total: 0,
          weekly: new Map(),
          monthly: new Map()
        });
      }
      const pu = perUser.get(uid);
      pu.total += 1;
      pu.label = label;

      const wk = weekStartLocal(r.scheduledAt);
      if (wk) {
        pu.weekly.set(wk, (pu.weekly.get(wk) || 0) + 1);
      }
      pu.monthly.set(mk, (pu.monthly.get(mk) || 0) + 1);
    }
  }

  const weekKeys = lastNWeekStartsAscending(16);
  const monthKeys = lastNMonthsAscending(24);

  const perUserSeries = [...perUser.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((pu) => ({
      userId: pu.userId,
      label: pu.label,
      total: pu.total,
      weekly: weekKeys.map((week) => ({
        week,
        count: pu.weekly.get(week) || 0
      })),
      monthly: monthKeys.map((month) => ({
        month,
        count: pu.monthly.get(month) || 0
      }))
    }));

  return {
    total,
    last30Days: last30,
    byResult: sortMap(byResult).slice(0, 20),
    byInterviewType: sortMap(byType).slice(0, 20),
    byLoggedBy: [...byLoggedBy.entries()]
      .map(([userId, v]) => ({ userId, label: v.label, count: v.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40),
    byProfile: sortMap(byProfile).slice(0, 30),
    byMonth: [...byMonthGlobal.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count })),
    perUser: perUserSeries
  };
}
