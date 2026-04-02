import { User } from "../models/User.js";
import { jobProfilesResolved } from "./jobProfiles.js";

/**
 * Attach `profileColorHex` for calendar UI (per interview, from subject's job profile).
 * @param {object[]} rows - lean interview docs (subjectUserId may be populated object)
 */
export async function enrichCalendarInterviewsWithProfileColor(rows) {
  if (!rows?.length) return rows;

  const subjectIds = new Set();
  for (const r of rows) {
    const su = r.subjectUserId;
    if (!su) continue;
    const id = typeof su === "object" && su._id != null ? su._id : su;
    const s = id != null ? String(id) : "";
    if (s) subjectIds.add(s);
  }

  if (subjectIds.size === 0) {
    return rows.map((r) => ({ ...r, profileColorHex: null }));
  }

  const users = await User.find({ _id: { $in: [...subjectIds] } })
    .select("jobProfiles interviewProfiles")
    .lean();
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  return rows.map((r) => {
    const su = r.subjectUserId;
    if (!su) return { ...r, profileColorHex: null };
    const sid = typeof su === "object" && su._id != null ? su._id.toString() : String(su);
    const u = byId.get(sid);
    const profiles = jobProfilesResolved(u);
    if (!profiles.length) return { ...r, profileColorHex: null };

    let hex = null;
    if (r.jobProfileId) {
      const pid = r.jobProfileId.toString ? r.jobProfileId.toString() : String(r.jobProfileId);
      const jp = profiles.find((p) => p._id && p._id.toString() === pid);
      if (jp) hex = jp.calendarColor;
    }
    if (!hex && r.profile) {
      const jp = profiles.find((p) => (p.label || "").toLowerCase() === String(r.profile).trim().toLowerCase());
      if (jp) hex = jp.calendarColor;
    }
    return { ...r, profileColorHex: hex };
  });
}
