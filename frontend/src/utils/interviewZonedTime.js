import { DateTime } from "luxon";

/** Default for interview calendar week grid (Pacific; uses PST/PDT automatically). */
export const CALENDAR_DEFAULT_TZ = "America/Los_Angeles";

const FALLBACK_ZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney"
];

export function getDefaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function getSortedTimeZones() {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    return Intl.supportedValuesOf("timeZone").slice().sort((a, b) => a.localeCompare(b));
  }
  return FALLBACK_ZONES.slice();
}

/**
 * Human-friendly label: UTC offset, optional short name (EST, PST…), IANA id.
 * @param {string} iana
 */
export function formatTimeZoneOptionLabel(iana) {
  if (!iana) return "";
  const dt = DateTime.now().setZone(iana);
  if (!dt.isValid) return iana;
  const offset = dt.toFormat("ZZ");
  const utcStr = `UTC${offset}`;

  let abbr = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: "short"
    }).formatToParts(new Date());
    abbr = (parts.find((p) => p.type === "timeZoneName")?.value || "").trim();
  } catch {
    abbr = "";
  }

  const looksLikeOffsetDup =
    !abbr ||
    /^GMT[+-]?\d/i.test(abbr) ||
    abbr.replace(/\s/g, "").toUpperCase() === utcStr.replace(/\s/g, "").toUpperCase();

  const abbrPart = looksLikeOffsetDup ? "" : ` (${abbr})`;
  return `${utcStr}${abbrPart} — ${iana}`;
}

/**
 * @param {string} dateTimeLocalStr - `YYYY-MM-DDTHH:mm` (datetime-local) meaning wall time in `zone`
 * @param {string} zone - IANA timezone
 * @returns {Date | null}
 */
export function zonedLocalStringToUtc(dateTimeLocalStr, zone) {
  if (!dateTimeLocalStr || typeof dateTimeLocalStr !== "string") return null;
  const z = zone || getDefaultTimeZone();
  const dt = DateTime.fromISO(dateTimeLocalStr, { zone: z });
  if (!dt.isValid) return null;
  return dt.toUTC().toJSDate();
}

/**
 * @param {string|Date} jsDate
 * @param {string} zone - IANA timezone
 */
export function utcToZonedLocalString(jsDate, zone) {
  if (!jsDate) return "";
  const d = new Date(jsDate);
  if (Number.isNaN(d.getTime())) return "";
  const z = zone || getDefaultTimeZone();
  const dt = DateTime.fromMillis(d.getTime(), { zone: "utc" }).setZone(z);
  if (!dt.isValid) return "";
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

/**
 * Monday 00:00 in `zone` for the calendar week containing `date`.
 * @param {Date|string|number} date
 * @param {string} zone - IANA
 */
export function startOfWeekMondayInZone(date, zone) {
  const d = DateTime.fromJSDate(date instanceof Date ? date : new Date(date)).setZone(zone);
  if (!d.isValid) return DateTime.now().setZone(zone).startOf("day");
  return d.startOf("day").minus({ days: d.weekday - 1 });
}
