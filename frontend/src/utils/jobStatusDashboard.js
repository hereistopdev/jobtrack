/** Pipeline order for job link status (bid progress). */
export const JOB_STATUSES = ["Saved", "Applied", "Interview", "Offer", "Rejected"];

export const STATUS_COLORS = {
  Saved: "#94a3b8",
  Applied: "#3b82f6",
  Interview: "#a855f7",
  Offer: "#22c55e",
  Rejected: "#ef4444"
};

export function emptyStatusCounts() {
  return Object.fromEntries(JOB_STATUSES.map((s) => [s, 0]));
}

/**
 * @param {Array<{ status?: string, createdBy?: { _id?: unknown, email?: string, name?: string } | null }>} links
 * @returns {Array<Record<string, unknown>>} rows with userId, email, name, label, and each status count
 */
export function buildStatusByUserFromLinks(links) {
  const map = new Map();
  for (const item of links) {
    const cb = item.createdBy;
    if (!cb || typeof cb !== "object") continue;
    const uid = cb._id != null ? String(cb._id) : String(cb);
    if (!map.has(uid)) {
      map.set(uid, {
        userId: uid,
        email: cb.email || "",
        name: cb.name || "",
        label: (cb.name || cb.email || uid).trim(),
        ...emptyStatusCounts()
      });
    }
    const raw = item.status;
    const st = raw && JOB_STATUSES.includes(raw) ? raw : "Saved";
    const row = map.get(uid);
    row[st]++;
  }
  return [...map.values()].sort((a, b) => {
    const ta = JOB_STATUSES.reduce((s, k) => s + a[k], 0);
    const tb = JOB_STATUSES.reduce((s, k) => s + b[k], 0);
    return tb - ta;
  });
}

/** Team-wide totals per status. */
export function totalStatusCounts(links) {
  const t = emptyStatusCounts();
  for (const item of links) {
    const raw = item.status;
    const st = raw && JOB_STATUSES.includes(raw) ? raw : "Saved";
    t[st]++;
  }
  return t;
}

/**
 * Normalize API `byUserStatus` or link-built rows for charts (label + status counts).
 * @param {Array<Record<string, unknown>>} rows
 */
export function toStackedChartRows(rows) {
  if (!rows?.length) return [];
  return rows.map((r) => {
    const labelRaw = (r.name || r.email || r.userId || "").trim();
    const label = labelRaw.length > 22 ? `${labelRaw.slice(0, 20)}…` : labelRaw || "—";
    const full = r.name ? `${r.name}${r.email ? ` (${r.email})` : ""}`.trim() : r.email || labelRaw;
    const out = { label, full: full || label };
    for (const s of JOB_STATUSES) {
      out[s] = typeof r[s] === "number" ? r[s] : 0;
    }
    return out;
  });
}

export function totalsFromStackedRows(rows) {
  const t = emptyStatusCounts();
  for (const r of rows) {
    for (const s of JOB_STATUSES) {
      t[s] += r[s] || 0;
    }
  }
  return t;
}
