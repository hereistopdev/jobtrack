/** Canonical interview round labels (index matches stored digit 0–4). */
export const INTERVIEW_STAGE_LABELS = ["Phone", "Intro", "Tech 1", "Tech 2", "Final"];

/**
 * Map free-form `interviewType` to a stage badge for the calendar.
 * Accepts "0"–"4", exact canonical names (case-insensitive), or common phrases.
 * @param {string | undefined | null} interviewType
 * @returns {{ index: number; label: string } | null}
 */
export function getInterviewStageBadge(interviewType) {
  const raw = String(interviewType ?? "").trim();
  if (!raw) return null;
  const spaced = raw.replace(/\s+/g, " ");
  const lower = spaced.toLowerCase();

  if (/^[0-4]$/.test(lower)) {
    const i = Number(lower);
    return { index: i, label: INTERVIEW_STAGE_LABELS[i] };
  }

  for (let i = 0; i < INTERVIEW_STAGE_LABELS.length; i++) {
    if (lower === INTERVIEW_STAGE_LABELS[i].toLowerCase()) {
      return { index: i, label: INTERVIEW_STAGE_LABELS[i] };
    }
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
