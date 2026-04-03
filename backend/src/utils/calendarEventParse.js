/**
 * Parse ICS VEVENT summary/description into company, role title, and display title.
 * Best-effort for common recruiter/calendar patterns.
 */

function collapseWs(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {string} summary
 * @param {string} description
 * @param {string} [location]
 * @returns {{ company: string; roleTitle: string; subjectName: string }}
 */
export function parseCalendarEventFields(summary, description, location) {
  const sum = collapseWs(summary) || "Interview";
  const desc = String(description || "");
  const loc = collapseWs(location);

  let company = "";
  let roleTitle = "";

  const lineMatch = (text, re) => {
    const m = text.match(re);
    return m ? collapseWs(m[1]) : "";
  };

  company =
    lineMatch(desc, /(?:^|[\n\r])[\s]*(?:company|organization|employer|org)\s*:\s*([^\n\r]+)/i) ||
    lineMatch(sum, /\b(?:at|@)\s+([^|]+?)\s*(?:\||$)/i);

  const roleFromDesc = lineMatch(desc, /(?:^|[\n\r])[\s]*(?:role|position|title|job)\s*:\s*([^\n\r]+)/i);
  if (roleFromDesc) roleTitle = roleFromDesc;

  if (!company) {
    const withCo = sum.match(/\b(?:with|from)\s+([A-Za-z0-9][^,|]+?)\s*(?:\||-|$)/i);
    if (withCo) company = collapseWs(withCo[1]);
  }

  if (!company && sum.includes("@")) {
    const parts = sum.split("@").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      company = parts[parts.length - 1];
      if (!roleTitle) roleTitle = parts.slice(0, -1).join(" @ ");
    }
  }

  if (!company) {
    const bits = sum.split(/\s*[-–|]\s+/).map((b) => b.trim()).filter(Boolean);
    if (bits.length >= 2) {
      company = bits[0];
      if (!roleTitle) roleTitle = bits.slice(1).join(" - ");
    }
  }

  if (!company) {
    company = sum.slice(0, 120) || "Interview";
  }

  if (!roleTitle) {
    roleTitle = sum !== company ? sum : loc ? `Interview — ${loc.slice(0, 80)}` : "Interview";
  }

  return {
    company: company.slice(0, 200),
    roleTitle: roleTitle.slice(0, 200),
    subjectName: sum.slice(0, 200)
  };
}

/**
 * Map how many earlier interviews this user already had with the same company
 * (by scheduled time) to a round label: 1, 2, 3, then tech, final.
 * @param {number} priorCount — rows with same company strictly before this slot (excluding self)
 */
export function interviewTypeFromPriorCompanyCount(priorCount) {
  const n = Math.max(0, Math.floor(Number(priorCount)) || 0);
  if (n === 0) return "1";
  if (n === 1) return "2";
  if (n === 2) return "3";
  if (n === 3) return "tech";
  return "final";
}
