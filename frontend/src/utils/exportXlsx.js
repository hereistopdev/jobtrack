import * as XLSX from "xlsx";

function safeSheetName(name) {
  return String(name || "Sheet")
    .replace(/[:\\/?*[\]]/g, "")
    .slice(0, 31) || "Sheet";
}

/**
 * @param {Record<string, unknown>[]} rows - array of plain objects (first row = headers from keys)
 * @param {string} filename - without or with .xlsx
 * @param {string} sheetName
 */
export function downloadXlsxSheet(rows, filename, sheetName = "Export") {
  if (!rows?.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetName));
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}

/**
 * @param {{ name: string, rows: Record<string, unknown>[] }[]} sheets
 * @param {string} filename
 */
export function downloadXlsxWorkbook(sheets, filename) {
  if (!sheets?.length) return;
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    if (!rows?.length) continue;
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(name));
  }
  if (!wb.SheetNames.length) return;
  const name = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, name);
}

function formatJobInterviews(list) {
  if (!list?.length) return "";
  return list
    .map((x) => `${x.label || "Interview"}: ${new Date(x.scheduledAt).toISOString()}`)
    .join("; ");
}

export function buildJobLinkExportRows(items) {
  return items.map((item, i) => {
    const c = item.createdBy;
    const addedBy =
      c && typeof c === "object" ? [c.name, c.email].filter(Boolean).join(" — ") : "";
    return {
      "#": i + 1,
      Company: item.company ?? "",
      Role: item.title ?? "",
      Country: item.country ?? "",
      Link: item.link ?? "",
      Date: item.date ? new Date(item.date).toISOString().slice(0, 10) : "",
      Status: item.status ?? "",
      Interviews: formatJobInterviews(item.interviews),
      "Added by": addedBy,
      Notes: item.notes ?? ""
    };
  });
}

export function exportJobLinksToXlsx(items, filename = "job-links") {
  const rows = buildJobLinkExportRows(items);
  if (!rows.length) return;
  downloadXlsxSheet(rows, filename, "Job links");
}

export function exportFinanceByOwnerToXlsx(rows, filename = "finance-by-owner") {
  const data = rows.map((r) => ({
    Owner: r.owner,
    Deposits: r.deposits,
    Withdrawals: r.withdrawals,
    Net: r.net,
    Lines: r.transactionCount
  }));
  if (!data.length) return;
  downloadXlsxSheet(data, filename, "By owner");
}

export function exportFinanceLedgerToXlsx(rows, filename = "finance-ledger") {
  const data = rows.map((row, i) => ({
    "#": i + 1,
    Type: row.entryType ?? "",
    Date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
    Purpose: row.purpose ?? "",
    Owner: row.owner ?? "",
    ref: row.ref ?? "",
    Deposit: row.deposit ?? "",
    Withdraw: row.withdraw ?? "",
    Balance: row.runningBalance ?? "",
    TXid: row.txId ?? "",
    "Service earnings": row.serviceEarnings ?? ""
  }));
  if (!data.length) return;
  downloadXlsxSheet(data, filename, "Ledger");
}

export function exportUsersToXlsx(users, filename = "users") {
  const rows = users.map((u) => ({
    Email: u.email ?? "",
    Name: u.name ?? "",
    "Finance owner": u.financeOwnerLabel ?? "",
    Role: u.role ?? "",
    Joined: u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : ""
  }));
  if (!rows.length) return;
  downloadXlsxSheet(rows, filename, "Users");
}

const JOB_IMPORT_FORMAT_ROWS = [
  {
    Column: "link",
    Required: "Yes",
    "Accepted header names": "link, url, job link, job url",
    Notes: "Full URL or site will prefix https://"
  },
  {
    Column: "company",
    Required: "Yes",
    "Accepted header names": "company",
    Notes: ""
  },
  {
    Column: "title",
    Required: "Yes",
    "Accepted header names": "title, role, job title, position",
    Notes: "Job title / role"
  },
  {
    Column: "date",
    Required: "Yes",
    "Accepted header names": "date, applied date",
    Notes: "Excel date cell, or text (e.g. 2024-06-15)"
  },
  {
    Column: "country",
    Required: "No",
    "Accepted header names": "country",
    Notes: "Used for duplicate detection with title"
  },
  {
    Column: "status",
    Required: "No",
    "Accepted header names": "status",
    Notes: "Saved, Applied, Interview, Offer, Rejected (default Saved)"
  },
  {
    Column: "notes",
    Required: "No",
    "Accepted header names": "notes, comments",
    Notes: ""
  }
];

export function exportJobImportFormatToXlsx(filename = "job-import-column-format") {
  downloadXlsxSheet(JOB_IMPORT_FORMAT_ROWS, filename, "Import format");
}

export function exportInterviewRecordsToXlsx(rows, filename = "interview-records") {
  const data = rows.map((r) => ({
    Subject: r.subjectName ?? "",
    Company: r.company ?? "",
    Role: r.roleTitle ?? "",
    Profile: r.profile ?? "",
    Stack: r.stack ?? "",
    Date: r.scheduledAt ? new Date(r.scheduledAt).toISOString().slice(0, 10) : "",
    "Interview type": r.interviewType ?? "",
    Result: r.resultStatus ?? "",
    Notes: r.notes ?? "",
    "Job link": r.jobLinkUrl ?? "",
    Interviewer: r.interviewerName ?? "",
    "Contact info": r.contactInfo ?? "",
    "Logged by":
      r.createdBy && typeof r.createdBy === "object" ? r.createdBy.email || r.createdBy.name || "" : "",
    "Source sheet": r.sourceSheet ?? ""
  }));
  if (!data.length) return;
  downloadXlsxSheet(data, filename, "Interviews");
}

export function exportAnalyticsToXlsx(data, filename = "analytics") {
  const byUser = (data?.byUser || []).map((u) => ({
    Name: u.name || "",
    Email: u.email || "",
    "Links added": u.count
  }));
  const byMonth = (data?.byMonth || []).map((m) => ({
    Month: m.month,
    "Links added": m.count
  }));
  const status = (data?.statusBreakdown || []).map((s) => ({
    Status: s.status || "",
    Count: s.count
  }));
  const sheets = [];
  if (byUser.length) sheets.push({ name: "By teammate", rows: byUser });
  if (byMonth.length) sheets.push({ name: "By month", rows: byMonth });
  if (status.length) sheets.push({ name: "Status", rows: status });
  if (!sheets.length) return;
  downloadXlsxWorkbook(sheets, filename);
}
