import mongoose from "mongoose";

const SOURCE_TYPES = ["ics", "google", "outlook"];

const calendarSourceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    label: { type: String, required: true, trim: true, maxlength: 200 },
    sourceType: { type: String, enum: SOURCE_TYPES, default: "ics" },
    /** Secret calendar URL (Google “secret address”, Outlook ICS link, or any HTTPS ICS feed). */
    icsUrl: { type: String, trim: true, default: "" },
    lastSyncedAt: { type: Date, default: null },
    lastError: { type: String, trim: true, default: "" },
    lastEventCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

calendarSourceSchema.index({ owner: 1, updatedAt: -1 });

export const CalendarSource = mongoose.model("CalendarSource", calendarSourceSchema);
export { SOURCE_TYPES as CALENDAR_SOURCE_TYPES };
