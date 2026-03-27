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
    },
    country: {
      type: String,
      trim: true,
      default: ""
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false
    },
    interviews: [
      {
        label: {
          type: String,
          trim: true,
          default: "Interview"
        },
        scheduledAt: {
          type: Date,
          required: true
        }
      }
    ]
  },
  { timestamps: true }
);

export const JobLink = mongoose.model("JobLink", jobLinkSchema);
