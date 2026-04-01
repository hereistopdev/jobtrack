import mongoose from "mongoose";

/** Singleton-style doc for app-wide settings (e.g. team ICS token). */
const systemSettingSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    combinedCalendarFeedToken: { type: String, default: "" }
  },
  { timestamps: false }
);

export const SystemSetting = mongoose.model("SystemSetting", systemSettingSchema);
export const SYSTEM_SETTING_ID = "jobtrack-settings";
