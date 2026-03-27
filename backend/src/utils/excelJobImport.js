import XLSX from "xlsx";
import { JobLink } from "../models/JobLink.js";
import { findDuplicateJobLink, formatDuplicateResponse } from "./duplicateJobLink.js";

const MAX_ROWS = 500;

const STATUS_VALUES = new Set(["Saved", "Applied", "Interview", "Offer", "Rejected"]);

/** normalized header -> field key */
const HEADER_TO_FIELD = [
  [["link", "url", "job link", "job url", "job_url"], "link"],
  [["company"], "company"],
  [["title", "role", "job title", "position", "job_title"], "title"],
  [["country"], "country"],
  [["date", "applied date", "applied_date"], "date"],
  [["status"], "status"],
  [["notes", "note", "comments"], "notes"]
];

function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildColumnMap(headerRow) {
  const map = {};
  const used = new Set();
  (headerRow || []).forEach((cell, colIndex) => {
    const n = normalizeHeader(cell);
    if (!n) return;
    for (const [aliases, field] of HEADER_TO_FIELD) {
      if (used.has(field)) continue;
      if (aliases.includes(n)) {
        map[colIndex] = field;
        used.add(field);
        break;
      }
    }
  });
  return map;
}

function rowToObject(row, colMap) {
  const o = {};
  for (const [col, field] of Object.entries(colMap)) {
    const idx = Number(col);
    const v = row[idx];
    o[field] = v;
  }
  return o;
}

function parseCellDate(val) {
  if (val == null || val === "") return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === "number" && Number.isFinite(val)) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y != null) {
      return new Date(Date.UTC(parsed.y, (parsed.m || 1) - 1, parsed.d || 1));
    }
  }
  const s = String(val).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

function normalizeLink(s) {
  const t = String(s ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function parseStatus(val) {
  const s = String(val ?? "").trim();
  if (!s) return "Saved";
  const cap = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const tryExact = ["Saved", "Applied", "Interview", "Offer", "Rejected"].find((x) => x.toLowerCase() === s.toLowerCase());
  if (tryExact) return tryExact;
  if (STATUS_VALUES.has(cap)) return cap;
  return "Saved";
}

/**
 * @param {Buffer} buffer
 * @param {{ userId: string }} ctx
 * @returns {Promise<{ created: number, items: object[], errors: { row: number, message: string }[] }>}
 */
export async function importJobLinksFromExcelBuffer(buffer, { userId }) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { created: 0, items: [], errors: [{ row: 0, message: "Workbook has no sheets" }] };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  if (!rows.length) {
    return { created: 0, items: [], errors: [{ row: 1, message: "Sheet is empty" }] };
  }

  const colMap = buildColumnMap(rows[0]);
  const requiredFields = ["link", "company", "title", "date"];
  const missing = requiredFields.filter((f) => !Object.values(colMap).includes(f));
  if (missing.length) {
    return {
      created: 0,
      items: [],
      errors: [
        {
          row: 1,
          message: `Missing required column(s): ${missing.join(", ")}. First row must be headers with: link, company, title, date (plus optional country, status, notes).`
        }
      ]
    };
  }

  const dataRows = rows.slice(1).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim() !== ""));
  if (dataRows.length > MAX_ROWS) {
    return {
      created: 0,
      items: [],
      errors: [{ row: 0, message: `Too many rows (max ${MAX_ROWS}). Split into smaller files.` }]
    };
  }

  const errors = [];
  const items = [];
  let created = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const excelRowNum = i + 2;
    const raw = rowToObject(dataRows[i], colMap);

    const link = normalizeLink(raw.link);
    const company = String(raw.company ?? "").trim();
    const title = String(raw.title ?? "").trim();
    const country = String(raw.country ?? "").trim();
    const date = parseCellDate(raw.date);
    const status = parseStatus(raw.status);
    const notes = String(raw.notes ?? "").trim();

    if (!link) {
      errors.push({ row: excelRowNum, message: "link is empty" });
      continue;
    }
    if (!company) {
      errors.push({ row: excelRowNum, message: "company is empty" });
      continue;
    }
    if (!title) {
      errors.push({ row: excelRowNum, message: "title (role) is empty" });
      continue;
    }
    if (!date) {
      errors.push({ row: excelRowNum, message: "date is missing or invalid" });
      continue;
    }

    try {
      const dup = await findDuplicateJobLink({
        link,
        title,
        country,
        excludeId: null
      });
      if (dup) {
        const fr = formatDuplicateResponse(dup);
        errors.push({
          row: excelRowNum,
          message:
            dup.reason === "same_link"
              ? `Duplicate URL (already on board — ${fr.addedByLabel})`
              : `Duplicate country + role (already on board — ${fr.addedByLabel})`
        });
        continue;
      }

      const newLink = await JobLink.create({
        company,
        title,
        link,
        date,
        status,
        notes,
        country,
        createdBy: userId
      });
      const populated = await JobLink.findById(newLink._id).populate("createdBy", "email name");
      items.push(populated);
      created += 1;
    } catch (e) {
      errors.push({ row: excelRowNum, message: e.message || "Failed to save row" });
    }
  }

  return { created, items, errors };
}
