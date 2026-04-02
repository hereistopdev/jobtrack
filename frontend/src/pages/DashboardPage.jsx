import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  addJobInterview,
  createJobLink,
  deleteJobLink,
  fetchJobLinks,
  fetchPipelineTimeseries,
  removeJobInterview,
  updateJobLink
} from "../api";
import { useAuth } from "../context/AuthContext";
import AnalyticsDashboardPanel from "../components/AnalyticsDashboardPanel";
import JobForm from "../components/JobForm";
import ExcelImportCard from "../components/ExcelImportCard";
import JobLinksPipelineSection from "../components/JobLinksPipelineSection";
import JobTable from "../components/JobTable";
import PaginationBar from "../components/PaginationBar";
import { defaultLast7DayRange } from "../utils/dateRange";
import { exportJobLinksToXlsx } from "../utils/exportXlsx";

function canModifyRow(item, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const owner = item.createdBy;
  if (!owner) return false;
  const oid = owner._id ? owner._id.toString() : owner.toString();
  return oid === user.id;
}

const DASH_TABS = ["dashboard", "list", "pipeline"];

function validDashTab(t) {
  return DASH_TABS.includes(t);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [links, setLinks] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleQuery, setRoleQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(() => defaultLast7DayRange().dateFrom);
  const [dateTo, setDateTo] = useState(() => defaultLast7DayRange().dateTo);
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dashTab, setDashTab] = useState(() => {
    const t = searchParams.get("tab");
    return validDashTab(t) ? t : "list";
  });
  const [pipelineSeries, setPipelineSeries] = useState(null);
  const [pipelineSeriesError, setPipelineSeriesError] = useState("");
  const [pipelineSeriesLoading, setPipelineSeriesLoading] = useState(false);
  const [pipelineTimeTab, setPipelineTimeTab] = useState("daily");

  const jobLinkInputRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key?.toLowerCase();
      if (k !== "b" && k !== "f") return;
      if (e.target?.closest?.('[aria-modal="true"]')) return;

      if (k === "b") {
        e.preventDefault();
        e.stopPropagation();
        const el = jobLinkInputRef.current;
        if (el && !el.disabled) {
          el.focus();
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }

      if (k === "f") {
        e.preventDefault();
        e.stopPropagation();
        const el = searchInputRef.current;
        if (el) {
          el.focus();
          el.select?.();
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const loadLinks = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchJobLinks();
      setLinks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (validDashTab(t)) setDashTab(t);
    else setDashTab("list");
  }, [searchParams]);

  const selectDashTab = (t) => {
    setDashTab(t);
    if (t === "list") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: t }, { replace: true });
    }
  };

  useEffect(() => {
    if (dashTab !== "pipeline") return;
    if (pipelineSeries) return;
    let cancelled = false;
    setPipelineSeriesError("");
    setPipelineSeriesLoading(true);
    fetchPipelineTimeseries()
      .then((data) => {
        if (!cancelled) setPipelineSeries(data);
      })
      .catch((e) => {
        if (!cancelled) setPipelineSeriesError(e.message || "Failed to load pipeline charts");
      })
      .finally(() => {
        if (!cancelled) setPipelineSeriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dashTab, pipelineSeries]);

  const handleExcelImported = (items) => {
    setLinks((prev) => [...items, ...prev]);
  };

  const handleSubmit = async (payload) => {
    try {
      if (editingItem) {
        const updated = await updateJobLink(editingItem._id, payload);
        setLinks((prev) => prev.map((item) => (item._id === updated._id ? updated : item)));
        setEditingItem(null);
      } else {
        const created = await createJobLink(payload);
        setLinks((prev) => [created, ...prev]);
      }
    } catch (err) {
      if (err.duplicatePayload) {
        const p = err.duplicatePayload;
        const who = p.addedByLabel || p.addedBy?.email || "Someone";
        window.alert(
          `This company and job URL are already on the board. They were added by ${who}.`
        );
        setError("");
        return;
      }
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Delete this job?");
    if (!confirmed) return;

    try {
      await deleteJobLink(id);
      setLinks((prev) => prev.filter((item) => item._id !== id));
      if (editingItem?._id === id) {
        setEditingItem(null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const mergeLink = (updated) => {
    setLinks((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
  };

  const handleAddInterview = async (jobId, payload) => {
    try {
      const updated = await addJobInterview(jobId, payload);
      mergeLink(updated);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleRemoveInterview = async (jobId, interviewId) => {
    try {
      const updated = await removeJobInterview(jobId, interviewId);
      mergeLink(updated);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const filteredLinks = useMemo(() => {
    const toYmd = (d) => {
      const x = new Date(d);
      if (Number.isNaN(x.getTime())) return "";
      const y = x.getFullYear();
      const m = String(x.getMonth() + 1).padStart(2, "0");
      const day = String(x.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    let list = links;
    const value = query.trim().toLowerCase();
    if (value) {
      list = list.filter((item) => {
        const addedBy = item.createdBy?.email || item.createdBy?.name || "";
        const interviewBlob = (item.interviews || [])
          .map((i) => `${i.label || ""} ${new Date(i.scheduledAt).toLocaleString()}`)
          .join(" ");
        return [item.company, item.title, item.country, item.status, item.notes, addedBy, interviewBlob]
          .join(" ")
          .toLowerCase()
          .includes(value);
      });
    }

    const roleTrim = roleQuery.trim().toLowerCase();
    if (roleTrim) {
      list = list.filter((item) => (item.title || "").toLowerCase().includes(roleTrim));
    }

    if (dateFrom || dateTo) {
      list = list.filter((item) => {
        const ymd = toYmd(item.date);
        if (!ymd) return false;
        if (dateFrom && ymd < dateFrom) return false;
        if (dateTo && ymd > dateTo) return false;
        return true;
      });
    }

    return list;
  }, [links, query, roleQuery, dateFrom, dateTo]);

  const sortedFilteredLinks = useMemo(() => {
    const list = [...filteredLinks];
    const { key, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;

    const valueFor = (item) => {
      switch (key) {
        case "company":
          return (item.company || "").toLowerCase();
        case "title":
          return (item.title || "").toLowerCase();
        case "country":
          return (item.country || "").toLowerCase();
        case "link":
          return (item.link || "").toLowerCase();
        case "date":
          return new Date(item.date).getTime() || 0;
        case "status":
          return (item.status || "").toLowerCase();
        case "interviews":
          return (item.interviews || []).length;
        case "addedBy": {
          const c = item.createdBy;
          const s =
            c && typeof c === "object" ? `${c.email || ""} ${c.name || ""}`.trim().toLowerCase() : "";
          return s;
        }
        case "notes":
          return (item.notes || "").toLowerCase();
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
  }, [filteredLinks, sort]);

  const toggleSort = (columnKey) => {
    setSort((s) =>
      s.key === columnKey
        ? { key: columnKey, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key: columnKey, dir: columnKey === "date" ? "desc" : "asc" }
    );
  };

  const totalFound = sortedFilteredLinks.length;
  const totalPages = totalFound === 0 ? 0 : Math.ceil(totalFound / pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, roleQuery, dateFrom, dateTo, sort.key, sort.dir]);

  useEffect(() => {
    if (totalFound === 0) return;
    const tp = Math.ceil(totalFound / pageSize) || 1;
    setPage((p) => Math.min(Math.max(1, p), tp));
  }, [totalFound, pageSize]);

  const currentPage =
    totalFound === 0 ? 0 : Math.min(Math.max(1, page), Math.max(1, totalPages));
  const pageStart = totalFound === 0 ? 0 : (currentPage - 1) * pageSize;
  const paginatedItems = sortedFilteredLinks.slice(pageStart, pageStart + pageSize);

  return (
    <main className="container container-dashboard">
      <header className="page-header page-header-row">
        <div>
          <h1>Jobs</h1>
          <p>
            Everyone on the team sees all jobs and who added each one. Use <strong>Dashboard</strong> in the right-hand
            rail for team analytics, or <strong>List</strong> / <strong>Pipeline</strong> to browse the table or bid
            status over time. Filters and pagination apply to the list.
          </p>
        </div>
      </header>

      <div className="dashboard-split">
        <aside className="dashboard-panel dashboard-panel-left" aria-label="Add job">
          <JobForm
            linkInputRef={jobLinkInputRef}
            onSubmit={handleSubmit}
            editingItem={editingItem}
            onCancelEdit={() => setEditingItem(null)}
          />
          <ExcelImportCard onImported={handleExcelImported} />
        </aside>

        <div
          className={`dashboard-panel dashboard-panel-right dashboard-joblinks-panel${
            dashTab === "pipeline" ? " dashboard-joblinks-panel-pipeline" : ""
          }${dashTab === "dashboard" ? " dashboard-joblinks-panel-dashboard" : ""}`}
        >
          <div
            className={`finance-dash-shell dashboard-joblinks-shell${
              dashTab === "pipeline"
                ? " dashboard-joblinks-shell-pipeline"
                : dashTab === "dashboard"
                  ? " dashboard-joblinks-shell-dashboard"
                  : ""
            }`}
          >
            <div
              className="finance-dash-panel"
              role="tabpanel"
              id="joblinks-dash-panel"
              aria-labelledby={`joblinks-dash-tab-${dashTab}`}
              tabIndex={-1}
            >
              {dashTab === "dashboard" && <AnalyticsDashboardPanel />}

              {dashTab === "list" && (
                <>
          <section className="toolbar card toolbar-extended">
            <div className="toolbar-filters-row">
              <div className="toolbar-search">
                <input
                  ref={searchInputRef}
                  placeholder="Search company, status, notes, added by…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search"
                />
              </div>
              <label className="toolbar-role-filter">
                Role
                <input
                  type="search"
                  placeholder="e.g. Frontend Engineer"
                  value={roleQuery}
                  onChange={(e) => setRoleQuery(e.target.value)}
                  aria-label="Filter by role"
                />
              </label>
            </div>
            <div className="toolbar-dates">
              <label className="toolbar-date-label">
                From
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="toolbar-date-label">
                To
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
              <div className="toolbar-date-actions">
                <button
                  type="button"
                  className="muted small-inline"
                  onClick={() => {
                    const r = defaultLast7DayRange();
                    setDateFrom(r.dateFrom);
                    setDateTo(r.dateTo);
                  }}
                >
                  Last 7 days
                </button>
                {(dateFrom || dateTo) && (
                  <button type="button" className="muted small-inline" onClick={() => { setDateFrom(""); setDateTo(""); }}>
                    Clear dates
                  </button>
                )}
              </div>
            </div>
            <span className="toolbar-count" aria-live="polite">
              <strong>{totalFound}</strong> found · <span className="toolbar-count-total">{links.length} total</span>
            </span>
          </section>

          {error && <div className="card error">{error}</div>}
          {loading ? (
            <div className="card">Loading jobs…</div>
          ) : (
            <>
              <PaginationBar
                page={currentPage}
                pageSize={pageSize}
                totalFound={totalFound}
                totalPages={totalPages}
                totalInBoard={links.length}
                onPageChange={setPage}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
              <JobTable
                items={paginatedItems}
                totalLinksCount={links.length}
                rowNumberOffset={pageStart}
                currentUser={user}
                canModifyRow={canModifyRow}
                onEdit={setEditingItem}
                onDelete={handleDelete}
                onAddInterview={handleAddInterview}
                onRemoveInterview={handleRemoveInterview}
                sortKey={sort.key}
                sortDir={sort.dir}
                onSort={toggleSort}
                headerExtra={
                  <button
                    type="button"
                    className="small muted table-export-btn"
                    disabled={sortedFilteredLinks.length === 0}
                    onClick={() => exportJobLinksToXlsx(sortedFilteredLinks, "jobs")}
                  >
                    Export XLSX
                  </button>
                }
              />
            </>
          )}
                </>
              )}

              {dashTab === "pipeline" && (
                <>
                  {pipelineSeriesError && <div className="card error">{pipelineSeriesError}</div>}
                  <JobLinksPipelineSection
                    links={links}
                    series={pipelineSeries}
                    timeTab={pipelineTimeTab}
                    onTimeTabChange={setPipelineTimeTab}
                    timeseriesLoading={pipelineSeriesLoading}
                  />
                </>
              )}
            </div>

            <nav className="finance-dash-tabs-nav" aria-label="Board sections">
              <div className="finance-dash-tabs-rail" role="tablist" aria-orientation="vertical">
                <button
                  type="button"
                  id="joblinks-dash-tab-dashboard"
                  role="tab"
                  aria-selected={dashTab === "dashboard"}
                  aria-controls="joblinks-dash-panel"
                  className={`finance-dash-tab-btn${dashTab === "dashboard" ? " is-active" : ""}`}
                  onClick={() => selectDashTab("dashboard")}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  id="joblinks-dash-tab-list"
                  role="tab"
                  aria-selected={dashTab === "list"}
                  aria-controls="joblinks-dash-panel"
                  className={`finance-dash-tab-btn${dashTab === "list" ? " is-active" : ""}`}
                  onClick={() => selectDashTab("list")}
                >
                  List
                </button>
                <button
                  type="button"
                  id="joblinks-dash-tab-pipeline"
                  role="tab"
                  aria-selected={dashTab === "pipeline"}
                  aria-controls="joblinks-dash-panel"
                  className={`finance-dash-tab-btn${dashTab === "pipeline" ? " is-active" : ""}`}
                  onClick={() => selectDashTab("pipeline")}
                >
                  Pipeline
                </button>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </main>
  );
}
