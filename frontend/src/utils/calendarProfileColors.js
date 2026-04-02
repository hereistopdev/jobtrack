/**
 * Fixed palette (36) for job profile calendar colors — keep in sync with
 * `backend/src/utils/jobProfiles.js` CALENDAR_PROFILE_COLOR_PALETTE.
 */
export const CALENDAR_PROFILE_COLOR_PALETTE = [
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#64748b",
  "#6b7280",
  "#71717a",
  "#78716c",
  "#737373",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#ca8a04",
  "#65a30d",
  "#16a34a",
  "#059669",
  "#0d9488",
  "#0891b2",
  "#0284c7",
  "#2563eb",
  "#4f46e5",
  "#7c3aed",
  "#9333ea"
];

const PALETTE_SET = new Set(CALENDAR_PROFILE_COLOR_PALETTE);

export const DEFAULT_CALENDAR_PROFILE_COLOR = CALENDAR_PROFILE_COLOR_PALETTE[0];

function normalizeHexColor(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

function hexToRgb(hex) {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  const x = parseInt(n.slice(1), 16);
  return { r: (x >> 16) & 255, g: (x >> 8) & 255, b: x & 255 };
}

/** Map legacy/off-palette hex to the allowed palette; null if input empty/invalid. */
export function coerceCalendarProfileColor(input) {
  if (input == null || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const n = normalizeHexColor(trimmed);
  if (n && PALETTE_SET.has(n)) return n;
  const rgb = hexToRgb(trimmed);
  if (!rgb) return null;
  let best = CALENDAR_PROFILE_COLOR_PALETTE[0];
  let bestD = Infinity;
  for (const c of CALENDAR_PROFILE_COLOR_PALETTE) {
    const r = hexToRgb(c);
    if (!r) continue;
    const d = (rgb.r - r.r) ** 2 + (rgb.g - r.g) ** 2 + (rgb.b - r.b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
