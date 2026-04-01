import ical from "node-ical";
import { InterviewRecord } from "../models/InterviewRecord.js";
import { fetchIcsText } from "./calendarIcsFetch.js";

function paramString(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v.val != null) return String(v.val).trim();
  return String(v).trim();
}

function toDate(d) {
  if (!d) return null;
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  try {
    const x = new Date(d);
    return Number.isNaN(x.getTime()) ? null : x;
  } catch {
    return null;
  }
}

/**
 * Fetch ICS from `source.icsUrl`, parse events, upsert InterviewRecord rows for this source.
 */
export async function syncCalendarSourceToInterviews(source, ownerUserId) {
  const label = (source.label || "").trim() || "Calendar";
  const icsUrl = (source.icsUrl || "").trim();
  if (!icsUrl) {
    throw new Error("icsUrl is required");
  }

  const text = await fetchIcsText(icsUrl);
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error(
      "URL does not look like an ICS calendar. For Google, use the Secret address in iCal format."
    );
  }
  const data = ical.parseICS(text);
  const now = Date.now();
  const rangeFrom = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const rangeTo = new Date(now + 365 * 24 * 60 * 60 * 1000);

  let processed = 0;
  let veventCount = 0;
  const errors = [];

  for (const key of Object.keys(data)) {
    if (key === "vcalendar") continue;
    const ev = data[key];
    if (!ev || ev.type !== "VEVENT") continue;
    veventCount += 1;
    if (ev.status === "CANCELLED") continue;

    let instances = [];
    try {
      instances = ical.expandRecurringEvent(ev, { from: rangeFrom, to: rangeTo });
    } catch (e) {
      errors.push(String(e?.message || e));
      continue;
    }
    if (!Array.isArray(instances) || !instances.length) continue;

    const baseUid = (ev.uid && String(ev.uid).trim()) || key;

    for (const inst of instances) {
      const start = toDate(inst.start);
      let end = toDate(inst.end);
      if (!start) continue;
      if (!end) end = new Date(start.getTime() + 60 * 60 * 1000);
      if (end.getTime() <= start.getTime()) {
        end = new Date(start.getTime() + 60 * 60 * 1000);
      }

      const extUid = `${baseUid}__${start.getTime()}`;
      const summary =
        paramString(inst.summary) || paramString(ev.summary) || "Calendar event";
      const loc = paramString(ev.location);

      const notes = [
        `Imported from ${label}.`,
        ev.uid ? `ICS UID: ${ev.uid}` : "",
        ev.description ? paramString(ev.description).slice(0, 500) : ""
      ]
        .filter(Boolean)
        .join("\n");

      await InterviewRecord.findOneAndUpdate(
        { calendarSourceId: source._id, externalEventUid: extUid },
        {
          $set: {
            subjectName: summary.slice(0, 200) || "Calendar event",
            company: "External calendar",
            roleTitle: summary.slice(0, 200) || "Imported event",
            profile: "",
            stack: "",
            scheduledAt: start,
            scheduledEndAt: end,
            timezone: "",
            interviewType: "Calendar import",
            resultStatus: "",
            notes: notes.slice(0, 8000),
            jobLinkUrl: "",
            interviewerName: "",
            contactInfo: loc.slice(0, 500),
            sourceSheet: "",
            createdBy: ownerUserId,
            subjectUserId: ownerUserId,
            importedFromCalendar: true,
            calendarSourceId: source._id,
            externalEventUid: extUid
          }
        },
        { upsert: true, new: true }
      );
      processed += 1;
    }
  }

  if (veventCount === 0) {
    throw new Error(
      "ICS feed parsed, but no events were found. Verify sharing permissions and ensure this is the calendar ICS URL."
    );
  }

  return { processed, errors: errors.slice(0, 8) };
}
