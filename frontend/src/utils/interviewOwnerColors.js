/**
 * Calendar block colors:
 * - **User palette** (`buildUserColorPalette`): one fixed gradient per interview subject user (stable hash).
 * - **Legacy** (`buildOwnerPaletteMaps` / old `eventCalendarStyle`): profile-hex or per–legend-key palette.
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

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((x) => Math.max(0, Math.min(255, x | 0)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t)
  };
}

/** Build calendar gradient style from a profile hex color (#rrggbb). */
export function hexToCalendarStyle(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_OWNER_COLOR;
  const white = { r: 255, g: 255, b: 255 };
  const bg1 = mixRgb(white, rgb, 0.12);
  const bg2 = mixRgb(white, rgb, 0.28);
  const title = mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.35);
  const border = String(hex).trim().startsWith("#") ? String(hex).trim().toLowerCase() : `#${String(hex).trim().toLowerCase()}`;
  return {
    border,
    bg1: rgbToHex(bg1.r, bg1.g, bg1.b),
    bg2: rgbToHex(bg2.r, bg2.g, bg2.b),
    title: rgbToHex(title.r, title.g, title.b)
  };
}

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
 * Stable key for **one color per teammate** on the calendar (interview subject).
 * Uses linked subject user when present; otherwise falls back to creator, then name.
 */
export function calendarUserColorKey(ev) {
  const su = ev.subjectUserId;
  if (su != null && su !== "") {
    const id = typeof su === "object" && su._id != null ? su._id : su;
    return `user:${String(id)}`;
  }
  const cb = ev.createdBy;
  if (cb != null && cb !== "") {
    const id = typeof cb === "object" && cb._id != null ? cb._id : cb;
    return `creator:${String(id)}`;
  }
  const name = (ev.subjectName || "").trim().toLowerCase();
  return `name:${name || "unknown"}`;
}

function stableHashString(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

/**
 * One fixed palette entry per distinct subject user in `rows` (order-stable, hash-based color).
 * @returns {{ colorByUserKey: Map<string, typeof DEFAULT_OWNER_COLOR>, orderedUserKeys: string[] }}
 */
export function buildUserColorPalette(rows) {
  if (!rows?.length) {
    return { colorByUserKey: new Map(), orderedUserKeys: [] };
  }
  const seen = new Set();
  const orderedUserKeys = [];
  for (const ev of rows) {
    const k = calendarUserColorKey(ev);
    if (!seen.has(k)) {
      seen.add(k);
      orderedUserKeys.push(k);
    }
  }
  orderedUserKeys.sort((a, b) => a.localeCompare(b));

  const colorByUserKey = new Map();
  for (const k of orderedUserKeys) {
    const idx = stableHashString(k) % PALETTE.length;
    colorByUserKey.set(k, PALETTE[idx]);
  }
  return { colorByUserKey, orderedUserKeys };
}

/** Stable key for legend + palette: subject + profile when linked, else owner-only. */
export function calendarLegendKey(ev) {
  const hex = typeof ev.profileColorHex === "string" ? ev.profileColorHex.trim().toLowerCase() : "";
  if (/^#[0-9a-f]{6}$/.test(hex)) {
    return `hex:${hex}`;
  }
  const su = ev.subjectUserId;
  const uid =
    su != null && su !== ""
      ? typeof su === "object" && su._id != null
        ? String(su._id)
        : String(su)
      : "";
  const pid = ev.jobProfileId != null ? String(ev.jobProfileId) : "";
  const prof = (ev.profile || "").trim().toLowerCase();
  if (uid && (pid || prof)) return `u:${uid}:p:${pid || prof}`;
  return ownerKey(ev);
}

function legendLabel(ev) {
  const name = (ev.subjectName || "").trim() || "Interview";
  const prof = (ev.profile || "").trim();
  if (prof) return `${name} — ${prof}`;
  return name;
}

/**
 * @param {Array<Record<string, unknown>>} rows - interview records (calendar rows may include profileColorHex)
 * @returns {{ colorByKey: Map<string, object>, labelByKey: Map<string, string>, orderedKeys: string[] }}
 */
export function buildOwnerPaletteMaps(rows) {
  if (!rows?.length) {
    return { colorByKey: new Map(), labelByKey: new Map(), orderedKeys: [] };
  }
  const seen = new Set();
  const orderedKeys = [];
  for (const ev of rows) {
    const k = calendarLegendKey(ev);
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
  let paletteIdx = 0;
  for (const k of orderedKeys) {
    const row = rows.find((r) => calendarLegendKey(r) === k);
    const hex = row && typeof row.profileColorHex === "string" ? row.profileColorHex.trim() : "";
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      colorByKey.set(k, hexToCalendarStyle(hex));
    } else {
      colorByKey.set(k, PALETTE[paletteIdx % PALETTE.length]);
      paletteIdx += 1;
    }
    labelByKey.set(k, legendLabel(row || {}));
  }
  return { colorByKey, labelByKey, orderedKeys };
}

/**
 * @param ev - interview row
 * @param palette - from `buildUserColorPalette` (has `colorByUserKey`) or legacy `buildOwnerPaletteMaps` (has `colorByKey`)
 */
export function eventCalendarStyle(ev, palette) {
  if (palette?.colorByUserKey) {
    const k = calendarUserColorKey(ev);
    return palette.colorByUserKey.get(k) || DEFAULT_OWNER_COLOR;
  }
  const hex = typeof ev.profileColorHex === "string" ? ev.profileColorHex.trim() : "";
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return hexToCalendarStyle(hex);
  }
  return palette.colorByKey.get(calendarLegendKey(ev)) || DEFAULT_OWNER_COLOR;
}

function labelForSort(rows, key) {
  const row = rows.find((r) => calendarLegendKey(r) === key);
  return legendLabel(row || {});
}
