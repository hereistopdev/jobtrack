/** Canonical interview round labels (index matches stored digit 0–4 for legacy rows). */
export const INTERVIEW_STAGE_LABELS = ["Phone", "Intro", "Tech 1", "Tech 2", "Final"];

/**
 * Map free-form `interviewType` to a stage badge for the calendar.
 * Accepts numeric rounds (1, 2, 3…), "tech" / "final" (e.g. from calendar sync),
 * "0"–"4" for legacy stage indices, canonical names, or common phrases.
 * @param {string | undefined | null} interviewType
 * @returns {{ index: number; label: string } | null}
 */
export function getInterviewStageBadge(interviewType) {
  const raw = String(interviewType ?? "").trim();
  if (!raw) return null;
  const spaced = raw.replace(/\s+/g, " ");
  const lower = spaced.toLowerCase();

  // Calendar sync / job board: plain round counters (1, 2, 3, 10…)
  if (/^[1-9]\d*$/.test(lower)) {
    return { index: 7, label: raw };
  }

  if (lower === "tech") {
    return { index: 3, label: "Tech" };
  }
  if (lower === "final") {
    return { index: 4, label: "Final" };
  }

  for (let i = 0; i < INTERVIEW_STAGE_LABELS.length; i++) {
    if (lower === INTERVIEW_STAGE_LABELS[i].toLowerCase()) {
      return { index: i, label: INTERVIEW_STAGE_LABELS[i] };
    }
  }

  if (lower === "0") {
    return { index: 0, label: INTERVIEW_STAGE_LABELS[0] };
  }

  // Order: more specific patterns first (e.g. Tech 2 before Tech 1).
  const rules = [
    [/\btech(?:nical)?\s*2\b|^tech2$/i, 3],
    [/\btech(?:nical)?\s*1\b|^tech1$/i, 2],
    [/\bfinal\b|\blast\s*round\b|\bexec(?:utive)?\b/i, 4],
    [/\bintro\b|\bintroduction\b|\bhm\s*intro\b/i, 1],
    [/\bphone\b|\bscreen(?:ing)?\b|\brecruiter\b/i, 0]
  ];
  for (const [re, idx] of rules) {
    if (re.test(spaced)) {
      return { index: idx, label: INTERVIEW_STAGE_LABELS[idx] };
    }
  }

  return null;
}
