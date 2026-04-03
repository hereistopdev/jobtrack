/**
 * Naive 0–100 ATS-style score from plain resume text (length, structure hints, contact signals).
 * Not a substitute for real ATS products; useful as a relative indicator after upload.
 */
export function computeResumeAtsScore(text) {
  const t = String(text || "").trim();
  if (!t.length) return null;
  const lower = t.toLowerCase();
  const words = t.split(/\s+/).filter(Boolean).length;

  let score = 28;
  if (words > 120) score += 8;
  if (words > 350) score += 10;
  if (words > 700) score += 8;

  const sectionHints = [
    /experience|employment|work history|professional experience/,
    /education|university|degree|academic/,
    /skills|technical skills|competenc/,
    /summary|objective|profile|about/
  ];
  for (const re of sectionHints) {
    if (re.test(lower)) score += 6;
  }

  if (/\b[\w.%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(t)) score += 8;
  if (/linkedin\.com\/in\//i.test(t)) score += 8;
  if (/\b(?:\+?\d[\d\s().-]{8,}\d)\b/.test(t)) score += 4;
  if (/^\s*#+\s/m.test(t) || lower.includes("##")) score += 4;

  return Math.max(0, Math.min(100, Math.round(score)));
}
