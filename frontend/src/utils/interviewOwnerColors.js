/**
 * Calendar block colors by interview subject (owner): teammate the interview is for.
 * Uses subjectUserId when set, else normalized subjectName.
 */

/** Distinct, readable gradients (border + title text tuned for contrast). */
export const DEFAULT_OWNER_COLOR = {
  border: "#2563eb",
  bg1: "#eff6ff",
  bg2: "#bfdbfe",
  title: "#1e3a8a"
};

const PALETTE = [
  { border: "#2563eb", bg1: "#eff6ff", bg2: "#bfdbfe", title: "#1e3a8a" },
  { border: "#059669", bg1: "#ecfdf5", bg2: "#a7f3d0", title: "#065f46" },
  { border: "#d97706", bg1: "#fffbeb", bg2: "#fde68a", title: "#92400e" },
  { border: "#7c3aed", bg1: "#f5f3ff", bg2: "#ddd6fe", title: "#5b21b6" },
  { border: "#db2777", bg1: "#fdf2f8", bg2: "#fbcfe8", title: "#9d174d" },
  { border: "#0891b2", bg1: "#ecfeff", bg2: "#a5f3fc", title: "#155e75" },
  { border: "#4f46e5", bg1: "#eef2ff", bg2: "#c7d2fe", title: "#312e81" },
  { border: "#65a30d", bg1: "#f7fee7", bg2: "#d9f99d", title: "#3f6212" },
  { border: "#c2410c", bg1: "#fff7ed", bg2: "#fed7aa", title: "#9a3412" },
  { border: "#0d9488", bg1: "#f0fdfa", bg2: "#99f6e4", title: "#115e59" },
  { border: "#9333ea", bg1: "#faf5ff", bg2: "#e9d5ff", title: "#6b21a8" },
  { border: "#e11d48", bg1: "#fff1f2", bg2: "#fecdd3", title: "#9f1239" },
  { border: "#ca8a04", bg1: "#fefce8", bg2: "#fef08a", title: "#854d0e" },
  { border: "#0284c7", bg1: "#f0f9ff", bg2: "#bae6fd", title: "#0c4a6e" },
  { border: "#be123c", bg1: "#fff1f2", bg2: "#fecaca", title: "#881337" }
];

export function ownerKey(ev) {
  const su = ev.subjectUserId;
  if (su != null && su !== "") {
    if (typeof su === "object" && su._id != null) return `user:${String(su._id)}`;
    return `user:${String(su)}`;
  }
  const name = (ev.subjectName || "").trim().toLowerCase();
  return `name:${name || "unknown"}`;
}

/**
 * @param {Array<Record<string, unknown>>} rows - interview records
 * @returns {{ colorByKey: Map<string, object>, labelByKey: Map<string, string>, orderedKeys: string[] }}
 */
export function buildOwnerPaletteMaps(rows) {
  if (!rows?.length) {
    return { colorByKey: new Map(), labelByKey: new Map(), orderedKeys: [] };
  }
  const seen = new Set();
  const orderedKeys = [];
  for (const ev of rows) {
    const k = ownerKey(ev);
    if (!seen.has(k)) {
      seen.add(k);
      orderedKeys.push(k);
    }
  }
  orderedKeys.sort((a, b) => {
    const la = labelForSort(rows, a);
    const lb = labelForSort(rows, b);
    return la.localeCompare(lb, undefined, { sensitivity: "base" });
  });

  const colorByKey = new Map();
  const labelByKey = new Map();
  orderedKeys.forEach((k, i) => {
    colorByKey.set(k, PALETTE[i % PALETTE.length]);
    const row = rows.find((r) => ownerKey(r) === k);
    labelByKey.set(k, (row?.subjectName || "").trim() || k);
  });
  return { colorByKey, labelByKey, orderedKeys };
}

function labelForSort(rows, key) {
  const row = rows.find((r) => ownerKey(r) === key);
  return (row?.subjectName || "").trim() || key;
}
