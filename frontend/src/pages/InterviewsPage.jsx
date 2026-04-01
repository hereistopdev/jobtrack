import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  createCalendarSource,
  createInterviewRecord,
  deleteCalendarSource,
  deleteInterviewRecord,
  fetchCalendarSources,
  fetchInterviewRecords,
  fetchInterviewSummary,
  importInterviewExcel,
  patchMyInterviewProfiles,
  syncAllCalendarSources,
  syncCalendarSource,
  updateInterviewRecord
} from "../api";
import { useAuth } from "../context/AuthContext";
import { useTeamDirectory } from "../hooks/useTeamDirectory";
import { exportInterviewRecordsToXlsx } from "../utils/exportXlsx";
import { effectiveEndMs } from "../utils/interviewTime";
import {
  formatTimeZoneOptionLabel,
  getDefaultTimeZone,
  getSortedTimeZones,
  utcToZonedLocalString,
  zonedLocalStringToUtc
} from "../utils/interviewZonedTime";

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

const emptyForm = () => {
  const tz = getDefaultTimeZone();
  const now = Date.now();
  return {
  subjectName: "",
  company: "",
  roleTitle: "",
  profile: "",
  stack: "",
  timezone: tz,
  scheduledAt: utcToZonedLocalString(new Date(now), tz),
  scheduledEndAt: utcToZonedLocalString(new Date(now + 60 * 60 * 1000), tz),
  interviewType: "",
  resultStatus: "",
  notes: "",
  jobLinkUrl: "",
  interviewerName: "",
  contactInfo: ""
  };
};

function canModifyRow(row, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const owner = row.createdBy;
  if (!owner) return false;
  const oid = owner._id ? owner._id.toString() : owner.toString();
  return oid === user.id;
}

function formatTimeRange(row) {
  if (!row?.scheduledAt) return "—";
  const s = new Date(row.scheduledAt);
  if (Number.isNaN(s.getTime())) return "—";
  const e = new Date(effectiveEndMs(row));
  const tz = (row.timezone || "").trim();
  const tzOpt = tz ? { timeZone: tz } : {};
  const opt = { dateStyle: "medium", timeStyle: "short", ...tzOpt };
  return `${s.toLocaleString(undefined, opt)} – ${e.toLocaleString(undefined, { timeStyle: "short", ...tzOpt })}`;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [sort, setSort] = useState({ key: "scheduledAt", dir: "desc" });
  const [selectedUserId, setSelectedUserId] = useState("");
  const [subjectPickUserId, setSubjectPickUserId] = useState("");
  const [interviewerPickId, setInterviewerPickId] = useState("");
  const [calendarSources, setCalendarSources] = useState([]);
  const [calendarSourcesLoading, setCalendarSourcesLoading] = useState(false);
  const [calendarSourcesError, setCalendarSourcesError] = useState("");
  const [calForm, setCalForm] = useState({ label: "", sourceType: "ics", icsUrl: "" });
  const [calSaving, setCalSaving] = useState(false);
  const [syncBusyId, setSyncBusyId] = useState("");
  const [syncAllBusy, setSyncAllBusy] = useState(false);

  const loadCalendarSources = useCallback(async () => {
    setCalendarSourcesLoading(true);
    setCalendarSourcesError("");
    try {
      const opts = user?.role === "admin" ? { view: "all" } : {};
      const data = await fetchCalendarSources(opts);
      setCalendarSources(data.sources || []);
    } catch (e) {
      setCalendarSourcesError(e.message || "Failed to load calendar sources");
    } finally {
      setCalendarSourcesLoading(false);
    }
  }, [user?.role]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sum, rows] = await Promise.all([
        fetchInterviewSummary(),
        fetchInterviewRecords()
      ]);
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

  const { timeZoneIds, timeZoneSelectOptions } = useMemo(() => {
    const ids = getSortedTimeZones();
    return {
      timeZoneIds: ids,
      timeZoneSelectOptions: ids.map((iana) => ({
        value: iana,
        label: formatTimeZoneOptionLabel(iana)
      }))
    };
  }, []);

  const dashPanelRef = useRef(null);
  const [dashTab, setDashTab] = useState("dashboard");
  const interviewTabs = useMemo(
    () => [
      { id: "dashboard", label: "Dashboard" },
      { id: "entry", label: "Add or edit" },
      { id: "records", label: "All records" },
      { id: "calendars", label: "Calendar sync" }
    ],
    []
  );

  useEffect(() => {
    dashPanelRef.current?.scrollTo?.(0, 0);
  }, [dashTab]);

  useEffect(() => {
    if (dashTab !== "calendars") return;
    loadCalendarSources();
  }, [dashTab, loadCalendarSources]);

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
    const tz = (row.timezone || "").trim() || getDefaultTimeZone();
    setForm({
      subjectName: row.subjectName || "",
      company: row.company || "",
      roleTitle: row.roleTitle || "",
      profile: row.profile || "",
      stack: row.stack || "",
      timezone: tz,
      scheduledAt: utcToZonedLocalString(row.scheduledAt, tz),
      scheduledEndAt: row.scheduledEndAt
        ? utcToZonedLocalString(row.scheduledEndAt, tz)
        : utcToZonedLocalString(new Date(effectiveEndMs(row)), tz),
      interviewType: row.interviewType || "",
      resultStatus: row.resultStatus || "",
      notes: row.notes || "",
      jobLinkUrl: row.jobLinkUrl || "",
      interviewerName: row.interviewerName || "",
      contactInfo: row.contactInfo || ""
    });
    setDashTab("entry");
    dashPanelRef.current?.scrollTo?.(0, 0);
  };

  const startEditRef = useRef(startEdit);
  startEditRef.current = startEdit;

  useEffect(() => {
    const id = searchParams.get("edit");
    if (!id) return;
    if (loading) return;
    const row = records.find((r) => String(r._id) === id);
    if (!row) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        },
        { replace: true }
      );
      return;
    }
    if (String(editingId || "") === id) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("edit");
          return next;
        },
        { replace: true }
      );
      return;
    }
    startEditRef.current(row);
  }, [loading, records, searchParams, editingId, setSearchParams]);

  /** Calendar drag → ?start=&end=&tz= (UTC ISO) */
  useEffect(() => {
    if (searchParams.get("edit")) return;
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const tz = searchParams.get("tz");
    if (!start || !end || !tz) return;
    if (loading) return;
    const s = new Date(start);
    const e = new Date(end);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("start");
          next.delete("end");
          next.delete("tz");
          return next;
        },
        { replace: true }
      );
      return;
    }
    if (e.getTime() <= s.getTime()) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("start");
          next.delete("end");
          next.delete("tz");
          return next;
        },
        { replace: true }
      );
      return;
    }
    setEditingId(null);
    setSubjectPickUserId("");
    setInterviewerPickId("");
    const base = emptyForm();
    setForm({
      ...base,
      timezone: tz,
      scheduledAt: utcToZonedLocalString(s, tz),
      scheduledEndAt: utcToZonedLocalString(e, tz)
    });
    setDashTab("entry");
    dashPanelRef.current?.scrollTo?.(0, 0);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("start");
        next.delete("end");
        next.delete("tz");
        return next;
      },
      { replace: true }
    );
  }, [loading, searchParams, setSearchParams]);

  const cancelEdit = () => {
    setEditingId(null);
    setSubjectPickUserId("");
    setInterviewerPickId("");
    setForm(emptyForm());
  };

  const handleAddCalendarSource = async (e) => {
    e.preventDefault();
    if (!calForm.label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!calForm.icsUrl.trim()) {
      setError("ICS URL is required.");
      return;
    }
    setCalSaving(true);
    try {
      await createCalendarSource({
        label: calForm.label.trim(),
        sourceType: calForm.sourceType,
        icsUrl: calForm.icsUrl.trim()
      });
      setCalForm({ label: "", sourceType: "ics", icsUrl: "" });
      await loadCalendarSources();
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to add calendar source");
    } finally {
      setCalSaving(false);
    }
  };

  const handleDeleteCalendarSource = async (id) => {
    if (!window.confirm("Remove this source and delete all interviews imported from it?")) return;
    try {
      await deleteCalendarSource(id);
      await loadCalendarSources();
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to delete");
    }
  };

  const handleSyncCalendarSource = async (id) => {
    setSyncBusyId(id);
    try {
      await syncCalendarSource(id);
      await loadCalendarSources();
      await loadAll();
    } catch (err) {
      setError(err.message || "Sync failed");
    } finally {
      setSyncBusyId("");
    }
  };

  const handleSyncAllCalendarSources = async () => {
    if (user?.role !== "admin") return;
    setSyncAllBusy(true);
    setError("");
    try {
      await syncAllCalendarSources();
      await loadCalendarSources();
      await loadAll();
    } catch (err) {
      setError(err.message || "Sync all failed");
    } finally {
      setSyncAllBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const zone = (form.timezone || "").trim() || getDefaultTimeZone();
      const scheduledAt = zonedLocalStringToUtc(form.scheduledAt, zone);
      const scheduledEnd = zonedLocalStringToUtc(form.scheduledEndAt, zone);
      if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        setError("Please set a valid start date and time (check timezone).");
        return;
      }
      if (!scheduledEnd || Number.isNaN(scheduledEnd.getTime()) || scheduledEnd.getTime() <= scheduledAt.getTime()) {
        setError("End time must be after start time.");
        return;
      }
      const payload = {
        subjectName: form.subjectName.trim(),
        company: form.company.trim(),
        roleTitle: form.roleTitle.trim(),
        profile: form.profile.trim(),
        stack: form.stack.trim(),
        timezone: zone,
        scheduledAt: scheduledAt.toISOString(),
        scheduledEndAt: scheduledEnd.toISOString(),
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
      const baseBody = { ...payload, ...subjectUserPayload };

      const runSave = async (skipOverlapCheck) => {
        const body = skipOverlapCheck ? { ...baseBody, skipOverlapCheck: true } : baseBody;
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
      };

      try {
        await runSave(false);
      } catch (err) {
        if (err.status === 409 && Array.isArray(err.conflicts) && err.conflicts.length) {
          const lines = err.conflicts
            .map((c) => {
              const st = new Date(c.scheduledAt).toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short"
              });
              const en = c.scheduledEndAt
                ? new Date(c.scheduledEndAt).toLocaleTimeString(undefined, { timeStyle: "short" })
                : "";
              return `• ${c.subjectName} — ${c.company} (${st}${en ? `–${en}` : ""})`;
            })
            .join("\n");
          if (
            !window.confirm(
              `This slot overlaps another interview:\n\n${lines}\n\nSave anyway?`
            )
          ) {
            return;
          }
          await runSave(true);
        } else {
          throw err;
        }
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
          <p>
            Team-wide interview log — everyone can view; only the person who logged a row (or an admin) can edit or
            delete.{" "}
            <Link to="/interviews/calendar" className="interviews-cal-link">
              Open team calendar
            </Link>{" "}
            to spot overlapping slots.
          </p>
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

      {!loading && (
        <div className="finance-dash-shell interviews-dash-shell">
          <div
            ref={dashPanelRef}
            className="finance-dash-panel"
            role="tabpanel"
            id="interviews-dash-panel"
            aria-labelledby={`interviews-dash-tab-${dashTab}`}
            tabIndex={-1}
          >
            {dashTab === "dashboard" &&
              (summary ? (
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
              ) : (
                <div className="card">
                  <p className="muted-text">Dashboard metrics are not available yet.</p>
                </div>
              ))}

            {dashTab === "entry" && (
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
          <label className="form-field form-field-span2">
            <span>Timezone</span>
            <select
              value={
                form.timezone && !timeZoneIds.includes(form.timezone)
                  ? form.timezone
                  : form.timezone || getDefaultTimeZone()
              }
              onChange={(e) => handleFormChange("timezone", e.target.value)}
              aria-label="Timezone for start and end times"
            >
              {form.timezone && !timeZoneIds.includes(form.timezone) ? (
                <option value={form.timezone}>
                  {formatTimeZoneOptionLabel(form.timezone) || form.timezone}
                </option>
              ) : null}
              {timeZoneSelectOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <span className="muted-text" style={{ fontSize: "0.75rem" }}>
              Each line shows UTC offset and a short name when available (e.g. EST, PST), then the region id. Times are
              stored as UTC on the server.
            </span>
          </label>
          <label className="form-field">
            <span>Start</span>
            <input
              required
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => handleFormChange("scheduledAt", e.target.value)}
              aria-label="Interview start"
            />
          </label>
          <label className="form-field">
            <span>End</span>
            <input
              required
              type="datetime-local"
              value={form.scheduledEndAt}
              onChange={(e) => handleFormChange("scheduledEndAt", e.target.value)}
              aria-label="Interview end"
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
            )}

            {dashTab === "calendars" && (
              <div className="interviews-calendar-sync-stack">
                <section className="card">
                  <h2 className="table-card-title">Import from external calendars</h2>
                  <p className="muted-text">
                    Add a secret ICS URL (from Google Calendar, Outlook, or any HTTPS feed). JobTrack polls it when you
                    sync and creates interview rows for you—no OAuth required. Deleting a source removes its imported
                    rows.
                  </p>
                  <div className="interviews-cal-instructions">
                    <h3>How to sync team calendars into JobTrack</h3>
                    <ol className="interviews-cal-steps-main">
                      <li>
                        In your email calendar, copy the private or publishable ICS URL (see provider details below).
                      </li>
                      <li>
                        In JobTrack, enter a label, choose source type, paste the ICS URL, then click{" "}
                        <strong>Add source</strong>.
                      </li>
                      <li>
                        Click <strong>Sync now</strong> (or <strong>Sync all team sources</strong> if you are admin) to
                        import events.
                      </li>
                      <li>
                        Imported events appear in JobTrack and are attributed to the teammate who owns the source.
                      </li>
                    </ol>
                    <p className="muted-text interviews-cal-tip">
                      The URL should start with <code>https://</code> (if your app shows <code>webcal://</code>, replace
                      that prefix with <code>https://</code>). Treat this link like a password—anyone with it can read
                      your calendar feed.
                    </p>

                    <div className="interviews-cal-provider-list">
                      <details className="interviews-cal-provider">
                        <summary>Google Calendar (Gmail / Google Workspace)</summary>
                        <ol>
                          <li>Open Google Calendar in a browser (calendar.google.com).</li>
                          <li>
                            Click the gear icon → <strong>Settings</strong> (or <strong>See all settings</strong>).
                          </li>
                          <li>
                            In the left column under <strong>Settings for my calendars</strong>, click the calendar you
                            want (not “Events”).
                          </li>
                          <li>
                            Scroll to <strong>Integrate calendar</strong> (or similar).
                          </li>
                          <li>
                            Find <strong>Secret address in iCal format</strong> and copy the URL. That is your private
                            ICS feed (often contains <code>calendar.google.com/calendar/ical/</code>).
                          </li>
                          <li>
                            If you only see a “public” address, you can use that instead, but secret is preferred for
                            privacy.
                          </li>
                        </ol>
                      </details>

                      <details className="interviews-cal-provider">
                        <summary>Microsoft Outlook (Outlook.com / Microsoft 365)</summary>
                        <ol>
                          <li>Open Outlook on the web (outlook.office.com or outlook.live.com).</li>
                          <li>
                            Go to <strong>Settings</strong> (gear) → <strong>View all Outlook settings</strong> →{" "}
                            <strong>Calendar</strong> → <strong>Shared calendars</strong> (wording may vary slightly).
                          </li>
                          <li>
                            Look for <strong>Publish a calendar</strong> or <strong>Publish calendar</strong>, choose the
                            calendar and permission (often “Can view all details” for a full feed).
                          </li>
                          <li>
                            Create or reveal the link, then copy the <strong>ICS</strong> or subscription URL (HTTPS).
                          </li>
                          <li>
                            Some work tenants disable publishing; if you do not see this, ask your admin or use another
                            export method your org allows.
                          </li>
                        </ol>
                      </details>

                      <details className="interviews-cal-provider">
                        <summary>Apple iCloud Calendar</summary>
                        <ol>
                          <li>
                            On a Mac: open the Calendar app → select your calendar → <strong>Share Calendar</strong> (or
                            right‑click the calendar).
                          </li>
                          <li>
                            Enable <strong>Public Calendar</strong> if available, or share a read‑only link—Apple may show
                            a <code>webcal://</code> URL.
                          </li>
                          <li>
                            Copy the link and paste it into JobTrack after changing <code>webcal://</code> to{" "}
                            <code>https://</code> if needed.
                          </li>
                          <li>
                            Alternatively use{" "}
                            <a href="https://www.icloud.com/calendar" target="_blank" rel="noopener noreferrer">
                              icloud.com/calendar
                            </a>{" "}
                            in a browser, select the calendar, open sharing options, and copy the public/subscribe URL
                            if shown.
                          </li>
                        </ol>
                      </details>

                      <details className="interviews-cal-provider">
                        <summary>Proton Calendar</summary>
                        <ol>
                          <li>Open Proton Calendar (web or app) and select the calendar you want.</li>
                          <li>
                            Open calendar <strong>Settings</strong> or <strong>Details</strong> for that calendar (three
                            dots / info icon, depending on client).
                          </li>
                          <li>
                            Look for <strong>Subscribe</strong>, <strong>Calendar link</strong>, or{" "}
                            <strong>Secret link</strong> / subscription URL for read‑only access—copy the HTTPS link.
                          </li>
                          <li>
                            Plan and product UI differ; if no link appears, check Proton’s help for “subscribe” or
                            “calendar URL” for your plan.
                          </li>
                        </ol>
                      </details>

                      <details className="interviews-cal-provider">
                        <summary>Other (ICS / webcal / generic HTTPS feed)</summary>
                        <ol>
                          <li>
                            Use this when your provider gives any HTTPS URL that serves an <code>.ics</code> calendar or
                            states “iCal / ICS subscription”.
                          </li>
                          <li>
                            Yahoo Calendar, Zoho, Fastmail, and others often have “Share” → “ICS” or “Subscribe” under
                            calendar properties—copy that URL.
                          </li>
                          <li>If the feed only works on your office network or VPN, the JobTrack server must reach it.</li>
                        </ol>
                      </details>
                    </div>
                  </div>
                  {user?.role === "admin" && (
                    <div className="interviews-cal-admin-actions">
                      <button
                        type="button"
                        className="small muted"
                        disabled={syncAllBusy}
                        onClick={handleSyncAllCalendarSources}
                      >
                        {syncAllBusy ? "Syncing all…" : "Sync all team sources"}
                      </button>
                    </div>
                  )}
                  <form className="interviews-cal-sync-form" onSubmit={handleAddCalendarSource}>
                    <label className="form-field">
                      <span>Label</span>
                      <input
                        value={calForm.label}
                        onChange={(e) => setCalForm((p) => ({ ...p, label: e.target.value }))}
                        placeholder="e.g. My Google work calendar"
                        maxLength={200}
                      />
                    </label>
                    <label className="form-field">
                      <span>Source type</span>
                      <select
                        value={calForm.sourceType}
                        onChange={(e) => setCalForm((p) => ({ ...p, sourceType: e.target.value }))}
                        aria-label="External calendar type"
                      >
                        <option value="ics">ICS / webcal URL</option>
                        <option value="google">Google (secret address in iCal format)</option>
                        <option value="outlook">Outlook (publish ICS link)</option>
                      </select>
                    </label>
                    <label className="form-field form-field-span2">
                      <span>ICS URL</span>
                      <input
                        value={calForm.icsUrl}
                        onChange={(e) => setCalForm((p) => ({ ...p, icsUrl: e.target.value }))}
                        placeholder="https://…"
                        autoComplete="off"
                      />
                    </label>
                    <div className="interviews-cal-sync-form-actions">
                      <button type="submit" className="primary" disabled={calSaving}>
                        {calSaving ? "Adding…" : "Add source"}
                      </button>
                    </div>
                  </form>
                </section>

                <section className="card">
                  <h2 className="table-card-title">Your sources</h2>
                  {calendarSourcesLoading && <p className="muted-text">Loading…</p>}
                  {calendarSourcesError && <p className="error">{calendarSourcesError}</p>}
                  {!calendarSourcesLoading && !calendarSources.length && (
                    <p className="muted-text">No sources yet. Add an ICS URL above.</p>
                  )}
                  {calendarSources.length > 0 && (
                    <div className="table-scroll-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            {user?.role === "admin" && <th>Owner</th>}
                            <th>Label</th>
                            <th>Type</th>
                            <th>Imports as</th>
                            <th>Last sync</th>
                            <th>Events</th>
                            <th aria-label="Actions" />
                          </tr>
                        </thead>
                        <tbody>
                          {calendarSources.map((s) => (
                            <tr key={s._id}>
                              {user?.role === "admin" && (
                                <td className="muted-cell">
                                  {s.ownerName || s.ownerEmail || s.ownerId}
                                </td>
                              )}
                              <td>{s.label}</td>
                              <td>{s.sourceType}</td>
                              <td className="muted-cell">{s.ownerName || s.ownerEmail || "—"}</td>
                              <td className="muted-cell">
                                {s.lastSyncedAt
                                  ? new Date(s.lastSyncedAt).toLocaleString()
                                  : "—"}
                              </td>
                              <td>{s.lastEventCount ?? "—"}</td>
                              <td className="table-actions">
                                <button
                                  type="button"
                                  className="small muted"
                                  disabled={syncBusyId === s._id}
                                  onClick={() => handleSyncCalendarSource(s._id)}
                                >
                                  {syncBusyId === s._id ? "Syncing…" : "Sync now"}
                                </button>
                                <button
                                  type="button"
                                  className="small danger"
                                  disabled={syncBusyId === s._id}
                                  onClick={() => handleDeleteCalendarSource(s._id)}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {calendarSources.some((s) => s.lastError) && (
                    <div className="interviews-cal-sync-errors">
                      <strong>Last errors</strong>
                      <ul>
                        {calendarSources
                          .filter((s) => s.lastError)
                          .map((s) => (
                            <li key={`err-${s._id}`}>
                              <span className="muted-text">{s.label}: </span>
                              {s.lastError}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </section>
              </div>
            )}

            {dashTab === "records" && (
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
                <SortTh id="scheduledAt" label="Slot" sortKey={sort.key} sortDir={sort.dir} onSort={toggleSort} />
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
                    <td className="interviews-slot-cell">{formatTimeRange(r)}</td>
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
            )}
          </div>

          <nav className="finance-dash-tabs-nav" aria-label="Interviews sections">
            <div className="finance-dash-tabs-rail" role="tablist" aria-orientation="vertical">
              {interviewTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  id={`interviews-dash-tab-${tab.id}`}
                  role="tab"
                  aria-selected={dashTab === tab.id}
                  aria-controls="interviews-dash-panel"
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
