import mongoose from "mongoose";

const jobLinkSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    link: {
      type: String,
      required: true,
      trim: true
    },
    date: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ["Saved", "Applied", "Interview", "Offer", "Rejected"],
      default: "Saved"
    },
    notes: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { timestamps: true }
);

export const JobLink = mongoose.model("JobLink", jobLinkSchema);
