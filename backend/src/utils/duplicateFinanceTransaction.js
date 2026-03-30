import { FinanceTransaction } from "../models/FinanceTransaction.js";
import { endOfLocalDay, startOfLocalDay } from "./financeSummary.js";

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Find an existing row that duplicates this import/manual row.
 * - Non-empty txId: case-insensitive exact match on txId.
 * - Empty txId: same local calendar day, type, amounts, purpose, owner, ref, and existing row has no meaningful txId.
 */
export async function findDuplicateFinanceRow({
  txId,
  entryType,
  date,
  deposit,
  withdraw,
  purpose,
  owner,
  ref
}) {
  const tid = typeof txId === "string" ? txId.trim() : "";
  if (tid) {
    const escaped = tid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await FinanceTransaction.findOne({ txId: new RegExp(`^${escaped}$`, "i") });
    return existing || null;
  }

  const et = String(entryType || "").trim();
  const ds = startOfLocalDay(date);
  const de = endOfLocalDay(date);
  const d = num(deposit);
  const w = num(withdraw);
  const p = String(purpose || "").trim();
  const o = String(owner || "").trim();
  const r = String(ref || "").trim();

  const existing = await FinanceTransaction.findOne({
    entryType: et,
    deposit: d,
    withdraw: w,
    purpose: p,
    owner: o,
    ref: r,
    date: { $gte: ds, $lte: de },
    $or: [{ txId: "" }, { txId: null }, { txId: { $exists: false } }]
  });
  return existing || null;
}
