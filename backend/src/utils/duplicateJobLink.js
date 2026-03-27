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

function addedByLabel(user) {
  if (!user) return "Someone";
  if (user.name && user.email) return `${user.name} (${user.email})`;
  return user.email || user.name || "Someone";
}

/**
 * @returns {Promise<{ reason: 'same_link' | 'same_country_and_role', doc: object } | null>}
 */
export async function findDuplicateJobLink({ link, title, country, excludeId }) {
  const normLink = normalizeJobUrl(link);
  const nt = normalizeTitle(title);
  const nc = normalizeCountry(country);

  const filter = excludeId ? { _id: { $ne: excludeId } } : {};
  const candidates = await JobLink.find(filter).populate("createdBy", "email name");

  for (const c of candidates) {
    if (normLink && normalizeJobUrl(c.link) === normLink) {
      return { reason: "same_link", doc: c };
    }
  }

  if (nc && nt) {
    for (const c of candidates) {
      const cCountry = normalizeCountry(c.country);
      if (!cCountry) continue;
      if (cCountry === nc && normalizeTitle(c.title) === nt) {
        return { reason: "same_country_and_role", doc: c };
      }
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
