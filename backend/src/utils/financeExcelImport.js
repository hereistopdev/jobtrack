import XLSX from "xlsx";
import { FinanceTransaction } from "../models/FinanceTransaction.js";
import { localYmd } from "./financeSummary.js";
import { findDuplicateFinanceRow } from "./duplicateFinanceTransaction.js";

const MAX_ROWS = 2000;

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(val) {
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === "number" && Number.isFinite(val)) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y != null) {
      return new Date(Date.UTC(parsed.y, (parsed.m || 1) - 1, parsed.d || 1));
    }
  }
  const d = new Date(val);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Map normalized header -> field */
const HEADER_MAP = [
  [["type"], "entryType"],
  [["date"], "date"],
  [["purpose"], "purpose"],
  [["owner"], "owner"],
  [["ref"], "ref"],
  [["deposit"], "deposit"],
  [["withdraw", "withdrawal"], "withdraw"],
  [["balance"], "_skip"],
  [["txid", "tx id"], "txId"],
  [["service earnings"], "serviceEarnings"]
];

function buildColumnMap(headerRow) {
  const map = {};
  (headerRow || []).forEach((cell, colIndex) => {
    const n = normalizeHeader(cell);
    if (!n) return;
    for (const [aliases, field] of HEADER_MAP) {
      if (aliases.includes(n)) {
        map[colIndex] = field;
        break;
      }
    }
  });
  return map;
}

function rowToObject(row, colMap) {
  const o = {};
  for (const [col, field] of Object.entries(colMap)) {
    if (field === "_skip") continue;
    o[field] = row[Number(col)];
  }
  return o;
}

export async function importFinanceFromExcelBuffer(buffer, { userId }) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { created: 0, skippedDuplicates: 0, items: [], errors: [{ row: 0, message: "Workbook has no sheets" }] };
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
  if (!rows.length) {
    return { created: 0, skippedDuplicates: 0, items: [], errors: [{ row: 1, message: "Sheet is empty" }] };
  }

  const colMap = buildColumnMap(rows[0]);
  if (!colMap || Object.keys(colMap).length === 0) {
    return {
      created: 0,
      skippedDuplicates: 0,
      items: [],
      errors: [{ row: 1, message: "Could not read headers. Expected: Type, Date, Purpose, Owner, ref, Deposit, Withdraw, TXid, Service Earnings" }]
    };
  }

  const required = ["entryType", "date"];
  const missing = required.filter((f) => !Object.values(colMap).includes(f));
  if (missing.length) {
    return {
      created: 0,
      skippedDuplicates: 0,
      items: [],
      errors: [{ row: 1, message: `Missing column(s): ${missing.join(", ")}` }]
    };
  }

  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (dataRows.length > MAX_ROWS) {
    return {
      created: 0,
      skippedDuplicates: 0,
      items: [],
      errors: [{ row: 0, message: `Too many rows (max ${MAX_ROWS})` }]
    };
  }

  const errors = [];
  const items = [];
  let created = 0;
  let skippedDuplicates = 0;
  const seenTxId = new Set();
  const seenFingerprint = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const excelRowNum = i + 2;
    const raw = rowToObject(dataRows[i], colMap);
    const entryType = String(raw.entryType ?? "").trim();
    const date = parseDate(raw.date);
    if (!entryType) {
      errors.push({ row: excelRowNum, message: "Type is empty" });
      continue;
    }
    if (!date) {
      errors.push({ row: excelRowNum, message: "Date is invalid" });
      continue;
    }

    const purpose = String(raw.purpose ?? "").trim();
    const owner = String(raw.owner ?? "").trim();
    const ref = String(raw.ref ?? "").trim();
    const deposit = num(raw.deposit);
    const withdraw = num(raw.withdraw);
    const txId = String(raw.txId ?? "").trim();
    const serviceEarnings = String(raw.serviceEarnings ?? "").trim();

    const rowPayload = { entryType, date, purpose, owner, ref, deposit, withdraw, txId };

    if (txId) {
      const key = txId.toLowerCase();
      if (seenTxId.has(key)) {
        skippedDuplicates += 1;
        continue;
      }
    } else {
      const fp = `${localYmd(date)}|${entryType}|${deposit}|${withdraw}|${purpose}|${owner}|${ref}`;
      if (seenFingerprint.has(fp)) {
        skippedDuplicates += 1;
        continue;
      }
    }

    try {
      const existing = await findDuplicateFinanceRow(rowPayload);
      if (existing) {
        skippedDuplicates += 1;
        if (txId) seenTxId.add(txId.toLowerCase());
        else {
          seenFingerprint.add(`${localYmd(date)}|${entryType}|${deposit}|${withdraw}|${purpose}|${owner}|${ref}`);
        }
        continue;
      }

      const doc = await FinanceTransaction.create({
        entryType,
        date,
        purpose,
        owner,
        ref,
        deposit,
        withdraw,
        txId,
        serviceEarnings,
        createdBy: userId
      });
      items.push(doc);
      created += 1;
      if (txId) seenTxId.add(txId.toLowerCase());
      else seenFingerprint.add(`${localYmd(date)}|${entryType}|${deposit}|${withdraw}|${purpose}|${owner}|${ref}`);
    } catch (e) {
      errors.push({ row: excelRowNum, message: e.message || "Save failed" });
    }
  }

  return { created, skippedDuplicates, items, errors };
}
