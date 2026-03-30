import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  createFinanceTransaction,
  deleteFinanceTransaction,
  fetchFinanceSummary,
  fetchFinanceTransactions,
  importFinanceExcel,
  updateFinanceTransaction
} from "../api";
import PaginationBar from "../components/PaginationBar";

const money = (n) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
    Number(n) || 0
  );

function weekTickLabel(ymd) {
  if (!ymd || ymd.length < 10) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function monthTickLabel(ym) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

const emptyForm = () => ({
  entryType: "",
  date: new Date().toISOString().slice(0, 10),
  purpose: "",
  owner: "",
  ref: "",
  deposit: "",
  withdraw: "",
  txId: "",
  serviceEarnings: ""
});

const emptyColumnFilters = () => ({
  entryType: "",
  date: "",
  purpose: "",
  owner: "",
  ref: "",
  deposit: "",
  withdraw: "",
  runningBalance: "",
  txId: "",
  serviceEarnings: ""
});

function SortTh({ id, label, sortKey, sortDir, onSort, className }) {
  const active = sortKey === id;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="sortable-heading" onClick={() => onSort(id)}>
        <span>{label}</span>
        <span className="sort-indicator" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function rowMatchesFilters(row, f) {
  const needle = (s) => String(s || "").trim().toLowerCase();
  const has = (col, haystack) => {
    const n = needle(f[col]);
    if (!n) return true;
    return needle(haystack).includes(n);
  };

  const d = row.date ? new Date(row.date) : null;
  const dateStr = d && !Number.isNaN(d.getTime()) ? `${d.toISOString().slice(0, 10)} ${d.toLocaleDateString()}` : "";

  if (!has("entryType", row.entryType)) return false;
  if (!has("date", dateStr)) return false;
  if (!has("purpose", row.purpose)) return false;
  const ownerNeedle = needle(f.owner);
  if (ownerNeedle) {
    const ro = (row.owner || "").trim().toLowerCase();
    if (ownerNeedle === "(no owner)") {
      if (ro !== "") return false;
    } else if (!ro.includes(ownerNeedle)) return false;
  }
  if (!has("ref", row.ref)) return false;
  if (!has("deposit", row.deposit != null ? String(row.deposit) : "")) return false;
  if (!has("withdraw", row.withdraw != null ? String(row.withdraw) : "")) return false;
  if (!has("runningBalance", row.runningBalance != null ? String(row.runningBalance) : "")) return false;
  if (!has("txId", row.txId)) return false;
  if (!has("serviceEarnings", row.serviceEarnings)) return false;
  return true;
}

const FINANCE_DASH_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "entry", label: "Add & import" },
  { id: "ledger", label: "Ledger" }
];

export default function FinancePage() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [chartMode, setChartMode] = useState("monthly");
  const [importSummary, setImportSummary] = useState("");
  const [importErrors, setImportErrors] = useState([]);
  const [columnFilters, setColumnFilters] = useState(emptyColumnFilters);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [reportOwner, setReportOwner] = useState("");
  const [includeServiceIncomeRefs, setIncludeServiceIncomeRefs] = useState(true);
  const [dashTab, setDashTab] = useState("dashboard");
  const dashPanelRef = useRef(null);

  const load = useCallback(async () => {
    setError("");
    const o = reportOwner.trim();
    const [s, t] = await Promise.all([
      fetchFinanceSummary({
        ...(o ? { owner: o } : {}),
        includeServiceIncomeRefs
      }),
      fetchFinanceTransactions()
    ]);
    setSummary(s);
    setTransactions(t);
  }, [reportOwner, includeServiceIncomeRefs]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const weeklyChartData = useMemo(() => {
    const rows = summary?.weeklySeries || [];
    return rows.slice(-20).map((r) => ({
      ...r,
      label: weekTickLabel(r.period)
    }));
  }, [summary]);

  const monthlyChartData = useMemo(() => {
    const rows = summary?.monthlySeries || [];
    return rows.slice(-24).map((r) => ({
      ...r,
      label: monthTickLabel(r.period)
    }));
  }, [summary]);

  const ownerReportOptions = useMemo(() => {
    const rows = summary?.byOwner || [];
    const names = rows.map((r) => r.owner);
    return [...names].sort((a, b) => {
      if (a === "(no owner)") return 1;
      if (b === "(no owner)") return -1;
      return a.localeCompare(b);
    });
  }, [summary?.byOwner]);

  const byOwnerReportRows = useMemo(() => {
    return [...(summary?.byOwner || [])].sort((a, b) => b.net - a.net || a.owner.localeCompare(b.owner));
  }, [summary?.byOwner]);

  const filteredSortedTransactions = useMemo(() => {
    const filtered = transactions.filter((row) => rowMatchesFilters(row, columnFilters));
    const list = [...filtered];
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;

    const valueFor = (row) => {
      switch (key) {
        case "entryType":
          return (row.entryType || "").toLowerCase();
        case "date":
          return new Date(row.date).getTime() || 0;
        case "purpose":
          return (row.purpose || "").toLowerCase();
        case "owner":
          return (row.owner || "").toLowerCase();
        case "ref":
          return (row.ref || "").toLowerCase();
        case "deposit":
          return Number(row.deposit) || 0;
        case "withdraw":
          return Number(row.withdraw) || 0;
        case "runningBalance":
          return Number(row.runningBalance) || 0;
        case "txId":
          return (row.txId || "").toLowerCase();
        case "serviceEarnings":
          return (row.serviceEarnings || "").toLowerCase();
        default:
          return "";
      }
    };

    list.sort((a, b) => {
      const va = valueFor(a);
      const vb = valueFor(b);
      if (typeof va === "number" && typeof vb === "number") {
        if (va === vb) {
          const ta = new Date(a.date).getTime() || 0;
          const tb = new Date(b.date).getTime() || 0;
          if (ta === tb) return String(a._id).localeCompare(String(b._id));
          return ta < tb ? -mult : mult;
        }
        return va < vb ? -mult : mult;
      }
      const sa = String(va);
      const sb = String(vb);
      if (sa === sb) {
        const ta = new Date(a.date).getTime() || 0;
        const tb = new Date(b.date).getTime() || 0;
        if (ta === tb) return String(a._id).localeCompare(String(b._id));
        return ta < tb ? -mult : mult;
      }
      return sa < sb ? -mult : mult;
    });
    return list;
  }, [transactions, columnFilters, sort]);

  const hasActiveFilters = useMemo(
    () => Object.values(columnFilters).some((v) => String(v || "").trim() !== ""),
    [columnFilters]
  );

  const columnFiltersKey = useMemo(() => JSON.stringify(columnFilters), [columnFilters]);

  const totalFound = filteredSortedTransactions.length;
  const totalPages = totalFound === 0 ? 0 : Math.ceil(totalFound / pageSize);
  const currentPage =
    totalFound === 0 ? 0 : Math.min(Math.max(1, page), Math.max(1, totalPages));
  const pageStart = totalFound === 0 ? 0 : (currentPage - 1) * pageSize;
  const paginatedTransactions = useMemo(
    () => filteredSortedTransactions.slice(pageStart, pageStart + pageSize),
    [filteredSortedTransactions, pageStart, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [sort.key, sort.dir, columnFiltersKey]);

  useEffect(() => {
    if (totalFound === 0) return;
    const tp = Math.ceil(totalFound / pageSize) || 1;
    setPage((p) => Math.min(Math.max(1, p), tp));
  }, [totalFound, pageSize]);

  useEffect(() => {
    dashPanelRef.current?.scrollTo?.(0, 0);
  }, [dashTab]);

  const toggleSort = (columnKey) => {
    setSort((s) =>
      s.key === columnKey
        ? { key: columnKey, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: columnKey, dir: columnKey === "date" ? "desc" : "asc" }
    );
  };

  const setFilter = (key, value) => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearColumnFilters = () => setColumnFilters(emptyColumnFilters());

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        type: form.entryType.trim(),
        date: form.date,
        purpose: form.purpose,
        owner: form.owner,
        ref: form.ref,
        deposit: form.deposit === "" ? 0 : Number(form.deposit) || 0,
        withdraw: form.withdraw === "" ? 0 : Number(form.withdraw) || 0,
        txId: form.txId,
        serviceEarnings: form.serviceEarnings
      };
      if (editingId) {
        await updateFinanceTransaction(editingId, payload);
      } else {
        await createFinanceTransaction(payload);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row._id);
    setForm({
      entryType: row.entryType || "",
      date: row.date ? new Date(row.date).toISOString().slice(0, 10) : "",
      purpose: row.purpose || "",
      owner: row.owner || "",
      ref: row.ref || "",
      deposit: row.deposit != null && row.deposit !== 0 ? String(row.deposit) : "",
      withdraw: row.withdraw != null && row.withdraw !== 0 ? String(row.withdraw) : "",
      txId: row.txId || "",
      serviceEarnings: row.serviceEarnings || ""
    });
    setDashTab("entry");
    dashPanelRef.current?.scrollTo?.(0, 0);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this ledger row?")) return;
    try {
      await deleteFinanceTransaction(id);
      if (editingId === id) resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportSummary("");
    setImportErrors([]);
    try {
      const { created, skippedDuplicates = 0, errors } = await importFinanceExcel(file);
      const parts = [`Imported ${created} row(s).`];
      if (skippedDuplicates) parts.push(` Skipped ${skippedDuplicates} duplicate(s).`);
      if (errors?.length) parts.push(` ${errors.length} row(s) with errors.`);
      setImportSummary(parts.join(""));
      setImportErrors(errors || []);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const w = summary?.windows;

  return (
    <main className="container container-dashboard finance-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Finance</h1>
          <p>
            Team balance ledger (deposits &amp; withdrawals). Matches spreadsheet columns: Type, Date, Purpose, Owner,
            ref, Deposit, Withdraw, TXid, Service earnings. Admin only.
          </p>
        </div>
      </header>

      {error && <div className="card error">{error}</div>}
      {loading && <div className="card">Loading…</div>}

      {!loading && summary && (
        <div className="finance-dash-shell">
          <div
            ref={dashPanelRef}
            className="finance-dash-panel"
            role="tabpanel"
            id="finance-dash-panel"
            aria-labelledby={`finance-dash-tab-${dashTab}`}
            tabIndex={-1}
          >
            {dashTab === "dashboard" && (
              <>
                <section className="card finance-report-owner-card">
                  <div className="finance-report-owner-row">
                    <label className="finance-report-owner-label">
                      Reports by owner
                      <select
                        className="finance-report-owner-select"
                        value={reportOwner}
                        onChange={(e) => setReportOwner(e.target.value)}
                        aria-label="Filter finance reports by owner"
                      >
                        <option value="">All owners</option>
                        {ownerReportOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="finance-dashboard-checkbox-label">
                      <input
                        type="checkbox"
                        checked={includeServiceIncomeRefs}
                        onChange={(e) => setIncludeServiceIncomeRefs(e.target.checked)}
                      />
                      <span>Include service &amp; income (ref)</span>
                    </label>
                    {summary.activeOwnerFilter && (
                      <p className="finance-report-owner-active">
                        Summary and chart for <strong>{summary.activeOwnerFilter}</strong>.
                      </p>
                    )}
                  </div>
                  <p className="field-hint finance-report-owner-hint">
                    Dashboard totals (cards, chart, and by-owner below) use the same rules: rows for{" "}
                    <strong>Dustin Lee</strong> count only when <strong>ref</strong> is filled. Uncheck &quot;Include
                    service &amp; income&quot; to omit lines whose ref is categorized as Service, Income, Service
                    earnings, etc. The ledger tab still shows every row.
                  </p>
                </section>

                <section className="finance-overview">
                  <div className="card finance-stat-card">
                    <h3>Last 7 days</h3>
                    <p className="finance-stat-value">{money(w?.last7Days?.net)}</p>
                    <p className="finance-stat-detail">
                      In {money(w?.last7Days?.deposits)} · Out {money(w?.last7Days?.withdrawals)} ·{" "}
                      {w?.last7Days?.transactionCount} lines
                    </p>
                  </div>
                  <div className="card finance-stat-card">
                    <h3>This month</h3>
                    <p className="finance-stat-value">{money(w?.thisMonth?.net)}</p>
                    <p className="finance-stat-detail">
                      In {money(w?.thisMonth?.deposits)} · Out {money(w?.thisMonth?.withdrawals)} ·{" "}
                      {w?.thisMonth?.transactionCount} lines
                    </p>
                  </div>
                  <div className="card finance-stat-card finance-stat-overall">
                    <h3>Overall</h3>
                    <p className="finance-stat-value">{money(w?.allTime?.net)}</p>
                    <p className="finance-stat-detail">
                      In {money(w?.allTime?.deposits)} · Out {money(w?.allTime?.withdrawals)} ·{" "}
                      {w?.allTime?.transactionCount} lines
                    </p>
                  </div>
                </section>

                <section className="card finance-chart-card">
                  <div className="finance-chart-head">
                    <h2>Activity</h2>
                    <div className="finance-chart-tabs">
                      <button
                        type="button"
                        className={chartMode === "weekly" ? "" : "muted"}
                        onClick={() => setChartMode("weekly")}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        className={chartMode === "monthly" ? "" : "muted"}
                        onClick={() => setChartMode("monthly")}
                      >
                        Monthly
                      </button>
                    </div>
                  </div>
                  <div className="finance-chart-wrap">
                    <ResponsiveContainer width="100%" height={320}>
                      {chartMode === "weekly" ? (
                        <BarChart data={weeklyChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            formatter={(value, name) => [money(value), name === "deposits" ? "Deposits" : "Withdrawals"]}
                          />
                          <Legend />
                          <Bar dataKey="deposits" name="Deposits" fill="#059669" />
                          <Bar dataKey="withdrawals" name="Withdrawals" fill="#dc2626" />
                        </BarChart>
                      ) : (
                        <BarChart data={monthlyChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                          <Tooltip
                            formatter={(value, name) => [money(value), name === "deposits" ? "Deposits" : "Withdrawals"]}
                          />
                          <Legend />
                          <Bar dataKey="deposits" name="Deposits" fill="#059669" />
                          <Bar dataKey="withdrawals" name="Withdrawals" fill="#dc2626" />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                  <p className="field-hint finance-chart-hint">
                    Weekly buckets start Monday (local). Bars show deposits vs withdrawals per period (not net).
                    {summary.activeOwnerFilter ? ` Owner filter: ${summary.activeOwnerFilter}.` : ""}
                    {!includeServiceIncomeRefs ? " Service/income ref lines excluded." : ""}
                  </p>
                </section>

                <section className="card finance-by-owner-card">
                  <h2>By owner</h2>
                  <p className="field-hint">
                    Same dashboard rules as the cards and chart (Dustin Lee: ref required; optional service/income ref
                    exclusion). <strong>View</strong> sets the owner filter above; <strong>Ledger</strong> opens the
                    ledger with the Owner column filtered.
                  </p>
                  <div className="table-wrap finance-by-owner-wrap">
                    <table className="data-table finance-by-owner-table">
                      <thead>
                        <tr>
                          <th scope="col">Owner</th>
                          <th scope="col">Deposits</th>
                          <th scope="col">Withdrawals</th>
                          <th scope="col">Net</th>
                          <th scope="col">Lines</th>
                          <th scope="col" className="finance-th-actions">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {byOwnerReportRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="finance-table-empty">
                              No rows match the current dashboard rules.
                            </td>
                          </tr>
                        ) : (
                          byOwnerReportRows.map((row) => (
                            <tr key={row.owner}>
                              <td className="cell-ellipsis" title={row.owner}>
                                {row.owner}
                              </td>
                              <td>{money(row.deposits)}</td>
                              <td>{money(row.withdrawals)}</td>
                              <td className={row.net >= 0 ? "finance-net-pos" : "finance-net-neg"}>{money(row.net)}</td>
                              <td>{row.transactionCount}</td>
                              <td className="cell-actions">
                                <button
                                  type="button"
                                  className="small muted"
                                  onClick={() => {
                                    setReportOwner(row.owner);
                                    setDashTab("dashboard");
                                  }}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="small muted"
                                  onClick={() => {
                                    setColumnFilters((prev) => ({ ...prev, owner: row.owner }));
                                    setDashTab("ledger");
                                  }}
                                >
                                  Ledger
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {dashTab === "entry" && (
              <>
                <section className="card finance-form-card">
                  <h2>{editingId ? "Edit record" : "Add record"}</h2>
                  <form className="finance-form-grid" onSubmit={handleSubmit}>
                    <label className="full-width">
                      Type
                      <input name="entryType" value={form.entryType} onChange={handleFormChange} required placeholder="e.g. Deposit from Boss" />
                    </label>
                    <label>
                      Date
                      <input name="date" type="date" value={form.date} onChange={handleFormChange} required />
                    </label>
                    <label className="full-width">
                      Purpose
                      <input name="purpose" value={form.purpose} onChange={handleFormChange} />
                    </label>
                    <label>
                      Owner
                      <input name="owner" value={form.owner} onChange={handleFormChange} />
                    </label>
                    <label>
                      ref
                      <input name="ref" value={form.ref} onChange={handleFormChange} />
                    </label>
                    <label>
                      Deposit
                      <input name="deposit" type="number" step="0.01" min="0" value={form.deposit} onChange={handleFormChange} />
                    </label>
                    <label>
                      Withdraw
                      <input name="withdraw" type="number" step="0.01" min="0" value={form.withdraw} onChange={handleFormChange} />
                    </label>
                    <label className="full-width">
                      TXid
                      <input name="txId" value={form.txId} onChange={handleFormChange} placeholder="URL or hash" />
                    </label>
                    <label className="full-width">
                      Service earnings
                      <input name="serviceEarnings" value={form.serviceEarnings} onChange={handleFormChange} />
                    </label>
                    <div className="actions full-width">
                      <button type="submit" disabled={saving}>
                        {saving ? "Saving…" : editingId ? "Update" : "Add"}
                      </button>
                      {editingId && (
                        <button type="button" className="muted" onClick={resetForm}>
                          Cancel edit
                        </button>
                      )}
                    </div>
                  </form>
                </section>

                <section className="card finance-import-card">
                  <h2>Import Excel</h2>
                  <p className="field-hint">
                    Same layout as your workbook: first row headers — <strong>Type</strong>, <strong>Date</strong>,{" "}
                    <strong>Purpose</strong>, <strong>Owner</strong>, <strong>ref</strong>, <strong>Deposit</strong>,{" "}
                    <strong>Withdraw</strong>, Balance (ignored), <strong>TXid</strong>, <strong>Service Earnings</strong>.
                    First sheet only.
                  </p>
                  <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="finance-import-input" />
                  {importSummary && <p className="finance-import-result">{importSummary}</p>}
                  {importErrors.length > 0 && (
                    <ul className="finance-import-errors">
                      {importErrors.slice(0, 15).map((er, i) => (
                        <li key={`${er.row}-${i}`}>
                          Row {er.row}: {er.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}

            {dashTab === "ledger" && (
              <section className="card table-card finance-table-card">
            <div className="finance-table-card-head">
              <h2 className="table-card-title">
                Ledger ({filteredSortedTransactions.length}
                {hasActiveFilters ? ` of ${transactions.length}` : ""})
              </h2>
              {hasActiveFilters && (
                <button type="button" className="small muted finance-clear-filters" onClick={clearColumnFilters}>
                  Clear column filters
                </button>
              )}
            </div>
            <p className="field-hint">
              Running balance is computed on the full ledger in date order. Filtered rows still show each line&apos;s
              true running total.
            </p>
            <PaginationBar
              page={currentPage}
              pageSize={pageSize}
              totalFound={totalFound}
              totalPages={totalPages}
              totalInBoard={transactions.length}
              boardTotalLabel="total in ledger"
              onPageChange={setPage}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
            <div className="table-wrap finance-table-wrap">
              <table className="data-table finance-data-table">
                <thead>
                  <tr>
                    <th scope="col" className="finance-th-num" aria-label="Row number">
                      #
                    </th>
                    <SortTh
                      id="entryType"
                      label="Type"
                      sortKey={sort.key}
                      sortDir={sort.dir}
                      onSort={toggleSort}
                    />
                    <SortTh id="date" label="Date" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    <SortTh id="purpose" label="Purpose" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    <SortTh id="owner" label="Owner" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    <SortTh id="ref" label="ref" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    <SortTh id="deposit" label="Deposit" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    <SortTh id="withdraw" label="Withdraw" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    <SortTh
                      id="runningBalance"
                      label="Balance"
                      sortKey={sort.key}
                      sortDir={sort.dir}
                      onSort={toggleSort}
                    />
                    <SortTh id="txId" label="TXid" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                    <SortTh
                      id="serviceEarnings"
                      label="Service $"
                      sortKey={sort.key}
                      sortDir={sort.dir}
                      onSort={toggleSort}
                    />
                    <th scope="col" className="finance-th-actions" />
                  </tr>
                  <tr className="finance-filter-row">
                    <th className="finance-th-num" aria-hidden />
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.entryType}
                        onChange={(e) => setFilter("entryType", e.target.value)}
                        aria-label="Filter type"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.date}
                        onChange={(e) => setFilter("date", e.target.value)}
                        aria-label="Filter date"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.purpose}
                        onChange={(e) => setFilter("purpose", e.target.value)}
                        aria-label="Filter purpose"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.owner}
                        onChange={(e) => setFilter("owner", e.target.value)}
                        aria-label="Filter owner"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.ref}
                        onChange={(e) => setFilter("ref", e.target.value)}
                        aria-label="Filter ref"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.deposit}
                        onChange={(e) => setFilter("deposit", e.target.value)}
                        aria-label="Filter deposit"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.withdraw}
                        onChange={(e) => setFilter("withdraw", e.target.value)}
                        aria-label="Filter withdraw"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.runningBalance}
                        onChange={(e) => setFilter("runningBalance", e.target.value)}
                        aria-label="Filter balance"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.txId}
                        onChange={(e) => setFilter("txId", e.target.value)}
                        aria-label="Filter TXid"
                      />
                    </th>
                    <th>
                      <input
                        type="search"
                        className="finance-col-filter"
                        placeholder="Filter…"
                        value={columnFilters.serviceEarnings}
                        onChange={(e) => setFilter("serviceEarnings", e.target.value)}
                        aria-label="Filter service earnings"
                      />
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedTransactions.length === 0 && (
                    <tr>
                      <td colSpan={12} className="finance-table-empty">
                        {transactions.length === 0 ? "No ledger rows yet." : "No rows match the column filters."}
                      </td>
                    </tr>
                  )}
                  {paginatedTransactions.map((row, i) => (
                    <tr key={row._id}>
                      <td className="finance-row-num">{pageStart + i + 1}</td>
                      <td className="cell-ellipsis" title={row.entryType}>
                        {row.entryType}
                      </td>
                      <td className="cell-date">{new Date(row.date).toLocaleDateString()}</td>
                      <td className="cell-ellipsis" title={row.purpose}>
                        {row.purpose || "—"}
                      </td>
                      <td className="cell-ellipsis">{row.owner || "—"}</td>
                      <td className="cell-ellipsis">{row.ref || "—"}</td>
                      <td>{row.deposit ? money(row.deposit) : "—"}</td>
                      <td>{row.withdraw ? money(row.withdraw) : "—"}</td>
                      <td className="finance-bal">{money(row.runningBalance)}</td>
                      <td className="cell-ellipsis cell-txid" title={row.txId}>
                        {row.txId && row.txId.startsWith("http") ? (
                          <a href={row.txId} target="_blank" rel="noreferrer">
                            Link
                          </a>
                        ) : (
                          row.txId || "—"
                        )}
                      </td>
                      <td className="cell-ellipsis">{row.serviceEarnings || "—"}</td>
                      <td className="cell-actions">
                        <button type="button" className="small muted" onClick={() => startEdit(row)}>
                          Edit
                        </button>
                        <button type="button" className="small danger" onClick={() => handleDelete(row._id)}>
                          Del
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              </section>
            )}
          </div>

          <nav className="finance-dash-tabs-nav" aria-label="Finance dashboards">
            <div className="finance-dash-tabs-rail" role="tablist" aria-orientation="vertical">
              {FINANCE_DASH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  id={`finance-dash-tab-${tab.id}`}
                  role="tab"
                  aria-selected={dashTab === tab.id}
                  aria-controls="finance-dash-panel"
                  className={`finance-dash-tab-btn${dashTab === tab.id ? " is-active" : ""}`}
                  onClick={() => setDashTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </nav>
        </div>
      )}
    </main>
  );
}
