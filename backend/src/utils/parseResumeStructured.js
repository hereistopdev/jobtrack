/**
 * Heuristic extraction of experience and education blocks from plain resume text.
 * Works best when sections use common headings (Experience, Education, etc.).
 */

function isExpHeader(l) {
  return /^(work\s+)?experience|employment(\s+history)?|professional\s+experience|career(\s+history)?$/i.test(
    l.trim()
  );
}

function isEduHeader(l) {
  return /^education|academic(\s+background)?|qualifications$/i.test(l.trim());
}

/** Stops scanning when another major section starts */
function isSectionBreak(l) {
  const t = l.trim();
  return (
    isExpHeader(t) ||
    isEduHeader(t) ||
    /^(skills?|technical\s+skills?|projects?|certifications?|publications?|awards?|references?|languages?|summary|objective|profile|contact|interests)$/i.test(
      t
    )
  );
}

function blockFrom(lines, startIdx) {
  if (startIdx < 0 || startIdx >= lines.length) return [];
  const out = [];
  for (let i = startIdx; i < lines.length; i++) {
    if (isSectionBreak(lines[i]) && out.length > 0) break;
    out.push(lines[i]);
  }
  return out;
}

function sliceBetween(lines, a, b) {
  if (a < 0 || b < 0 || a >= b) return [];
  return lines.slice(a, b);
}

/**
 * @param {string} fullText
 * @returns {{ experiences: object[], universities: object[] }}
 */
export function parseResumeStructured(fullText) {
  const raw = String(fullText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let iExp = lines.findIndex(isExpHeader);
  let iEdu = lines.findIndex(isEduHeader);

  let expLines = [];
  let eduLines = [];

  if (iExp >= 0 && iEdu >= 0) {
    if (iExp < iEdu) {
      expLines = sliceBetween(lines, iExp + 1, iEdu);
      eduLines = blockFrom(lines, iEdu + 1);
    } else {
      eduLines = sliceBetween(lines, iEdu + 1, iExp);
      expLines = blockFrom(lines, iExp + 1);
    }
  } else if (iExp >= 0) {
    expLines = blockFrom(lines, iExp + 1);
  } else if (iEdu >= 0) {
    eduLines = blockFrom(lines, iEdu + 1);
  }

  return {
    experiences: parseExperienceLines(expLines),
    universities: parseEducationLines(eduLines)
  };
}

function parseExperienceLines(lines) {
  if (!lines.length) return [];
  const text = lines.join("\n");
  /** Split on blank lines, or before a line that looks like "Role at Company" */
  const rawChunks = text
    .split(/\n\s*\n|\n(?=[^\n]{2,120}\s+at\s+[^\n]+)/i)
    .map((c) => c.trim())
    .filter(Boolean);
  const parsed = rawChunks.map(parseExpChunk).filter(Boolean);
  return parsed.slice(0, 30);
}

const DATE_RANGE_RE =
  /(\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{0,4})\s*[-–—]\s*(\d{4}|Present|Current|Now)/i;

function parseExpChunk(chunk) {
  const ls = chunk.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!ls.length) return null;

  let title = "";
  let company = "";
  let location = "";
  let startDate = "";
  let endDate = "";
  const first = ls[0];

  if (/\s+at\s+/i.test(first)) {
    const m = first.match(/^(.+?)\s+at\s+(.+)$/i);
    if (m) {
      title = m[1].trim();
      company = m[2].trim();
    } else {
      title = first;
    }
  } else if (/[|•]/.test(first)) {
    const parts = first.split(/\s*[|•]\s*/);
    title = (parts[0] || "").trim();
    company = (parts[1] || "").trim();
  } else {
    title = first;
    if (ls[1] && ls[1].length < 120 && !DATE_RANGE_RE.test(ls[1]) && !/^[-•*]/.test(ls[1])) {
      company = ls[1];
    }
  }

  const joined = ls.join(" ");
  const dm = joined.match(DATE_RANGE_RE);
  if (dm) {
    startDate = dm[1].trim();
    endDate = dm[2].trim();
  }

  const locMatch = joined.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/);
  if (locMatch) {
    location = `${locMatch[1]}, ${locMatch[2]}`;
  }

  let descStart = 1;
  if (company && ls[1] === company) {
    descStart = 2;
  }
  const description = ls.slice(descStart).join("\n").slice(0, 8000);

  if (!title && !company && !description) return null;
  return { title, company, location, startDate, endDate, description };
}

function parseEducationLines(lines) {
  if (!lines.length) return [];
  const text = lines.join("\n");
  const chunks = text
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter(Boolean);
  const parsed = chunks.map(parseEduChunk).filter(Boolean);
  return parsed.slice(0, 20);
}

function parseEduChunk(chunk) {
  const ls = chunk.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!ls.length) return null;

  const name = ls[0].slice(0, 200);
  const rest = ls.slice(1).join(" ");
  const full = `${name} ${rest}`;

  const yearMatch = full.match(/\b(19|20)\d{2}\b/g);
  const year = yearMatch ? yearMatch[yearMatch.length - 1] : "";

  const degMatch = full.match(
    /(Bachelor(?:'s)?(?:\s+of\s+Science|\s+of\s+Arts)?|B\.?S\.?|B\.?A\.?|Master(?:'s)?|M\.?S\.?|M\.?A\.?|MBA|Ph\.?D\.?|Associate(?:'s)?|Diploma|Certificate)/i
  );
  const degree = degMatch ? degMatch[0] : "";

  let field = "";
  const inMatch = full.match(/\b(?:in|major:?)\s+([^,.;]+?)(?:,|\.|;|$)/i);
  if (inMatch) field = inMatch[1].trim().slice(0, 200);

  const notes = rest.slice(0, 2000);

  if (!name || name.length < 2) return null;
  return { name, degree, field, year, notes };
}
