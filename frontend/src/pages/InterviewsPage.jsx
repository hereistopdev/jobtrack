import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  createInterviewRecord,
  deleteInterviewRecord,
  fetchInterviewRecords,
  fetchInterviewSummary,
  importInterviewExcel,
  patchMyInterviewProfiles,
  updateInterviewRecord
} from "../api";
import { useAuth } from "../context/AuthContext";
import { useTeamDirectory } from "../hooks/useTeamDirectory";
import { exportInterviewRecordsToXlsx } from "../utils/exportXlsx";

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2"];

function monthLabel(ym) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function weekShort(ymd) {
  if (!ymd || ymd.length < 10) return ymd;
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SortTh({ id, label, sortKey, sortDir, onSort }) {
  const active = sortKey === id;
  return (
    <th scope="col" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="sortable-heading" onClick={() => onSort(id)}>
        <span>{label}</span>
        <span className="sort-indicator" aria-hidden>
          {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function toLocalInputValue(d) {
  if (!d) return "";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

function defaultScheduledLocal() {
  return toLocalInputValue(new Date());
}

const emptyForm = () => ({
  subjectName: "",
  company: "",
  roleTitle: "",
  profile: "",
  stack: "",
  scheduledAt: defaultScheduledLocal(),
  interviewType: "",
  resultStatus: "",
  notes: "",
  jobLinkUrl: "",
  interviewerName: "",
  contactInfo: ""
});

function canModifyRow(row, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const owner = row.createdBy;
  if (!owner) return false;
  const oid = owner._id ? owner._id.toString() : owner.toString();
  return oid === user.id;
}

function formatShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function InterviewsPage() {
  const { user, refreshUser } = useAuth();
  const { members: teamMembers, loading: teamDirLoading, error: teamDirError } = useTeamDirectory();
  const [summary, setSummary] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef(null);
  const [sort, setSort] = useState({ key: "scheduledAt", dir: "desc" });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [subjectPickUserId, setSubjectPickUserId] = useState("");
  const [interviewerPickId, setInterviewerPickId] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sum, rows] = await Promise.all([fetchInterviewSummary(), fetchInterviewRecords()]);
      setSummary(sum);
      setRecords(rows);
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!summary?.perUser?.length) return;
    setSelectedUserId((prev) => {
      if (prev && summary.perUser.some((p) => p.userId === prev)) return prev;
      if (user?.id && summary.perUser.some((p) => p.userId === user.id)) return user.id;
      return summary.perUser[0].userId;
    });
  }, [summary, user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const blob = [
        r.subjectName,
        r.company,
        r.roleTitle,
        r.profile,
        r.stack,
        r.interviewType,
        r.resultStatus,
        r.notes,
        r.jobLinkUrl,
        r.interviewerName,
        r.contactInfo,
        r.createdBy?.email,
        r.createdBy?.name
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [records, query]);

  const toggleSort = (columnKey) => {
    setSort((s) =>
      s.key === columnKey
        ? { key: columnKey, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: columnKey, dir: columnKey === "scheduledAt" ? "desc" : "asc" }
    );
  };

  const sortedFiltered = useMemo(() => {
    const list = [...filtered];
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;
    const valueFor = (r) => {
      switch (key) {
        case "scheduledAt":
          return new Date(r.scheduledAt).getTime() || 0;
        case "subjectName":
          return (r.subjectName || "").toLowerCase();
        case "company":
          return (r.company || "").toLowerCase();
        case "roleTitle":
          return (r.roleTitle || "").toLowerCase();
        case "profile":
          return (r.profile || "").toLowerCase();
        case "interviewType":
          return (r.interviewType || "").toLowerCase();
        case "resultStatus":
          return (r.resultStatus || "").toLowerCase();
        case "loggedBy": {
          const c = r.createdBy;
          const s =
            c && typeof c === "object" ? `${c.name || ""} ${c.email || ""}`.trim().toLowerCase() : "";
          return s;
        }
        default:
          return "";
      }
    };
    list.sort((a, b) => {
      const va = valueFor(a);
      const vb = valueFor(b);
      if (typeof va === "number" && typeof vb === "number") {
        if (va === vb) return 0;
        return va < vb ? -mult : mult;
      }
      const sa = String(va);
      const sb = String(vb);
      if (sa === sb) return 0;
      return sa < sb ? -mult : mult;
    });
    return list;
  }, [filtered, sort]);

  const byResultChart = (summary?.byResult || []).map((x) => ({ name: x.key, count: x.count }));
  const byTypeChart = (summary?.byInterviewType || []).map((x) => ({ name: x.key, count: x.count }));
  const byLoggedByChart = (summary?.byLoggedBy || []).slice(0, 14).map((x) => ({
    name: x.label.length > 18 ? `${x.label.slice(0, 16)}…` : x.label,
    full: x.label,
    count: x.count
  }));
  const byProfileChart = (summary?.byProfile || []).slice(0, 14).map((x) => ({
    name: x.key.length > 16 ? `${x.key.slice(0, 14)}…` : x.key,
    full: x.key,
    count: x.count
  }));
  const byMonthChart = (summary?.byMonth || []).map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    count: m.count
  }));

  const selectedUserSeries = useMemo(() => {
    const list = summary?.perUser || [];
    return list.find((p) => p.userId === selectedUserId) || list[0] || null;
  }, [summary, selectedUserId]);

  const weeklyForUser = useMemo(() => {
    if (!selectedUserSeries?.weekly?.length) return [];
    return selectedUserSeries.weekly.map((w) => ({
      ...w,
      label: weekShort(w.week)
    }));
  }, [selectedUserSeries]);

  const monthlyForUser = useMemo(() => {
    if (!selectedUserSeries?.monthly?.length) return [];
    return selectedUserSeries.monthly.map((m) => ({
      ...m,
      label: monthLabel(m.month)
    }));
  }, [selectedUserSeries]);

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const startEdit = (row) => {
    setEditingId(row._id);
    const su = row.subjectUserId;
    const sid =
      su && typeof su === "object" && su._id
        ? String(su._id)
        : su
          ? String(su)
          : "";
    setSubjectPickUserId(sid && teamMembers.some((m) => m.id === sid) ? sid : "");
    const iname = (row.interviewerName || "").trim();
    const im = teamMembers.find((m) => m.displayName === iname);
    setInterviewerPickId(im ? im.id : "");
    setForm({
      subjectName: row.subjectName || "",
      company: row.company || "",
      roleTitle: row.roleTitle || "",
      profile: row.profile || "",
      stack: row.stack || "",
      scheduledAt: toLocalInputValue(row.scheduledAt),
      interviewType: row.interviewType || "",
      resultStatus: row.resultStatus || "",
      notes: row.notes || "",
      jobLinkUrl: row.jobLinkUrl || "",
      interviewerName: row.interviewerName || "",
      contactInfo: row.contactInfo || ""
    });
    document.getElementById("interviews-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSubjectPickUserId("");
    setInterviewerPickId("");
    setForm(emptyForm());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const scheduledAt = new Date(form.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        setError("Please set a valid date and time.");
        return;
      }
      const payload = {
        subjectName: form.subjectName.trim(),
        company: form.company.trim(),
        roleTitle: form.roleTitle.trim(),
        profile: form.profile.trim(),
        stack: form.stack.trim(),
        scheduledAt: scheduledAt.toISOString(),
        interviewType: form.interviewType.trim(),
        resultStatus: form.resultStatus.trim(),
        notes: form.notes.trim(),
        jobLinkUrl: form.jobLinkUrl.trim(),
        interviewerName: form.interviewerName.trim(),
        contactInfo: form.contactInfo.trim()
      };
      const subjectUserPayload =
        editingId != null
          ? { subjectUserId: subjectPickUserId || null }
          : subjectPickUserId
            ? { subjectUserId: subjectPickUserId }
            : {};
      const body = { ...payload, ...subjectUserPayload };
      if (editingId) {
        const updated = await updateInterviewRecord(editingId, body);
        setRecords((prev) => prev.map((r) => (r._id === updated._id ? updated : r)));
        cancelEdit();
      } else {
        const created = await createInterviewRecord(body);
        setRecords((prev) => [created, ...prev]);
        setSubjectPickUserId("");
        setInterviewerPickId("");
        setForm(emptyForm());
      }
      if (payload.profile) {
        const list = user?.interviewProfiles || [];
        if (user && !list.includes(payload.profile)) {
          try {
            await patchMyInterviewProfiles([...list, payload.profile]);
            await refreshUser();
          } catch {
            /* optional save of profile label */
          }
        }
      }
      const sum = await fetchInterviewSummary();
      setSummary(sum);
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this interview record?")) return;
    try {
      await deleteInterviewRecord(id);
      setRecords((prev) => prev.filter((r) => r._id !== id));
      if (editingId === id) cancelEdit();
      const sum = await fetchInterviewSummary();
      setSummary(sum);
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportBusy(true);
    setError("");
    try {
      const result = await importInterviewExcel(file);
      await loadAll();
      const errMsg =
        result.errors?.length > 0
          ? `\n${result.errors.slice(0, 5).map((x) => `${x.sheet} row ${x.row}: ${x.message}`).join("\n")}${result.errors.length > 5 ? "\n…" : ""}`
          : "";
      window.alert(`Imported ${result.created} row(s).${errMsg}`);
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImportBusy(false);
    }
  };

  return (
    <main className="container container-dashboard analytics-page interviews-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Interviews</h1>
          <p>Team-wide interview log — everyone can view; only the person who logged a row (or an admin) can edit or delete.</p>
        </div>
        <div className="page-header-actions">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={handleImport}
          />
          <button
            type="button"
            className="small muted table-export-btn"
            disabled={importBusy}
            onClick={() => importInputRef.current?.click()}
          >
            {importBusy ? "Importing…" : "Import XLSX"}
          </button>
          <button
            type="button"
            className="small muted table-export-btn"
            disabled={!sortedFiltered.length}
            onClick={() => exportInterviewRecordsToXlsx(sortedFiltered, "interview-records")}
          >
            Export XLSX
          </button>
        </div>
      </header>

      {loading && <div className="card">Loading interviews…</div>}
      {error && <div className="card error">{error}</div>}

      {!loading && summary && (
        <>
          <div className="analytics-kpis card">
            <div className="analytics-kpi">
              <span className="analytics-kpi-value">{summary.total}</span>
              <span className="analytics-kpi-label">Total interviews</span>
            </div>
            <div className="analytics-kpi">
              <span className="analytics-kpi-value">{summary.last30Days}</span>
              <span className="analytics-kpi-label">Last 30 days</span>
            </div>
          </div>

          <div className="analytics-grid">
            <section className="card analytics-chart-card">
              <h2 className="table-card-title">By result</h2>
              <div className="analytics-chart-wrap">
                {byResultChart.length === 0 ? (
                  <p className="analytics-empty">No data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byResultChart} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (v.length > 14 ? `${v.slice(0, 12)}…` : v)}
                      />
                      <Tooltip formatter={(value) => [value, "Count"]} />
                      <Bar dataKey="count" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="card analytics-chart-card">
              <h2 className="table-card-title">By interview type</h2>
              <div className="analytics-chart-wrap">
                {byTypeChart.length === 0 ? (
                  <p className="analytics-empty">No data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byTypeChart} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={70} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [value, "Count"]} />
                      <Bar dataKey="count" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="card analytics-chart-card">
              <h2 className="table-card-title">Logged by (who added the row)</h2>
              <div className="analytics-chart-wrap">
                {byLoggedByChart.length === 0 ? (
                  <p className="analytics-empty">No data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byLoggedByChart} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value) => [value, "Count"]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""}
                      />
                      <Bar dataKey="count" fill={COLORS[2]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="card analytics-chart-card">
              <h2 className="table-card-title">By profile</h2>
              <div className="analytics-chart-wrap">
                {byProfileChart.length === 0 ? (
                  <p className="analytics-empty">No data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={byProfileChart} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value) => [value, "Count"]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""}
                      />
                      <Bar dataKey="count" fill={COLORS[4]} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="card analytics-chart-card analytics-chart-wide">
              <h2 className="table-card-title">All interviews by month (scheduled)</h2>
              <div className="analytics-chart-wrap">
                {byMonthChart.length === 0 ? (
                  <p className="analytics-empty">No timeline yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={byMonthChart} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [value, "Interviews"]} />
                      <Line type="monotone" dataKey="count" stroke={COLORS[3]} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>

          <section className="card analytics-chart-card interviews-per-user-card">
            <div className="interviews-per-user-head">
              <h2 className="table-card-title">Per user: weekly and monthly</h2>
              <label className="interviews-per-user-select">
                <span className="muted-text">Person</span>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  aria-label="Select user for interview charts"
                >
                  {(summary?.perUser || []).map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.label} ({p.total})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {selectedUserSeries ? (
              <div className="analytics-grid interviews-per-user-charts">
                <div className="analytics-chart-card interviews-inner-chart">
                  <h3 className="interviews-subchart-title">Weekly (Mon–Sun, by scheduled date)</h3>
                  <div className="analytics-chart-wrap">
                    {weeklyForUser.length === 0 ? (
                      <p className="analytics-empty">No weeks.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={weeklyForUser} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={72} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(value) => [value, "Interviews"]} labelFormatter={(l) => `Week of ${l}`} />
                          <Bar dataKey="count" fill={COLORS[5]} radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
                <div className="analytics-chart-card interviews-inner-chart">
                  <h3 className="interviews-subchart-title">Monthly (by scheduled date)</h3>
                  <div className="analytics-chart-wrap">
                    {monthlyForUser.length === 0 ? (
                      <p className="analytics-empty">No months.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={monthlyForUser} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(value) => [value, "Interviews"]} />
                          <Line type="monotone" dataKey="count" stroke={COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="analytics-empty">No per-user data yet.</p>
            )}
          </section>
        </>
      )}

      <section id="interviews-form" className="card interviews-form-card">
        <h2 className="table-card-title">{editingId ? "Edit interview" : "Log interview"}</h2>
        {teamDirError && <p className="field-hint muted-text">Team list unavailable ({teamDirError}); you can still type names.</p>}
        {teamDirLoading && <p className="field-hint muted-text">Loading team list…</p>}
        <form onSubmit={handleSubmit} className="interviews-form-grid">
          <label className="form-field form-field-span2">
            <span>Subject — pick teammate or type</span>
            <select
              value={subjectPickUserId}
              onChange={(e) => {
                const id = e.target.value;
                setSubjectPickUserId(id);
                if (id) {
                  const m = teamMembers.find((x) => x.id === id);
                  if (m) handleFormChange("subjectName", m.displayName);
                }
              }}
              aria-label="Choose subject from team"
            >
              <option value="">Other (type name below)</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.email})
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-field-span2">
            <span>Subject (teammate) name</span>
            <input
              required
              value={form.subjectName}
              onChange={(e) => {
                const v = e.target.value;
                handleFormChange("subjectName", v);
                if (subjectPickUserId) {
                  const m = teamMembers.find((x) => x.id === subjectPickUserId);
                  if (m && v.trim() !== m.displayName) setSubjectPickUserId("");
                }
              }}
              placeholder="Name (or choose from list above)"
            />
          </label>
          <label className="form-field">
            <span>Company</span>
            <input required value={form.company} onChange={(e) => handleFormChange("company", e.target.value)} />
          </label>
          <label className="form-field">
            <span>Role / title</span>
            <input required value={form.roleTitle} onChange={(e) => handleFormChange("roleTitle", e.target.value)} />
          </label>
          <label className="form-field">
            <span>When</span>
            <input
              required
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => handleFormChange("scheduledAt", e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Profile</span>
            <input
              list="interview-profile-options"
              value={form.profile}
              onChange={(e) => handleFormChange("profile", e.target.value)}
              placeholder="e.g. Frontend, Staff, Contract"
            />
            <datalist id="interview-profile-options">
              {(user?.interviewProfiles || []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <span className="muted-text" style={{ fontSize: "0.75rem" }}>
              You can maintain several profiles; picking a new name saves it to your list for next time.
            </span>
          </label>
          <label className="form-field">
            <span>Stack</span>
            <input value={form.stack} onChange={(e) => handleFormChange("stack", e.target.value)} />
          </label>
          <label className="form-field">
            <span>Interview type</span>
            <input value={form.interviewType} onChange={(e) => handleFormChange("interviewType", e.target.value)} />
          </label>
          <label className="form-field">
            <span>Result</span>
            <input value={form.resultStatus} onChange={(e) => handleFormChange("resultStatus", e.target.value)} />
          </label>
          <label className="form-field form-field-span2">
            <span>Job link</span>
            <input
              type="url"
              value={form.jobLinkUrl}
              onChange={(e) => handleFormChange("jobLinkUrl", e.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="form-field form-field-span2">
            <span>Interviewer — pick or type</span>
            <select
              value={interviewerPickId}
              onChange={(e) => {
                const id = e.target.value;
                setInterviewerPickId(id);
                if (id) {
                  const m = teamMembers.find((x) => x.id === id);
                  if (m) handleFormChange("interviewerName", m.displayName);
                }
              }}
              aria-label="Choose interviewer from team"
            >
              <option value="">Other / external (type below)</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-field-span2">
            <span>Interviewer name</span>
            <input
              value={form.interviewerName}
              onChange={(e) => {
                const v = e.target.value;
                handleFormChange("interviewerName", v);
                if (interviewerPickId) {
                  const m = teamMembers.find((x) => x.id === interviewerPickId);
                  if (m && v.trim() !== m.displayName) setInterviewerPickId("");
                }
              }}
              placeholder="Optional"
            />
          </label>
          <label className="form-field">
            <span>Contact info</span>
            <input value={form.contactInfo} onChange={(e) => handleFormChange("contactInfo", e.target.value)} />
          </label>
          <label className="form-field form-field-span2">
            <span>Notes</span>
            <textarea rows={2} value={form.notes} onChange={(e) => handleFormChange("notes", e.target.value)} />
          </label>
          <div className="interviews-form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Add record"}
            </button>
            {editingId && (
              <button type="button" className="muted" onClick={cancelEdit}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card table-card">
        <div className="table-toolbar">
          <input
            type="search"
            className="table-search"
            placeholder="Filter table…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter interviews"
          />
          <span className="table-meta">{sortedFiltered.length} row(s)</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh id="scheduledAt" label="When" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh id="subjectName" label="Subject" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh id="company" label="Company" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh id="roleTitle" label="Role" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh id="profile" label="Profile" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh id="interviewType" label="Type" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh id="resultStatus" label="Result" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <SortTh id="loggedBy" label="Logged by" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map((r) => {
                const who =
                  r.createdBy && typeof r.createdBy === "object"
                    ? r.createdBy.name || r.createdBy.email || "—"
                    : "—";
                const canEdit = canModifyRow(r, user);
                return (
                  <tr key={r._id}>
                    <td>{formatShortDate(r.scheduledAt)}</td>
                    <td>{r.subjectName}</td>
                    <td>{r.company}</td>
                    <td>{r.roleTitle}</td>
                    <td>{r.profile || "—"}</td>
                    <td>{r.interviewType || "—"}</td>
                    <td>{r.resultStatus || "—"}</td>
                    <td className="muted-cell">{who}</td>
                    <td className="table-actions">
                      {canEdit && (
                        <>
                          <button type="button" className="small muted" onClick={() => startEdit(r)}>
                            Edit
                          </button>
                          <button type="button" className="small danger" onClick={() => handleDelete(r._id)}>
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!sortedFiltered.length && !loading && <p className="table-empty">No rows match.</p>}
        </div>
      </section>
    </main>
  );
}
