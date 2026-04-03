import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fetchInterviewCalendar, fetchInterviewRecord } from "../api";
import TimeZoneCombobox from "../components/TimeZoneCombobox";
import { getInterviewStageBadge } from "../utils/interviewStage";
import { effectiveEndMs, rangesOverlap } from "../utils/interviewTime";
import { buildProfileFilterOptions, profileVisibilityKey } from "../utils/interviewCalendarProfileFilter";
import { buildUserColorPalette, eventCalendarStyle } from "../utils/interviewOwnerColors";
import {
  CALENDAR_DEFAULT_TZ,
  formatTimeZoneOptionLabel,
  getSortedTimeZones,
  startOfWeekMondayInZone
} from "../utils/interviewZonedTime";

/** Fixed reference column (always JST) to the left of the selectable “view as” timezone gutter. */
const CALENDAR_REFERENCE_TZ = "Asia/Tokyo";
const CALENDAR_REFERENCE_TZ_LABEL = "JST";

/** 24h × 30min = 48 rows (Google Calendar–style day grid). */
const SLOTS_PER_DAY = 48;
const SLOT_MINUTES = 30;
const PX_PER_SLOT = 32;
const GRID_HEIGHT = SLOTS_PER_DAY * PX_PER_SLOT;

/** Normalize API `_id` (string, ObjectId, or { $oid }) so layout maps and overlap sets match. */
function stableInterviewId(ev) {
  const raw = ev?._id ?? ev?.id;
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") {
    if (typeof raw.toHexString === "function") return raw.toHexString();
    if ("$oid" in raw && raw.$oid != null) return String(raw.$oid);
  }
  return String(raw);
}

function loggedByLabel(row) {
  const c = row.createdBy;
  if (c && typeof c === "object") return c.name || c.email || "—";
  return "—";
}

function InterviewCalStageBadge({ interviewType }) {
  const badge = getInterviewStageBadge(interviewType);
  if (!badge) return null;
  return (
    <span
      className={`interview-cal-stage-badge interview-cal-stage-badge--s${badge.index}`}
      title={`Interview type: ${badge.label}`}
    >
      {badge.label}
    </span>
  );
}

/**
 * Clip event to [dayStart, dayEnd) in `zone`; returns wall-time bounds in epoch ms.
 * Single source of truth for “is this row on this calendar day?” and overlap.
 */
function clipIntervalWallMs(dayStart, ev, zone) {
  const dayEnd = dayStart.plus({ days: 1 });
  const evS = DateTime.fromJSDate(new Date(ev.scheduledAt), { zone: "utc" }).setZone(zone);
  const evE = DateTime.fromJSDate(new Date(effectiveEndMs(ev)), { zone: "utc" }).setZone(zone);
  const clipStart = evS > dayStart ? evS : dayStart;
  const clipEnd = evE < dayEnd ? evE : dayEnd;
  if (clipEnd <= clipStart) return null;
  return { startMs: clipStart.toMillis(), endMs: clipEnd.toMillis() };
}

function intervalsOverlapMs(a, b) {
  if (!a || !b) return false;
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/** Minutes from local midnight for layout (derived from clip ms so overlap and grid agree). */
function clipEventToDay(dayStart, ev, zone) {
  const iv = clipIntervalWallMs(dayStart, ev, zone);
  if (!iv) return null;
  const clipStart = DateTime.fromMillis(iv.startMs, { zone });
  const clipEnd = DateTime.fromMillis(iv.endMs, { zone });
  const startM = clipStart.diff(dayStart, "minutes").minutes;
  const endM = clipEnd.diff(dayStart, "minutes").minutes;
  return { startM, endM };
}

function eventBlockStyle(clip) {
  const { startM, endM } = clip;
  const top = (startM / SLOT_MINUTES) * PX_PER_SLOT;
  const dur = Math.max(endM - startM, 5);
  const height = Math.max((dur / SLOT_MINUTES) * PX_PER_SLOT, 22);
  return { top, height };
}

function sortClusterEvents(dayStart, zone, cluster) {
  return [...cluster].sort((a, b) => {
    const ia = clipIntervalWallMs(dayStart, a, zone);
    const ib = clipIntervalWallMs(dayStart, b, zone);
    if (!ia || !ib) return stableInterviewId(a).localeCompare(stableInterviewId(b));
    if (ia.startMs !== ib.startMs) return ia.startMs - ib.startMs;
    if (ia.endMs !== ib.endMs) return ia.endMs - ib.endMs;
    return stableInterviewId(a).localeCompare(stableInterviewId(b));
  });
}

function clusterWrapperMetrics(dayStart, zone, sortedCluster) {
  let minTop = Infinity;
  let maxBottom = 0;
  for (const ev of sortedCluster) {
    const clip = clipEventToDay(dayStart, ev, zone);
    if (!clip) continue;
    const st = eventBlockStyle(clip);
    minTop = Math.min(minTop, st.top);
    maxBottom = Math.max(maxBottom, st.top + st.height);
  }
  if (!Number.isFinite(minTop)) minTop = 0;
  return { wrapperTop: minTop, wrapperHeight: Math.max(maxBottom - minTop, 22) };
}

/**
 * Flat list of render items: standalone interviews, or one wrapper per overlap cluster.
 */
function buildDayRenderPlan(list, dayStart, zone) {
  const clusterIdxGroups = buildOverlapClustersForDay(list, dayStart, zone);
  const inClusterIdx = new Set();
  for (const idxs of clusterIdxGroups) {
    for (const i of idxs) inClusterIdx.add(i);
  }
  const items = [];
  for (const idxs of clusterIdxGroups) {
    const cluster = idxs.map((i) => list[i]);
    const sorted = sortClusterEvents(dayStart, zone, cluster);
    const { wrapperTop, wrapperHeight } = clusterWrapperMetrics(dayStart, zone, sorted);
    items.push({
      kind: "cluster",
      cluster: sorted,
      wrapperTop,
      wrapperHeight,
      key: idxs.join("|")
    });
  }
  for (let i = 0; i < list.length; i++) {
    if (inClusterIdx.has(i)) continue;
    const ev = list[i];
    const clip = clipEventToDay(dayStart, ev, zone);
    if (!clip) continue;
    items.push({ kind: "single", ev, key: `${stableInterviewId(ev)}-idx${i}` });
  }
  items.sort((a, b) => {
    const topA =
      a.kind === "cluster"
        ? a.wrapperTop
        : eventBlockStyle(clipEventToDay(dayStart, a.ev, zone)).top;
    const topB =
      b.kind === "cluster"
        ? b.wrapperTop
        : eventBlockStyle(clipEventToDay(dayStart, b.ev, zone)).top;
    return topA - topB;
  });
  return items;
}

/**
 * Transitive overlap groups: returns **list index** groups (not ids), so duplicate rows stay distinct.
 * Edge if clipped intervals overlap, or full `rangesOverlap` when both have clips (catches edge mismatches).
 */
function buildOverlapClustersForDay(list, dayStart, zone) {
  const n = list.length;
  const ivs = list.map((ev) => clipIntervalWallMs(dayStart, ev, zone));
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    if (!ivs[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!ivs[j]) continue;
      const clipOverlap = intervalsOverlapMs(ivs[i], ivs[j]);
      const rangeOverlap = rangesOverlap(list[i], list[j]);
      if (clipOverlap || rangeOverlap) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  const seen = new Array(n).fill(false);
  const clusters = [];
  for (let i = 0; i < n; i++) {
    if (seen[i] || !ivs[i]) continue;
    const compIdx = [];
    const stack = [i];
    seen[i] = true;
    while (stack.length) {
      const u = stack.pop();
      compIdx.push(u);
      for (const v of adj[u]) {
        if (!seen[v]) {
          seen[v] = true;
          stack.push(v);
        }
      }
    }
    if (compIdx.length > 1) clusters.push(compIdx);
  }
  return clusters;
}

/** Pixel Y within grid → slot index [0, SLOTS_PER_DAY - 1]. */
function yToSlot(clientY, gridEl) {
  const rect = gridEl.getBoundingClientRect();
  const y = clientY - rect.top;
  const raw = Math.floor(y / PX_PER_SLOT);
  return Math.max(0, Math.min(SLOTS_PER_DAY - 1, raw));
}

/** Row appears in this calendar column iff its clipped wall-time interval in `zone` is non-empty. */
function eventOverlapsDay(ev, dayStart, zone) {
  return clipIntervalWallMs(dayStart, ev, zone) != null;
}

function formatRangeInZone(ev, zone) {
  const z = zone || CALENDAR_DEFAULT_TZ;
  const s = DateTime.fromJSDate(new Date(ev.scheduledAt), { zone: "utc" }).setZone(z);
  const e = DateTime.fromJSDate(new Date(effectiveEndMs(ev)), { zone: "utc" }).setZone(z);
  if (!s.isValid || !e.isValid) return "—";
  return `${s.toFormat("EEE, MMM d · h:mm a")} – ${e.toFormat("h:mm a")}`;
}

/** @typedef {"day" | "week" | "month"} CalViewMode */

const PROFILE_VISIBILITY_STORAGE_KEY = "jobtrack.interviewCal.profileVisibility";

function loadProfileVisibilityFromStorage() {
  try {
    const raw = localStorage.getItem(PROFILE_VISIBILITY_STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && typeof p === "object" && !Array.isArray(p)) return p;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export default function InterviewCalendarPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [calendarTz, setCalendarTz] = useState(CALENDAR_DEFAULT_TZ);
  /** Anchor date (YYYY-MM-DD in `calendarTz`) for whichever view is active. */
  const [viewDateIso, setViewDateIso] = useState(() =>
    DateTime.now().setZone(CALENDAR_DEFAULT_TZ).toISODate()
  );
  const [viewMode, setViewMode] = useState(/** @type {CalViewMode} */ ("week"));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEv, setSelectedEv] = useState(null);
  /** Drag-select preview: same column, min/max slot while pointer down. */
  const [dragDraft, setDragDraft] = useState(null);
  const dragStartRef = useRef(null);
  /** Recomputed on interval so the “now” line moves. */
  const [nowTick, setNowTick] = useState(0);

  /** Per–profile checkbox visibility (includes teammates’ profiles). */
  const [profileVisibility, setProfileVisibility] = useState(loadProfileVisibilityFromStorage);

  const timeZoneIds = useMemo(() => getSortedTimeZones(), []);
  const timeZoneSelectOptions = useMemo(
    () => timeZoneIds.map((iana) => ({ value: iana, label: formatTimeZoneOptionLabel(iana) })),
    [timeZoneIds]
  );

  /** Include current value when it is not in the platform list (legacy / manual URL). */
  const timeZoneComboboxOptions = useMemo(() => {
    const base = timeZoneSelectOptions;
    if (calendarTz && !timeZoneIds.includes(calendarTz)) {
      return [
        { value: calendarTz, label: formatTimeZoneOptionLabel(calendarTz) || calendarTz },
        ...base.filter((o) => o.value !== calendarTz)
      ];
    }
    return base;
  }, [calendarTz, timeZoneIds, timeZoneSelectOptions]);

  const anchorDt = useMemo(() => {
    const base = DateTime.fromISO(`${viewDateIso}T00:00:00`, { zone: calendarTz });
    return base.isValid ? base : DateTime.now().setZone(calendarTz).startOf("day");
  }, [viewDateIso, calendarTz]);

  /** Days shown in the current view (week: 7 Mon–Sun, day: 1, month: 42-cell grid). */
  const visibleDays = useMemo(() => {
    if (viewMode === "week") {
      const mon = startOfWeekMondayInZone(anchorDt.toJSDate(), calendarTz);
      return Array.from({ length: 7 }, (_, i) => mon.plus({ days: i }));
    }
    if (viewMode === "day") {
      return [anchorDt.startOf("day")];
    }
    const monthStart = anchorDt.startOf("month");
    const gridStart =
      monthStart.weekday === 1 ? monthStart : monthStart.minus({ days: monthStart.weekday - 1 });
    return Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
  }, [viewMode, anchorDt, calendarTz]);

  const fromIso = useMemo(
    () => visibleDays[0].startOf("day").toUTC().toISO(),
    [visibleDays]
  );
  const toIso = useMemo(
    () => visibleDays[visibleDays.length - 1].plus({ days: 1 }).startOf("day").toUTC().toISO(),
    [visibleDays]
  );

  const rangeTitle = useMemo(() => {
    if (viewMode === "day") return anchorDt.toFormat("EEEE, MMMM d, yyyy");
    if (viewMode === "week") {
      const a = visibleDays[0];
      const b = visibleDays[6];
      if (a.month === b.month && a.year === b.year) return `${a.toFormat("MMM d")} – ${b.toFormat("d, yyyy")}`;
      if (a.year === b.year) return `${a.toFormat("MMM d")} – ${b.toFormat("MMM d, yyyy")}`;
      return `${a.toFormat("MMM d, yyyy")} – ${b.toFormat("MMM d, yyyy")}`;
    }
    return anchorDt.toFormat("MMMM yyyy");
  }, [viewMode, anchorDt, visibleDays]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchInterviewCalendar(fromIso, toIso);
      setRows(data.interviews || []);
    } catch (e) {
      setError(e.message || "Failed to load calendar");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso]);

  useEffect(() => {
    load();
  }, [load]);

  /** Deep link: /interviews/calendar?event=<interviewId> — scroll to week/day and open details. */
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      try {
        const doc = await fetchInterviewRecord(eventId);
        if (cancelled || !doc?.scheduledAt) return;
        const d = DateTime.fromJSDate(new Date(doc.scheduledAt), { zone: "utc" }).setZone(calendarTz);
        if (d.isValid) setViewDateIso(d.toISODate());
      } catch {
        /* invalid id or network */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, calendarTz]);

  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId || loading) return;
    const ev = rows.find((r) => stableInterviewId(r) === eventId);
    if (!ev) return;
    setSelectedEv(ev);
    const next = new URLSearchParams(searchParams);
    next.delete("event");
    setSearchParams(next, { replace: true });
  }, [searchParams, rows, loading, setSearchParams]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const nowLine = useMemo(() => {
    if (viewMode === "month") return null;
    const now = DateTime.now().setZone(calendarTz);
    const todayIso = now.toISODate();
    const inRange = visibleDays.some((d) => d.toISODate() === todayIso);
    if (!inRange) return null;
    const dayStart = DateTime.fromISO(`${todayIso}T00:00:00`, { zone: calendarTz });
    const minutesFromMidnight = now.diff(dayStart, "minutes").minutes;
    const top = (minutesFromMidnight / SLOT_MINUTES) * PX_PER_SLOT;
    const clamped = Math.max(0, Math.min(top, GRID_HEIGHT - 2));
    return { top: clamped, label: now.toFormat("h:mm a") };
  }, [calendarTz, visibleDays, nowTick, viewMode]);

  const referenceTzNowLabel = useMemo(() => {
    const dt = DateTime.now().setZone(CALENDAR_REFERENCE_TZ);
    return dt.isValid ? dt.toFormat("h:mm a") : "—";
  }, [nowTick]);

  const viewTzHeadAbbr = useMemo(() => {
    if (!calendarTz) return "";
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: calendarTz,
        timeZoneName: "short"
      }).formatToParts(new Date());
      const abbr = (parts.find((p) => p.type === "timeZoneName")?.value || "").trim();
      return abbr || calendarTz.split("/").pop() || calendarTz;
    } catch {
      return calendarTz.split("/").pop() || calendarTz;
    }
  }, [calendarTz, nowTick]);

  /** “Today” column uses the view timezone; refreshes with nowTick so midnight rollover is picked up. */
  const todayIsoInViewTz = useMemo(
    () => DateTime.now().setZone(calendarTz).toISODate(),
    [calendarTz, nowTick]
  );

  const profileFilterOptions = useMemo(() => buildProfileFilterOptions(rows), [rows]);

  useEffect(() => {
    setProfileVisibility((prev) => {
      const next = { ...prev };
      for (const opt of profileFilterOptions) {
        if (next[opt.key] === undefined) next[opt.key] = true;
      }
      return next;
    });
  }, [profileFilterOptions]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_VISIBILITY_STORAGE_KEY, JSON.stringify(profileVisibility));
    } catch {
      /* ignore */
    }
  }, [profileVisibility]);

  const filteredRows = useMemo(() => {
    return rows.filter((ev) => profileVisibility[profileVisibilityKey(ev)] !== false);
  }, [rows, profileVisibility]);

  const userColorPalette = useMemo(() => buildUserColorPalette(rows), [rows]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const d of visibleDays) {
      const key = d.toISODate();
      map.set(key, []);
    }
    for (const ev of filteredRows) {
      for (const d of visibleDays) {
        const dayStart = d;
        if (eventOverlapsDay(ev, dayStart, calendarTz)) {
          map.get(dayStart.toISODate()).push(ev);
        }
      }
    }
    return map;
  }, [filteredRows, visibleDays, calendarTz]);

  /**
   * Per calendar column: ids that overlap someone else **on that same day** (same rules as clusters).
   * A week-wide Set would mark multi-day rows with the badge on every column where they appear
   * if they overlapped anyone on any other day — while clustering stays per-day, so layout and badge diverged.
   */
  const overlapIdsByDay = useMemo(() => {
    const map = new Map();
    for (const d of visibleDays) {
      const key = d.toISODate();
      const ids = new Set();
      const list = byDay.get(key) || [];
      for (let i = 0; i < list.length; i++) {
        const iv1 = clipIntervalWallMs(d, list[i], calendarTz);
        if (!iv1) continue;
        for (let j = i + 1; j < list.length; j++) {
          const iv2 = clipIntervalWallMs(d, list[j], calendarTz);
          if (!iv2) continue;
          if (intervalsOverlapMs(iv1, iv2) || rangesOverlap(list[i], list[j])) {
            ids.add(stableInterviewId(list[i]));
            ids.add(stableInterviewId(list[j]));
          }
        }
      }
      map.set(key, ids);
    }
    return map;
  }, [byDay, visibleDays, calendarTz]);

  /** Per ISO date: array of overlap clusters (each cluster is 2+ interviews that overlap transitively). */
  const overlapClustersByDay = useMemo(() => {
    const map = new Map();
    for (const d of visibleDays) {
      const key = d.toISODate();
      const list = byDay.get(key) || [];
      map.set(
        key,
        buildOverlapClustersForDay(list, d, calendarTz).map((idxs) => idxs.map((i) => list[i]))
      );
    }
    return map;
  }, [byDay, visibleDays, calendarTz]);

  /** ISO date → ordered list of { single interview } or { overlap cluster with wrapper metrics }. */
  const dayRenderPlanByKey = useMemo(() => {
    const out = new Map();
    for (const d of visibleDays) {
      const key = d.toISODate();
      const list = byDay.get(key) || [];
      out.set(key, buildDayRenderPlan(list, d, calendarTz));
    }
    return out;
  }, [byDay, visibleDays, calendarTz]);

  const goPrevRange = () => {
    setViewDateIso((prev) => {
      const d = DateTime.fromISO(`${prev}T00:00:00`, { zone: calendarTz });
      if (viewMode === "day") return d.minus({ days: 1 }).toISODate();
      if (viewMode === "week") {
        const mon = startOfWeekMondayInZone(d.toJSDate(), calendarTz);
        return mon.minus({ weeks: 1 }).toISODate();
      }
      return d.minus({ months: 1 }).startOf("month").toISODate();
    });
  };

  const goNextRange = () => {
    setViewDateIso((prev) => {
      const d = DateTime.fromISO(`${prev}T00:00:00`, { zone: calendarTz });
      if (viewMode === "day") return d.plus({ days: 1 }).toISODate();
      if (viewMode === "week") {
        const mon = startOfWeekMondayInZone(d.toJSDate(), calendarTz);
        return mon.plus({ weeks: 1 }).toISODate();
      }
      return d.plus({ months: 1 }).startOf("month").toISODate();
    });
  };

  const goToday = () => {
    setViewDateIso(DateTime.now().setZone(calendarTz).toISODate());
  };

  const slotLines = useMemo(() => Array.from({ length: SLOTS_PER_DAY }, (_, i) => i), []);

  const refDayForLabels = visibleDays[0] || anchorDt;

  const openDetails = (ev, e) => {
    e.stopPropagation();
    setSelectedEv(ev);
  };

  const closeDetails = () => setSelectedEv(null);

  const goToEdit = (id) => {
    navigate(`/interviews?edit=${encodeURIComponent(String(id))}`);
    closeDetails();
  };

  const handleGridPointerDown = useCallback(
    (e, dayIso) => {
      if (e.button !== 0) return;
      if (e.target.closest(".interview-cal-block")) return;
      e.preventDefault();
      const grid = e.currentTarget;
      const startSlot = yToSlot(e.clientY, grid);
      dragStartRef.current = { dayIso, startSlot };
      setDragDraft({ dayIso, startSlot, endSlot: startSlot });
      try {
        grid.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const finish = (ev, cancelled) => {
        try {
          grid.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        grid.removeEventListener("pointermove", onMove);
        grid.removeEventListener("pointerup", onUp);
        grid.removeEventListener("pointercancel", onUp);
        const d = dragStartRef.current;
        dragStartRef.current = null;
        setDragDraft(null);
        if (cancelled || !d || d.dayIso !== dayIso) return;
        const endSlot = yToSlot(ev.clientY, grid);
        const lo = Math.min(d.startSlot, endSlot);
        const hi = Math.max(d.startSlot, endSlot);
        const startM = lo * SLOT_MINUTES;
        const endM = (hi + 1) * SLOT_MINUTES;
        const dayStart = DateTime.fromISO(`${dayIso}T00:00:00`, { zone: calendarTz });
        if (!dayStart.isValid) return;
        const startDt = dayStart.plus({ minutes: startM });
        const endDt = dayStart.plus({ minutes: endM });
        navigate(
          `/interviews?start=${encodeURIComponent(startDt.toUTC().toISO())}&end=${encodeURIComponent(
            endDt.toUTC().toISO()
          )}&tz=${encodeURIComponent(calendarTz)}`
        );
      };

      const onMove = (ev) => {
        const endSlot = yToSlot(ev.clientY, grid);
        setDragDraft((prev) =>
          prev && prev.dayIso === dayIso ? { ...prev, endSlot } : prev
        );
      };

      const onUp = (ev) => {
        finish(ev, ev.type === "pointercancel");
      };

      grid.addEventListener("pointermove", onMove);
      grid.addEventListener("pointerup", onUp);
      grid.addEventListener("pointercancel", onUp);
    },
    [calendarTz, navigate]
  );

  useEffect(() => {
    if (!selectedEv) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeDetails();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEv]);

  const modalOwnerColor = selectedEv
    ? eventCalendarStyle(selectedEv, userColorPalette)
    : null;

  const setAllProfileVisibility = (value) => {
    setProfileVisibility((prev) => {
      const next = { ...prev };
      for (const opt of profileFilterOptions) {
        next[opt.key] = value;
      }
      return next;
    });
  };

  return (
    <main className="container container-dashboard interview-calendar-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Interview calendar</h1>
          <p>
            Day, week, and month views (Google Calendar–style). Timezone below. In day/week, drag empty space to pick a
            time range; click any block for details. Manage rows on <Link to="/interviews">Interviews</Link>.
          </p>
        </div>
        <div className="page-header-actions interview-cal-nav">
          <label className="interview-cal-tz-label">
            <span className="muted-text">View as (search country, capital, EST, UTC+4…)</span>
            <TimeZoneCombobox
              value={calendarTz || CALENDAR_DEFAULT_TZ}
              onChange={setCalendarTz}
              options={timeZoneComboboxOptions}
              ariaLabel="Calendar timezone"
            />
          </label>
        </div>
      </header>

      {error && <div className="card error">{error}</div>}
      {loading && <div className="card">Loading calendar…</div>}

      {!loading && !error && (
        <div className="card interview-cal-gcal-card">
          <div className="interview-cal-toolbar">
            <div className="interview-cal-toolbar-left">
              <div className="interview-cal-view-tabs" role="tablist" aria-label="Calendar view">
                {(
                  [
                    { id: "day", label: "Day" },
                    { id: "week", label: "Week" },
                    { id: "month", label: "Month" }
                  ]
                ).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={viewMode === id}
                    className={`interview-cal-view-tab${viewMode === id ? " interview-cal-view-tab--active" : ""}`}
                    onClick={() => setViewMode(/** @type {CalViewMode} */ (id))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="interview-cal-range-title">{rangeTitle}</span>
            </div>
            <div className="interview-cal-toolbar-nav">
              <button type="button" className="small muted" onClick={goPrevRange}>
                {viewMode === "day" ? "← Prev day" : viewMode === "week" ? "← Prev week" : "← Prev month"}
              </button>
              <button type="button" className="small muted" onClick={goToday}>
                Today
              </button>
              <button type="button" className="small muted" onClick={goNextRange}>
                {viewMode === "day" ? "Next day →" : viewMode === "week" ? "Next week →" : "Next month →"}
              </button>
            </div>
          </div>

          {profileFilterOptions.length > 0 && (
            <div className="interview-cal-profile-filters" aria-label="Show or hide interviews by job profile">
              <div className="interview-cal-profile-filters-head">
                <span className="interview-cal-profile-filters-title">Visible profiles</span>
                <span className="interview-cal-profile-filters-hint muted-text">
                  Uncheck to hide a profile (yours or teammates’). Slot colors are fixed per person.
                </span>
                <div className="interview-cal-profile-filters-bulk">
                  <button type="button" className="small muted" onClick={() => setAllProfileVisibility(true)}>
                    Show all
                  </button>
                  <button type="button" className="small muted" onClick={() => setAllProfileVisibility(false)}>
                    Hide all
                  </button>
                </div>
              </div>
              <ul className="interview-cal-profile-filters-list">
                {profileFilterOptions.map((opt) => (
                  <li key={opt.key}>
                    <label className="interview-cal-profile-filter-label">
                      <input
                        type="checkbox"
                        checked={profileVisibility[opt.key] !== false}
                        onChange={(e) =>
                          setProfileVisibility((p) => ({ ...p, [opt.key]: e.target.checked }))
                        }
                      />
                      <span
                        className="interview-cal-profile-filter-swatch"
                        style={{ background: opt.swatchHex }}
                        aria-hidden
                      />
                      <span className="interview-cal-profile-filter-text">{opt.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {viewMode === "month" ? (
            <div className="interview-cal-month-wrap">
              <div className="interview-cal-month-weekdays" aria-hidden>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
                  <div key={w} className="interview-cal-month-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="interview-cal-month-grid">
                {visibleDays.map((cell) => {
                  const iso = cell.toISODate();
                  const vm = anchorDt.startOf("month");
                  const isOtherMonth = cell.month !== vm.month || cell.year !== vm.year;
                  const isTodayCell = iso === todayIsoInViewTz;
                  const list = (byDay.get(iso) || []).slice().sort((a, b) => {
                    const ta = new Date(a.scheduledAt).getTime();
                    const tb = new Date(b.scheduledAt).getTime();
                    return ta - tb;
                  });
                  const maxShow = 3;
                  const shown = list.slice(0, maxShow);
                  const more = list.length - shown.length;
                  return (
                    <div
                      key={iso}
                      className={`interview-cal-month-cell${isOtherMonth ? " interview-cal-month-cell--other-month" : ""}${isTodayCell ? " interview-cal-month-cell--today" : ""}`}
                    >
                      <button
                        type="button"
                        className="interview-cal-month-daynum"
                        onClick={() => {
                          setViewDateIso(iso);
                          setViewMode("day");
                        }}
                      >
                        {cell.day}
                      </button>
                      <div className="interview-cal-month-events">
                        {shown.map((ev) => {
                          const col = eventCalendarStyle(ev, userColorPalette);
                          const oid = stableInterviewId(ev);
                          return (
                            <button
                              key={oid}
                              type="button"
                              className="interview-cal-month-event"
                              style={{ borderLeftColor: col.border, background: col.bg1 }}
                              title={`${ev.subjectName} — ${ev.company}`}
                              onClick={(e) => openDetails(ev, e)}
                            >
                              <span className="interview-cal-month-event-time">
                                {DateTime.fromJSDate(new Date(ev.scheduledAt), { zone: "utc" })
                                  .setZone(calendarTz)
                                  .toFormat("h:mm a")}
                              </span>
                              <span className="interview-cal-month-event-title">{ev.subjectName}</span>
                            </button>
                          );
                        })}
                        {more > 0 ? (
                          <span className="interview-cal-month-more muted-text">+{more} more</span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="interview-cal-gcal-scroll">
              <div className="interview-cal-gcal">
              <div className="interview-cal-gcal-header">
                <div className="interview-cal-gcal-timezone-heads">
                  <div
                    className="interview-cal-gcal-tz-head interview-cal-gcal-tz-head--reference"
                    title={`${CALENDAR_REFERENCE_TZ_LABEL} now (${CALENDAR_REFERENCE_TZ})`}
                  >
                    <span className="interview-cal-gcal-tz-head-abbr">{CALENDAR_REFERENCE_TZ_LABEL}</span>
                    <span className="interview-cal-gcal-tz-head-now">{referenceTzNowLabel}</span>
                  </div>
                  <div
                    className="interview-cal-gcal-tz-head interview-cal-gcal-tz-head--view"
                    title={`Grid times (${calendarTz})`}
                  >
                    <span className="interview-cal-gcal-tz-head-abbr">{viewTzHeadAbbr}</span>
                  </div>
                </div>
                {visibleDays.map((d) => {
                  const dayIso = d.toISODate();
                  const isTodayCol = dayIso === todayIsoInViewTz;
                  return (
                    <div
                      key={dayIso}
                      className={`interview-cal-gcal-head-cell${isTodayCol ? " interview-cal-gcal-head-cell--today" : ""}`}
                    >
                      <span className="interview-cal-gcal-dow">{d.toFormat("ccc")}</span>
                      <span className="interview-cal-gcal-dom">{d.day}</span>
                    </div>
                  );
                })}
              </div>

              <div className="interview-cal-gcal-body">
                <div
                  className="interview-cal-time-gutter interview-cal-time-gutter--reference"
                  style={{ height: GRID_HEIGHT }}
                  aria-label={`${CALENDAR_REFERENCE_TZ_LABEL} clock for each row (${CALENDAR_REFERENCE_TZ})`}
                >
                  {slotLines.map((slotIdx) => {
                    const totalMin = slotIdx * SLOT_MINUTES;
                    const showLabel = slotIdx % 2 === 0;
                    const label = showLabel
                      ? refDayForLabels
                          .plus({ minutes: totalMin })
                          .setZone(CALENDAR_REFERENCE_TZ)
                          .toFormat("h:mm a")
                      : "";
                    return (
                      <div
                        key={slotIdx}
                        className={`interview-cal-time-row${showLabel ? " interview-cal-time-row--hour" : ""}`}
                        style={{ height: PX_PER_SLOT }}
                      >
                        {showLabel && (
                          <span className="interview-cal-time-label interview-cal-time-label--compact">{label}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div
                  className="interview-cal-time-gutter interview-cal-time-gutter--view"
                  style={{ height: GRID_HEIGHT }}
                  aria-label={`Grid timezone (${calendarTz})`}
                >
                  {slotLines.map((slotIdx) => {
                    const totalMin = slotIdx * SLOT_MINUTES;
                    const showLabel = slotIdx % 2 === 0;
                    const label = showLabel
                      ? refDayForLabels.plus({ minutes: totalMin }).toFormat("h:mm a")
                      : "";
                    return (
                      <div
                        key={slotIdx}
                        className={`interview-cal-time-row${showLabel ? " interview-cal-time-row--hour" : ""}`}
                        style={{ height: PX_PER_SLOT }}
                      >
                        {showLabel && <span className="interview-cal-time-label">{label}</span>}
                      </div>
                    );
                  })}
                </div>

                {visibleDays.map((d) => {
                  const key = d.toISODate();
                  const dayStart = d;
                  const list = byDay.get(key) || [];
                  const draftForDay =
                    dragDraft && dragDraft.dayIso === key
                      ? (() => {
                          const lo = Math.min(dragDraft.startSlot, dragDraft.endSlot);
                          const hi = Math.max(dragDraft.startSlot, dragDraft.endSlot);
                          const startM = lo * SLOT_MINUTES;
                          const endM = (hi + 1) * SLOT_MINUTES;
                          return eventBlockStyle({ startM, endM });
                        })()
                      : null;

                  const isTodayCol = key === todayIsoInViewTz;
                  return (
                    <div
                      key={key}
                      className={`interview-cal-day-column${isTodayCol ? " interview-cal-day-column--today" : ""}`}
                      aria-current={isTodayCol ? "date" : undefined}
                    >
                      <div
                        className="interview-cal-day-grid"
                        style={{ height: GRID_HEIGHT }}
                        onPointerDown={(e) => handleGridPointerDown(e, key)}
                        role="group"
                        aria-label={`${key}: drag on empty cells to choose a time range`}
                      >
                        {slotLines.map((slotIdx) => (
                          <div
                            key={slotIdx}
                            className={`interview-cal-slot-line${slotIdx % 2 === 0 ? " interview-cal-slot-line--major" : ""}`}
                            style={{ height: PX_PER_SLOT }}
                          />
                        ))}
                        {draftForDay && (
                          <div
                            className="interview-cal-select-preview"
                            style={{ top: draftForDay.top, height: draftForDay.height }}
                            aria-hidden
                          />
                        )}
                        <div className="interview-cal-events-layer">
                          {(dayRenderPlanByKey.get(key) || []).map((item) => {
                            if (item.kind === "single") {
                              const ev = item.ev;
                              const clip = clipEventToDay(dayStart, ev, calendarTz);
                              if (!clip) return null;
                              const st = eventBlockStyle(clip);
                              const oid = stableInterviewId(ev);
                              const bad = overlapIdsByDay.get(key)?.has(oid) ?? false;
                              const col = eventCalendarStyle(ev, userColorPalette);
                              const hasStage = Boolean(getInterviewStageBadge(ev.interviewType));
                              return (
                                <div
                                  key={`${key}-${item.key}`}
                                  role="button"
                                  tabIndex={0}
                                  className={`interview-cal-block${bad ? " interview-cal-block--overlap" : ""}${hasStage ? " interview-cal-block--has-stage" : ""}`}
                                  style={{
                                    position: "absolute",
                                    top: st.top,
                                    height: st.height,
                                    left: 4,
                                    right: 4,
                                    width: "auto",
                                    zIndex: 1,
                                    borderColor: col.border,
                                    background: `linear-gradient(135deg, ${col.bg1} 0%, ${col.bg2} 100%)`
                                  }}
                                  title={`${ev.subjectName} — ${ev.company}`}
                                  onClick={(e) => openDetails(ev, e)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      openDetails(ev, e);
                                    }
                                  }}
                                >
                                  <InterviewCalStageBadge interviewType={ev.interviewType} />
                                  <span className="interview-cal-block-title" style={{ color: col.title }}>
                                    {ev.subjectName}
                                  </span>
                                  <span className="interview-cal-block-sub">{ev.company}</span>
                                  <span className="interview-cal-block-by">{loggedByLabel(ev)}</span>
                                  {bad && <span className="interview-cal-block-warn">Overlap</span>}
                                </div>
                              );
                            }
                            return (
                              <div
                                key={`${key}-cluster-${item.key}`}
                                className="interview-cal-overlap-group"
                                data-overlap-group="true"
                                role="group"
                                style={{
                                  position: "absolute",
                                  left: 4,
                                  right: 4,
                                  top: item.wrapperTop,
                                  height: item.wrapperHeight,
                                  display: "flex",
                                  flexDirection: "row",
                                  gap: 2,
                                  zIndex: 6,
                                  pointerEvents: "none",
                                  boxSizing: "border-box"
                                }}
                                aria-label={`Overlapping interviews (${item.cluster.length})`}
                              >
                                {item.cluster.map((ev, laneIdx) => {
                                  const clip = clipEventToDay(dayStart, ev, calendarTz);
                                  if (!clip) return null;
                                  const st = eventBlockStyle(clip);
                                  const oid = stableInterviewId(ev);
                                  const col = eventCalendarStyle(ev, userColorPalette);
                                  const offsetTop = st.top - item.wrapperTop;
                                  const hasStage = Boolean(getInterviewStageBadge(ev.interviewType));
                                  return (
                                    <div
                                      key={`${oid}-lane${laneIdx}`}
                                      className="interview-cal-overlap-group-lane"
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        position: "relative",
                                        height: item.wrapperHeight,
                                        pointerEvents: "none"
                                      }}
                                    >
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        className={`interview-cal-block interview-cal-block--overlap interview-cal-block--in-overlap-group${hasStage ? " interview-cal-block--has-stage" : ""}`}
                                        data-sub-slot={laneIdx % 2}
                                        style={{
                                          position: "absolute",
                                          left: 0,
                                          right: 0,
                                          top: offsetTop,
                                          height: st.height,
                                          zIndex: 5 + (laneIdx % 2),
                                          borderColor: col.border,
                                          background: `linear-gradient(135deg, ${col.bg1} 0%, ${col.bg2} 100%)`,
                                          pointerEvents: "auto",
                                          boxSizing: "border-box"
                                        }}
                                        title={`${ev.subjectName} — ${ev.company}`}
                                        onClick={(e) => openDetails(ev, e)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            openDetails(ev, e);
                                          }
                                        }}
                                      >
                                        <InterviewCalStageBadge interviewType={ev.interviewType} />
                                        <span className="interview-cal-block-title" style={{ color: col.title }}>
                                          {ev.subjectName}
                                        </span>
                                        <span className="interview-cal-block-sub">{ev.company}</span>
                                        <span className="interview-cal-block-by">{loggedByLabel(ev)}</span>
                                        <span className="interview-cal-block-warn">Overlap</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {nowLine && (
                  <div
                    className="interview-cal-now-line"
                    style={{ top: nowLine.top }}
                    aria-hidden="true"
                    title={`Current time (${calendarTz}): ${nowLine.label}`}
                  />
                )}
              </div>
            </div>
          </div>
          )}
          <p className="interview-cal-legend muted-text">
            <strong>Day/week:</strong> the left time column is <strong>{CALENDAR_REFERENCE_TZ_LABEL}</strong> (
            {CALENDAR_REFERENCE_TZ}); next matches <strong>{calendarTz}</strong>. Each row is 30 minutes; drag empty space
            to schedule. The <strong className="interview-cal-now-legend">red line</strong> is current time when today is
            visible. <strong>Month:</strong> click a day number to open the day view; click an event for details.{" "}
            <strong>Slot colors</strong> are fixed per teammate (interview subject). Use <strong>Visible profiles</strong>{" "}
            above to show or hide rows by job profile. A <strong>corner badge</strong> shows the interview type when it
            matches Phone, Intro, Tech, Final, round numbers, etc.
          </p>
          {viewMode !== "month" &&
            visibleDays.some((d) => (overlapClustersByDay.get(d.toISODate()) || []).length > 0) && (
            <details className="interview-cal-overlap-debug card">
              <summary className="interview-cal-overlap-debug-summary">
                Overlapping schedule groups (current range) — same logic as the time grid
              </summary>
              <div className="interview-cal-overlap-debug-body muted-text">
                <p className="interview-cal-overlap-debug-intro">
                  Each <strong>group</strong> is a set of interviews on the same calendar day whose time ranges overlap
                  when clipped to that day in <strong>{calendarTz}</strong> (transitive: if A overlaps B and B overlaps C,
                  all three are one group).
                </p>
                <ul className="interview-cal-overlap-debug-days">
                  {visibleDays.map((d) => {
                    const key = d.toISODate();
                    const clusters = overlapClustersByDay.get(key) || [];
                    if (clusters.length === 0) return null;
                    return (
                      <li key={key}>
                        <strong>{d.toFormat("ccc, MMM d")}</strong> ({key})
                        <ol className="interview-cal-overlap-debug-groups">
                          {clusters.map((group, gi) => (
                            <li key={gi}>
                              Group {gi + 1} ({group.length} interviews)
                              <ul>
                                {group.map((ev) => (
                                  <li key={stableInterviewId(ev)}>
                                    <span className="interview-cal-overlap-debug-title">{ev.subjectName}</span>
                                    <span className="interview-cal-overlap-debug-meta">
                                      {" "}
                                      — {formatRangeInZone(ev, calendarTz)} —{" "}
                                      <code className="interview-cal-overlap-debug-id">{stableInterviewId(ev)}</code>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ol>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </details>
          )}
        </div>
      )}

      {selectedEv && (
        <div
          className="interview-cal-modal-backdrop"
          role="presentation"
          onClick={closeDetails}
        >
          <div
            className="interview-cal-modal-card card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="interview-cal-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="interview-cal-modal-title" className="interview-cal-modal-title">
              {modalOwnerColor && (
                <span
                  className="interview-cal-modal-title-swatch"
                  style={{ background: modalOwnerColor.bg2, borderColor: modalOwnerColor.border }}
                  aria-hidden
                />
              )}
              {selectedEv.subjectName}
            </h2>
            <p className="interview-cal-modal-company">{selectedEv.company}</p>
            <dl className="interview-cal-modal-dl">
              <div>
                <dt>Role</dt>
                <dd>{selectedEv.roleTitle || "—"}</dd>
              </div>
              <div>
                <dt>When ({calendarTz})</dt>
                <dd>{formatRangeInZone(selectedEv, calendarTz)}</dd>
              </div>
              {selectedEv.timezone ? (
                <div>
                  <dt>Logged timezone</dt>
                  <dd>{selectedEv.timezone}</dd>
                </div>
              ) : null}
              <div>
                <dt>Type</dt>
                <dd>{selectedEv.interviewType || "—"}</dd>
              </div>
              <div>
                <dt>Result</dt>
                <dd>{selectedEv.resultStatus || "—"}</dd>
              </div>
              <div>
                <dt>Interviewer</dt>
                <dd>{selectedEv.interviewerName || "—"}</dd>
              </div>
              <div>
                <dt>Logged by</dt>
                <dd>{loggedByLabel(selectedEv)}</dd>
              </div>
              {selectedEv.notes ? (
                <div className="interview-cal-modal-notes">
                  <dt>Notes</dt>
                  <dd>{selectedEv.notes}</dd>
                </div>
              ) : null}
              {selectedEv.jobLinkUrl ? (
                <div>
                  <dt>Job link</dt>
                  <dd>
                    <a href={selectedEv.jobLinkUrl} target="_blank" rel="noreferrer">
                      Open link
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="interview-cal-modal-actions">
              <button type="button" className="primary" onClick={() => goToEdit(selectedEv._id)}>
                Edit on Interviews page
              </button>
              <button type="button" className="muted" onClick={closeDetails}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
