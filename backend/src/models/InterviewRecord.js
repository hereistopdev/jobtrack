import mongoose from "mongoose";

/**
 * Team interview log (matches "Team Meeting Reports" style sheets).
 * Everyone can read all rows; creator (or admin) can edit/delete.
 */
const interviewRecordSchema = new mongoose.Schema(
  {
    /** Team member this interview is for (e.g. sheet name or "Name" column). */
    subjectName: { type: String, required: true, trim: true },
    /** When chosen from the team directory; optional. */
    subjectUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    company: { type: String, required: true, trim: true },
    roleTitle: { type: String, required: true, trim: true },
    profile: { type: String, trim: true, default: "" },
    stack: { type: String, trim: true, default: "" },
    scheduledAt: { type: Date, required: true },
    /** End of slot (exclusive of overlap logic uses standard overlap). If omitted, defaults to start + 1h in API. */
    scheduledEndAt: { type: Date, default: null },
    /** IANA timezone used when the slot was entered (e.g. America/New_York). Empty for legacy rows. */
    timezone: { type: String, trim: true, default: "" },
    interviewType: { type: String, trim: true, default: "" },
    resultStatus: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    jobLinkUrl: { type: String, trim: true, default: "" },
    interviewerName: { type: String, trim: true, default: "" },
    contactInfo: { type: String, trim: true, default: "" },
    sourceSheet: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    /** Set when this row was created from an external calendar sync. */
    importedFromCalendar: { type: Boolean, default: false },
    calendarSourceId: { type: mongoose.Schema.Types.ObjectId, ref: "CalendarSource", default: null },
    /** Stable id from the external calendar (ICS UID), plus instance key for recurring events. */
    externalEventUid: { type: String, trim: true, default: "" }
  },
  { timestamps: true }
);

interviewRecordSchema.index({ scheduledAt: -1, _id: -1 });
interviewRecordSchema.index({ subjectName: 1, scheduledAt: -1 });
interviewRecordSchema.index({ subjectUserId: 1, scheduledAt: -1 });
interviewRecordSchema.index(
  { calendarSourceId: 1, externalEventUid: 1 },
  { unique: true, partialFilterExpression: { importedFromCalendar: true } }
);

export const InterviewRecord = mongoose.model("InterviewRecord", interviewRecordSchema);
