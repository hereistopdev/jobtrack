import XLSX from "xlsx";
import { InterviewRecord } from "../models/InterviewRecord.js";

function normCell(c) {
  return String(c ?? "")
    .trim()
    .toLowerCase();
}

function rowToStrings(row) {
  if (!Array.isArray(row)) return [];
  return row.map((c) => String(c ?? "").trim());
}

function parseExcelDate(val) {
  if (val == null || val === "") return null;
  if (val instanceof Date && !Number.isNaN(val.getTime())) return val;
  if (typeof val === "number" && Number.isFinite(val)) {
    const parsed = XLSX.SSF.parse_date_code(val);
    if (parsed && parsed.y != null) {
      return new Date(Date.UTC(parsed.y, (parsed.m || 1) - 1, parsed.d || 1));
    }
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

function combineDateTime(datePart, timePart) {
  const d = parseExcelDate(datePart);
  if (!d) return null;
  if (timePart == null || timePart === "") return d;
  const t = String(timePart).trim();
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = m[3]?.toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    const x = new Date(d);
    x.setHours(h, min, 0, 0);
    return x;
  }
  return d;
}

function skipSheet(name) {
  const n = String(name || "").trim();
  if (!n || n.toLowerCase() === "sum") return true;
  if (/^\d{4}\.\d+$/i.test(n)) return true;
  return false;
}

function detectDamianHeader(row) {
  const s = row.map(normCell);
  const has = (x) => s.some((c) => c.includes(x));
  return has("company") && has("interview type") && has("status");
}

function detectDustinHeader(row) {
  const s = row.map(normCell);
  const has = (x) => s.some((c) => c.includes(x));
  return has("job title") && has("result") && has("interviewer");
}

function colIndex(headerRow, ...names) {
  const h = headerRow.map(normCell);
  for (const want of names) {
    const i = h.findIndex((c) => c === want || c.includes(want));
    if (i >= 0) return i;
  }
  return -1;
}

export async function importInterviewExcelBuffer(buffer, { userId }) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });

  const errors = [];
  let created = 0;
  const items = [];

  for (const sheetName of workbook.SheetNames) {
    if (skipSheet(sheetName)) continue;

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: true
    });
    if (!rows.length) continue;

    let headerRowIdx = 0;
    let format = null;

    if (detectDamianHeader(rowToStrings(rows[0]))) {
      format = "damian";
      headerRowIdx = 0;
    } else if (rows.length > 1 && detectDustinHeader(rowToStrings(rows[1]))) {
      format = "dustin";
      headerRowIdx = 1;
    } else if (detectDustinHeader(rowToStrings(rows[0]))) {
      format = "dustin";
      headerRowIdx = 0;
    }

    if (!format) {
      errors.push({ sheet: sheetName, message: "Unknown column layout (expected Damian or Dustin style headers)" });
      continue;
    }

    const header = rowToStrings(rows[headerRowIdx]);
    const defaultSubject = String(sheetName).trim();

    if (format === "damian") {
      const iCompany = colIndex(header, "company");
      const iRole = colIndex(header, "role");
      const iProfile = colIndex(header, "profile");
      const iStack = colIndex(header, "stack");
      const iDate = colIndex(header, "date");
      const iType = colIndex(header, "interview type");
      const iStatus = colIndex(header, "status");
      const iNotes = colIndex(header, "notes");
      if (iCompany < 0 || iRole < 0 || iDate < 0) {
        errors.push({ sheet: sheetName, message: "Damian sheet: missing Company, Role, or Date column" });
        continue;
      }

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || !row.some((c) => String(c ?? "").trim() !== "")) continue;
        const company = String(row[iCompany] ?? "").trim();
        const roleTitle = String(row[iRole] ?? "").trim();
        if (!company || !roleTitle) continue;

        const scheduledAt = parseExcelDate(row[iDate]);
        if (!scheduledAt) {
          errors.push({ sheet: sheetName, row: r + 1, message: "Invalid date" });
          continue;
        }

        try {
          const doc = await InterviewRecord.create({
            subjectName: defaultSubject,
            company,
            roleTitle,
            profile: iProfile >= 0 ? String(row[iProfile] ?? "").trim() : "",
            stack: iStack >= 0 ? String(row[iStack] ?? "").trim() : "",
            scheduledAt,
            interviewType: iType >= 0 ? String(row[iType] ?? "").trim() : "",
            resultStatus: iStatus >= 0 ? String(row[iStatus] ?? "").trim() : "",
            notes: iNotes >= 0 ? String(row[iNotes] ?? "").trim() : "",
            jobLinkUrl: "",
            interviewerName: "",
            contactInfo: "",
            sourceSheet: sheetName,
            createdBy: userId
          });
          items.push(doc);
          created += 1;
        } catch (e) {
          errors.push({ sheet: sheetName, row: r + 1, message: e.message || "Save failed" });
        }
      }
    } else {
      const h = rows[headerRowIdx];
      const iDate = colIndex(rowToStrings(h), "date");
      const iTime = colIndex(rowToStrings(h), "time");
      const iName = colIndex(rowToStrings(h), "name");
      const iCompany = colIndex(rowToStrings(h), "company");
      const iJobTitle = colIndex(rowToStrings(h), "job title");
      const iLink = colIndex(rowToStrings(h), "job link");
      const iInterviewer = colIndex(rowToStrings(h), "interviewer name");
      const iContact = colIndex(rowToStrings(h), "contact info");
      const iResult = colIndex(rowToStrings(h), "result");
      const iNote = colIndex(rowToStrings(h), "note");
      if (iCompany < 0 || iJobTitle < 0 || iDate < 0) {
        errors.push({ sheet: sheetName, message: "Dustin sheet: missing Company, Job Title, or Date" });
        continue;
      }

      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row) || !row.some((c) => String(c ?? "").trim() !== "")) continue;
        const company = String(row[iCompany] ?? "").trim();
        const roleTitle = String(row[iJobTitle] ?? "").trim();
        if (!company || !roleTitle) continue;

        const subjectName =
          iName >= 0 ? String(row[iName] ?? "").trim() || defaultSubject : defaultSubject;
        const scheduledAt = combineDateTime(row[iDate], iTime >= 0 ? row[iTime] : "");
        if (!scheduledAt) {
          errors.push({ sheet: sheetName, row: r + 1, message: "Invalid date/time" });
          continue;
        }

        try {
          const doc = await InterviewRecord.create({
            subjectName,
            company,
            roleTitle,
            profile: "",
            stack: "",
            scheduledAt,
            interviewType: "",
            resultStatus: iResult >= 0 ? String(row[iResult] ?? "").trim() : "",
            notes: iNote >= 0 ? String(row[iNote] ?? "").trim() : "",
            jobLinkUrl: iLink >= 0 ? String(row[iLink] ?? "").trim() : "",
            interviewerName: iInterviewer >= 0 ? String(row[iInterviewer] ?? "").trim() : "",
            contactInfo: iContact >= 0 ? String(row[iContact] ?? "").trim() : "",
            sourceSheet: sheetName,
            createdBy: userId
          });
          items.push(doc);
          created += 1;
        } catch (e) {
          errors.push({ sheet: sheetName, row: r + 1, message: e.message || "Save failed" });
        }
      }
    }
  }

  return { created, items, errors };
}
