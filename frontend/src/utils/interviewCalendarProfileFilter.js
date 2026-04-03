/**
 * Per–job-profile visibility on the interview calendar (checkbox list).
 * Keys group by subject user + job profile (id or legacy profile label).
 */

export function subjectUserIdPart(ev) {
  const su = ev.subjectUserId;
  if (su != null && su !== "") {
    return typeof su === "object" && su._id != null ? String(su._id) : String(su);
  }
  const cb = ev.createdBy;
  if (cb != null && cb !== "") {
    return `creator:${typeof cb === "object" && cb._id != null ? String(cb._id) : String(cb)}`;
  }
  return "unknown";
}

/** Stable id for one row in the profile filter checklist. */
export function profileVisibilityKey(ev) {
  const uid = subjectUserIdPart(ev);
  const jp = ev.jobProfileId != null && String(ev.jobProfileId).trim() !== "" ? String(ev.jobProfileId) : "";
  const prof = (ev.profile || "").trim().toLowerCase();
  const part = jp || (prof ? `l:${prof}` : "none");
  return `${uid}::${part}`;
}

export function profileFilterLabel(ev) {
  const su = ev.subjectUserId;
  let name = (ev.subjectName || "").trim();
  if (su && typeof su === "object") {
    name = su.name || su.email || name;
  }
  if (!name) name = "—";
  const p = (ev.profile || "").trim();
  return p ? `${name} — ${p}` : `${name} — (no profile)`;
}

export function profileSwatchHex(ev) {
  const hex = typeof ev.profileColorHex === "string" ? ev.profileColorHex.trim() : "";
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  return "#94a3b8";
}

/**
 * @param {Record<string, unknown>[]} rows
 * @returns {{ key: string; label: string; swatchHex: string }[]}
 */
export function buildProfileFilterOptions(rows) {
  if (!rows?.length) return [];
  const m = new Map();
  for (const ev of rows) {
    const key = profileVisibilityKey(ev);
    if (m.has(key)) continue;
    m.set(key, {
      key,
      label: profileFilterLabel(ev),
      swatchHex: profileSwatchHex(ev)
    });
  }
  return [...m.values()].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
  );
}
