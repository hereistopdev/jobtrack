import mongoose from "mongoose";

/**
 * Fixed palette (36) for job profile calendar colors — team calendar uses these only.
 * Keep in sync with `frontend/src/utils/calendarProfileColors.js`.
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

/** @deprecated Use CALENDAR_PROFILE_COLOR_PALETTE */
export const DEFAULT_PROFILE_HEX_PALETTE = CALENDAR_PROFILE_COLOR_PALETTE;

const PALETTE_SET = new Set(CALENDAR_PROFILE_COLOR_PALETTE);

function hexToRgb(hex) {
  const n = normalizeHexColor(hex);
  if (!n) return null;
  const x = parseInt(n.slice(1), 16);
  return { r: (x >> 16) & 255, g: (x >> 8) & 255, b: x & 255 };
}

export function normalizeHexColor(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

/**
 * Map any stored/legacy hex to the allowed 36-color palette (exact match or nearest RGB).
 * Returns null if input is missing/empty so callers can apply index-based defaults.
 */
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

/**
 * If user still has legacy `interviewProfiles` strings but no `jobProfiles`, seed subdocuments.
 * @param {import("mongoose").Document} user - mongoose User document
 * @returns {Promise<boolean>} true if migration was applied (saved)
 */
export async function migrateJobProfilesIfNeeded(user) {
  if (!user) return false;
  const hasJobs = Array.isArray(user.jobProfiles) && user.jobProfiles.length > 0;
  if (hasJobs) return false;
  const labels = user.interviewProfiles || [];
  if (!Array.isArray(labels) || labels.length === 0) return false;

  const cleaned = [...new Set(labels.map((s) => String(s ?? "").trim()).filter(Boolean))].slice(0, 40);
  user.jobProfiles = cleaned.map((label, i) => ({
    label,
    calendarColor: CALENDAR_PROFILE_COLOR_PALETTE[i % CALENDAR_PROFILE_COLOR_PALETTE.length]
  }));
  user.interviewProfiles = cleaned;
  user.markModified("jobProfiles");
  await user.save();
  return true;
}

/**
 * Resolve profile list for API / calendar (includes in-memory fallback from legacy interviewProfiles).
 * @param {object} u - lean or doc user
 */
export function jobProfilesResolved(u) {
  if (!u) return [];
  const jp = u.jobProfiles;
  if (Array.isArray(jp) && jp.length > 0) {
    return jp.map((p, i) => ({
      ...p,
      calendarColor:
        coerceCalendarProfileColor(p.calendarColor) ??
        CALENDAR_PROFILE_COLOR_PALETTE[i % CALENDAR_PROFILE_COLOR_PALETTE.length]
    }));
  }
  const legacy = u.interviewProfiles || [];
  if (!Array.isArray(legacy) || legacy.length === 0) return [];
  return legacy.map((label, i) => ({
    _id: null,
    label: String(label).trim(),
    calendarColor: CALENDAR_PROFILE_COLOR_PALETTE[i % CALENDAR_PROFILE_COLOR_PALETTE.length]
  }));
}

function trimField(v, max) {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

export function sanitizeExperiences(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).map((e) => ({
    title: trimField(e?.title, 200),
    company: trimField(e?.company, 200),
    location: trimField(e?.location, 200),
    startDate: trimField(e?.startDate, 80),
    endDate: trimField(e?.endDate, 80),
    description: trimField(e?.description, 8000)
  }));
}

export function sanitizeUniversities(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((u) => ({
    name: trimField(u?.name, 200),
    degree: trimField(u?.degree, 200),
    field: trimField(u?.field, 200),
    year: trimField(u?.year, 40),
    notes: trimField(u?.notes, 2000)
  }));
}

/**
 * Serialize one job profile for API (owner). Omits file keys from nested docs — use download endpoints.
 */
export function mapJobProfileToClient(p, index) {
  const overview = p.overview || p.summary || "";
  return {
    id: p._id.toString(),
    label: p.label,
    calendarColor:
      coerceCalendarProfileColor(p.calendarColor) ??
      CALENDAR_PROFILE_COLOR_PALETTE[index % CALENDAR_PROFILE_COLOR_PALETTE.length],
    summary: p.summary || "",
    overview,
    fullName: p.fullName || "",
    addressLine: p.addressLine || "",
    country: p.country || "",
    taxId: p.taxId || "",
    resumeText: p.resumeText || "",
    resumeUrl: p.resumeUrl || "",
    technologies: p.technologies || "",
    experiences: Array.isArray(p.experiences) ? p.experiences : [],
    universities: Array.isArray(p.universities) ? p.universities : [],
    notes: p.notes || "",
    resumeFile: p.resumeFile
      ? {
          originalName: p.resumeFile.originalName || "",
          mimeType: p.resumeFile.mimeType || "",
          uploadedAt: p.resumeFile.uploadedAt,
          parsedTextLength: p.resumeFile.parsedTextLength ?? 0
        }
      : null,
    idDocuments: (p.idDocuments || []).map((d) => ({
      id: d._id.toString(),
      kind: d.kind,
      originalName: d.originalName || "",
      mimeType: d.mimeType || "",
      uploadedAt: d.uploadedAt
    })),
    otherDocuments: (p.otherDocuments || []).map((d) => ({
      id: d._id.toString(),
      category: d.category,
      label: d.label || "",
      originalName: d.originalName || "",
      mimeType: d.mimeType || "",
      uploadedAt: d.uploadedAt
    }))
  };
}

/**
 * Apply full replacement of job profiles from client payload.
 * File attachments are preserved from existing subdocs when the profile id matches (uploads are separate routes).
 */
export function applyIncomingJobProfiles(user, incoming) {
  if (!Array.isArray(incoming)) return;
  const existingById = new Map((user.jobProfiles || []).map((p) => [p._id.toString(), p]));
  const next = [];
  for (const raw of incoming.slice(0, 40)) {
    const label = String(raw.label ?? "").trim().slice(0, 120);
    if (!label) continue;
    const color =
      coerceCalendarProfileColor(raw.calendarColor) ||
      CALENDAR_PROFILE_COLOR_PALETTE[next.length % CALENDAR_PROFILE_COLOR_PALETTE.length];
    const idStr =
      raw.id != null && mongoose.Types.ObjectId.isValid(String(raw.id)) ? String(raw.id) : null;
    const prev = idStr ? existingById.get(idStr) : null;
    const preservedFiles = prev
      ? {
          resumeFile: prev.resumeFile ?? null,
          idDocuments: Array.isArray(prev.idDocuments) ? prev.idDocuments : [],
          otherDocuments: Array.isArray(prev.otherDocuments) ? prev.otherDocuments : []
        }
      : { resumeFile: null, idDocuments: [], otherDocuments: [] };

    let overviewStr = "";
    if (Object.prototype.hasOwnProperty.call(raw, "overview")) {
      overviewStr = raw.overview != null ? String(raw.overview) : "";
    } else if (prev) {
      overviewStr = prev.overview || prev.summary || "";
    } else {
      overviewStr = raw.summary != null ? String(raw.summary) : "";
    }
    const extra = {
      summary: trimField(raw.summary, 4000),
      overview: trimField(overviewStr, 16000),
      fullName: trimField(raw.fullName, 200),
      addressLine: trimField(raw.addressLine, 500),
      country: trimField(raw.country, 120),
      taxId: trimField(raw.taxId, 32),
      resumeText: trimField(raw.resumeText, 50000),
      resumeUrl: trimField(raw.resumeUrl, 2000),
      technologies: trimField(raw.technologies, 4000),
      experiences: sanitizeExperiences(raw.experiences),
      universities: sanitizeUniversities(raw.universities),
      notes: trimField(raw.notes, 8000),
      ...preservedFiles
    };
    if (idStr) {
      next.push({ _id: new mongoose.Types.ObjectId(idStr), label, calendarColor: color, ...extra });
    } else {
      next.push({ label, calendarColor: color, ...extra });
    }
  }
  const seen = new Set();
  const deduped = [];
  for (const p of next) {
    const k = p.label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(p);
  }
  user.jobProfiles = deduped;
  user.interviewProfiles = deduped.map((p) => p.label);
  user.markModified("jobProfiles");
}
