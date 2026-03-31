import mongoose from "mongoose";

export const TEAM_ACCOUNT_CATEGORIES = ["email", "payment", "freelance", "communication", "other"];

const teamAccountSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    category: {
      type: String,
      enum: TEAM_ACCOUNT_CATEGORIES,
      default: "other"
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    /** Login / email / handle / org name (not necessarily secret). */
    identifier: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500
    },
    /** Passwords, API keys, recovery codes — stored in DB; use HTTPS and restrict access. */
    credentials: {
      type: String,
      default: "",
      maxlength: 8000
    },
    notes: {
      type: String,
      default: "",
      maxlength: 2000
    }
  },
  { timestamps: true }
);

export const TeamAccount = mongoose.model("TeamAccount", teamAccountSchema);
