import mongoose from "mongoose";

const financeTransactionSchema = new mongoose.Schema(
  {
    entryType: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    purpose: { type: String, trim: true, default: "" },
    owner: { type: String, trim: true, default: "" },
    ref: { type: String, trim: true, default: "" },
    deposit: { type: Number, default: 0 },
    withdraw: { type: Number, default: 0 },
    txId: { type: String, trim: true, default: "" },
    serviceEarnings: { type: String, trim: true, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false }
  },
  { timestamps: true }
);

financeTransactionSchema.index({ date: 1, _id: 1 });

export const FinanceTransaction = mongoose.model("FinanceTransaction", financeTransactionSchema);
