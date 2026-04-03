import mongoose from "mongoose";

const profileExperienceSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, default: "", maxlength: 200 },
    company: { type: String, trim: true, default: "", maxlength: 200 },
    location: { type: String, trim: true, default: "", maxlength: 200 },
    startDate: { type: String, trim: true, default: "", maxlength: 80 },
    endDate: { type: String, trim: true, default: "", maxlength: 80 },
    description: { type: String, trim: true, default: "", maxlength: 8000 }
  },
  { _id: false }
);

const profileUniversitySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "", maxlength: 200 },
    degree: { type: String, trim: true, default: "", maxlength: 200 },
    field: { type: String, trim: true, default: "", maxlength: 200 },
    year: { type: String, trim: true, default: "", maxlength: 40 },
    notes: { type: String, trim: true, default: "", maxlength: 2000 }
  },
  { _id: false }
);

const profileResumeFileSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    originalName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    parsedTextLength: { type: Number, default: 0 }
  },
  { _id: false }
);

const profileIdDocumentSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["drivers_license", "passport", "green_card", "state_id", "other"],
      default: "other"
    },
    key: { type: String, required: true },
    originalName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const profileOtherDocumentSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["diploma", "transcript", "paystub", "certificate", "other"],
      default: "other"
    },
    label: { type: String, trim: true, default: "", maxlength: 200 },
    key: { type: String, required: true },
    originalName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    uploadedAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const jobProfileSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    calendarColor: { type: String, trim: true, default: "#2563eb" },
    /** @deprecated Prefer overview */
    summary: { type: String, trim: true, default: "", maxlength: 4000 },
    overview: { type: String, trim: true, default: "", maxlength: 16000 },
    fullName: { type: String, trim: true, default: "", maxlength: 200 },
    /** Optional; not validated as real date — display / forms only */
    dateOfBirth: { type: String, trim: true, default: "", maxlength: 40 },
    /** Contact email for applications (may differ from account email). */
    profileEmail: { type: String, trim: true, default: "", maxlength: 200 },
    linkedinUrl: { type: String, trim: true, default: "", maxlength: 500 },
    portfolioUrl: { type: String, trim: true, default: "", maxlength: 2000 },
    addressLine: { type: String, trim: true, default: "", maxlength: 500 },
    country: { type: String, trim: true, default: "", maxlength: 120 },
    /** SSN / EIN / tax id — store only on trusted deployments */
    taxId: { type: String, trim: true, default: "", maxlength: 32 },
    /** Pasted resume or CV text for this profile. */
    resumeText: { type: String, default: "", maxlength: 50000 },
    /** Link to resume file or portfolio (optional). */
    resumeUrl: { type: String, trim: true, default: "", maxlength: 2000 },
    /** Heuristic ATS-style score (0–100), set on resume upload; editable via profile patch. */
    resumeAtsScore: { type: Number, default: null, min: 0, max: 100 },
    /** Comma- or line-separated stack / keywords. */
    technologies: { type: String, trim: true, default: "", maxlength: 4000 },
    experiences: {
      type: [profileExperienceSchema],
      default: [],
      validate: {
        validator(arr) {
          return !Array.isArray(arr) || arr.length <= 30;
        },
        message: "At most 30 experience entries"
      }
    },
    universities: {
      type: [profileUniversitySchema],
      default: [],
      validate: {
        validator(arr) {
          return !Array.isArray(arr) || arr.length <= 20;
        },
        message: "At most 20 university entries"
      }
    },
    resumeFile: { type: profileResumeFileSchema, default: null },
    idDocuments: {
      type: [profileIdDocumentSchema],
      default: [],
      validate: {
        validator(arr) {
          return !Array.isArray(arr) || arr.length <= 15;
        },
        message: "At most 15 ID documents"
      }
    },
    otherDocuments: {
      type: [profileOtherDocumentSchema],
      default: [],
      validate: {
        validator(arr) {
          return !Array.isArray(arr) || arr.length <= 40;
        },
        message: "At most 40 other documents"
      }
    },
    /** Private notes (talking points, compensation, etc.). */
    notes: { type: String, trim: true, default: "", maxlength: 8000 }
  },
  { _id: true }
);

jobProfileSchema.path("calendarColor").validate(function validateHex(v) {
  return typeof v === "string" && /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}, "calendarColor must be #RRGGBB");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    name: {
      type: String,
      trim: true,
      default: ""
    },
    /** When set, Finance ledger Owner column matches this instead of `name` (1:1 with registered user). */
    financeOwnerLabel: {
      type: String,
      trim: true,
      default: ""
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },
    /**
     * New self-serve registrations start false until an admin approves.
     * Omitted on legacy documents — treated as approved. First registered user is auto-approved (and admin).
     */
    signupApproved: {
      type: Boolean
    },
    /**
     * Job-search profiles (label + calendar color). Synced with interviewProfiles labels for legacy clients.
     */
    jobProfiles: {
      type: [jobProfileSchema],
      default: [],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length <= 40;
        },
        message: "At most 40 job profiles"
      }
    },
    /** @deprecated Prefer jobProfiles; kept in sync for older clients. */
    interviewProfiles: {
      type: [String],
      default: [],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length <= 40;
        },
        message: "At most 40 profile labels"
      }
    },
    /** Private ICS token for this user's interview calendar subscription feed. */
    calendarFeedToken: {
      type: String,
      trim: true,
      default: "",
      index: true
    }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
