import { useId, useState } from "react";
import { importJobLinksExcel } from "../api";

export default function ExcelImportCard({ onImported }) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [rowErrors, setRowErrors] = useState([]);

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setSummary("");
    setRowErrors([]);
    try {
      const { created, items, errors } = await importJobLinksExcel(file);
      if (items?.length) {
        onImported(items);
      }
      setSummary(`Imported ${created} row(s).${errors?.length ? ` ${errors.length} row(s) skipped or failed.` : ""}`);
      setRowErrors(errors || []);
    } catch (err) {
      setSummary(err.message || "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card excel-import-card" aria-label="Import job links from Excel">
      <h2>Import from Excel</h2>
      <p className="field-hint">
        First row = column headers. Required columns: <strong>link</strong>, <strong>company</strong>,{" "}
        <strong>title</strong> (or role), <strong>date</strong>. Optional: country, status, notes. Max 500 data rows;
        file max 5&nbsp;MB.
      </p>

      <details className="excel-import-format">
        <summary>Column names &amp; format</summary>
        <div className="excel-import-format-body">
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Accepted header names</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>link</td>
                <td>Yes</td>
                <td>link, url, job link, job url</td>
                <td>Full URL or site will prefix https://</td>
              </tr>
              <tr>
                <td>company</td>
                <td>Yes</td>
                <td>company</td>
                <td />
              </tr>
              <tr>
                <td>title</td>
                <td>Yes</td>
                <td>title, role, job title, position</td>
                <td>Job title / role</td>
              </tr>
              <tr>
                <td>date</td>
                <td>Yes</td>
                <td>date, applied date</td>
                <td>Excel date cell, or text (e.g. 2024-06-15)</td>
              </tr>
              <tr>
                <td>country</td>
                <td>No</td>
                <td>country</td>
                <td>Used for duplicate detection with title</td>
              </tr>
              <tr>
                <td>status</td>
                <td>No</td>
                <td>status</td>
                <td>Saved, Applied, Interview, Offer, Rejected (default Saved)</td>
              </tr>
              <tr>
                <td>notes</td>
                <td>No</td>
                <td>notes, comments</td>
                <td />
              </tr>
            </tbody>
          </table>
          <p className="field-hint">
            Duplicate rules match the form: same normalized URL, or same country + role as an existing row, are skipped
            and listed below.
          </p>
        </div>
      </details>

      <div className="excel-import-actions">
        <input
          id={inputId}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={handleChange}
          disabled={busy}
          className="excel-import-file"
        />
        <label htmlFor={inputId}>
          {busy ? "Importing…" : "Choose .xlsx or .xls file"}
        </label>
      </div>

      {summary && <p className={`excel-import-summary ${rowErrors.length ? "has-errors" : ""}`}>{summary}</p>}

      {rowErrors.length > 0 && (
        <ul className="excel-import-errors" aria-label="Import row errors">
          {rowErrors.slice(0, 25).map((err, i) => (
            <li key={`${err.row}-${i}`}>
              Row {err.row}: {err.message}
            </li>
          ))}
          {rowErrors.length > 25 && <li>… and {rowErrors.length - 25} more</li>}
        </ul>
      )}
    </section>
  );
}
