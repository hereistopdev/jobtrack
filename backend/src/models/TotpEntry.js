import mongoose from "mongoose";

const totpEntrySchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    issuer: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120
    },
    /** Base32 secret (RFC 4648), same format as Google Authenticator. */
    secret: {
      type: String,
      required: true,
      maxlength: 256
    }
  },
  { timestamps: true }
);

export const TotpEntry = mongoose.model("TotpEntry", totpEntrySchema);
