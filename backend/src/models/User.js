import mongoose from "mongoose";

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
    /** Saved labels for interview "Profile" when logging (each user maintains their own list). */
    interviewProfiles: {
      type: [String],
      default: [],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length <= 40;
        },
        message: "At most 40 profile labels"
      }
    }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
