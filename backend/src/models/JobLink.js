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
    /** Optional: which of the creator's job-search profiles this application belongs to (for stats). */
    jobProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
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
        },
        /** Optional link to a row in the team interview log / calendar. */
        linkedInterviewRecordId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "InterviewRecord",
          default: null
        }
      }
    ]
  },
  { timestamps: true }
);

export const JobLink = mongoose.model("JobLink", jobLinkSchema);
