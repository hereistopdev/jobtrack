import { DateTime } from "luxon";
import { formatTimeZoneOptionLabel } from "./interviewZonedTime";
import { getRegionalSearchTerms } from "./timeZoneAliases";

function intlTimeZoneName(iana, style) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      timeZoneName: style
    }).formatToParts(new Date());
    return (parts.find((p) => p.type === "timeZoneName")?.value || "").trim();
  } catch {
    return "";
  }
}

/**
 * Lowercase string used to match EST, PST, JST, UTC+4, IANA segments, etc.
 * @param {string} iana
 */
export function buildTimeZoneSearchBlob(iana) {
  const regional = getRegionalSearchTerms(iana);
  const dt = DateTime.now().setZone(iana);
  if (!dt.isValid) {
    return [(iana || "").toLowerCase(), regional].filter(Boolean).join(" ");
  }

  const label = formatTimeZoneOptionLabel(iana);
  const short = intlTimeZoneName(iana, "short");
  const long = intlTimeZoneName(iana, "long");
  const lastSeg = (iana.split("/").pop() || "").replace(/_/g, " ");
  const zz = dt.toFormat("ZZ");
  const zCompact = dt.toFormat("Z");
  const offMin = dt.offset;
  const sign = offMin >= 0 ? "+" : "-";
  const absM = Math.abs(offMin);
  const h = Math.floor(absM / 60);
  const m = absM % 60;

  const chunks = [
    iana,
    iana.replace(/\//g, " "),
    lastSeg,
    regional,
    label,
    short,
    long,
    zz,
    zCompact,
    `utc${sign}${h}`,
    `gmt${sign}${h}`,
    `UTC${sign}${h}`,
    `GMT${sign}${h}`
  ];

  if (m === 0) {
    chunks.push(`utc${sign}${String(h).padStart(2, "0")}`);
  } else {
    const hm = `${h}:${String(m).padStart(2, "0")}`;
    chunks.push(`utc${sign}${hm}`);
    chunks.push(`gmt${sign}${hm}`);
    chunks.push(`+${h}:${String(m).padStart(2, "0")}`);
  }

  return chunks
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * @param {string} searchBlob from buildTimeZoneSearchBlob
 * @param {string} query user-typed filter
 */
export function timeZoneMatchesSearchQuery(searchBlob, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  const stop = new Set(["utc", "gmt", "time"]);
  const effective = tokens.filter((t) => !stop.has(t));
  if (effective.length === 0) return true;

  return effective.every((t) => searchBlob.includes(t));
}

/**
 * @param {Array<{ value: string; label: string; searchBlob?: string }>} options
 * @param {string} query
 */
export function filterTimeZoneOptions(options, query) {
  return options.filter((o) => timeZoneMatchesSearchQuery(o.searchBlob || o.value.toLowerCase(), query));
}
