import { JobLink } from "../models/JobLink.js";

/**
 * Canonical URL for duplicate detection (host + path + query, no hash, trim slashes).
 */
export function normalizeJobUrl(urlString) {
  if (!urlString || typeof urlString !== "string") return "";
  try {
    const u = new URL(urlString.trim());
    u.hash = "";
    const host = u.hostname.toLowerCase();
    let path = u.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const search = u.search || "";
    return `${u.protocol}//${host}${path}${search}`.toLowerCase();
  } catch {
    return urlString.trim().toLowerCase();
  }
}

export function normalizeTitle(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeCountry(s) {
  return (s || "").trim().toLowerCase();
}

export function normalizeCompany(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function addedByLabel(user) {
  if (!user) return "Someone";
  if (user.name && user.email) return `${user.name} (${user.email})`;
  return user.email || user.name || "Someone";
}

/**
 * Duplicate when the same **company** and **job URL** as an existing row (both normalized).
 * Does not treat “same URL, different company” or “same company, different URL” as duplicates.
 *
 * @returns {Promise<{ reason: 'same_company_and_link', doc: object } | null>}
 */
export async function findDuplicateJobLink({ link, company, excludeId }) {
  const normLink = normalizeJobUrl(link);
  const normCompany = normalizeCompany(company);

  if (!normLink || !normCompany) {
    return null;
  }

  const filter = excludeId ? { _id: { $ne: excludeId } } : {};
  const candidates = await JobLink.find(filter).populate("createdBy", "email name");

  for (const c of candidates) {
    if (normalizeJobUrl(c.link) === normLink && normalizeCompany(c.company) === normCompany) {
      return { reason: "same_company_and_link", doc: c };
    }
  }

  return null;
}

export function formatDuplicateResponse(dup) {
  const u = dup.doc.createdBy;
  return {
    message: "This job posting may already be on the board",
    duplicateReason: dup.reason,
    addedBy: u
      ? { email: u.email, name: u.name || "" }
      : { email: "", name: "" },
    addedByLabel: addedByLabel(u),
    existingId: dup.doc._id.toString()
  };
}
