import { DateTime } from "luxon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchInterviewCalendar } from "../api";
import { effectiveEndMs, rangesOverlap } from "../utils/interviewTime";
import { buildOwnerPaletteMaps, DEFAULT_OWNER_COLOR, ownerKey } from "../utils/interviewOwnerColors";
import {
  CALENDAR_DEFAULT_TZ,
  formatTimeZoneOptionLabel,
  getSortedTimeZones,
  startOfWeekMondayInZone
} from "../utils/interviewZonedTime";

/** 24h × 30min = 48 rows (Google Calendar–style day grid). */
const SLOTS_PER_DAY = 48;
const SLOT_MINUTES = 30;
const PX_PER_SLOT = 32;
const GRID_HEIGHT = SLOTS_PER_DAY * PX_PER_SLOT;

function loggedByLabel(row) {
  const c = row.createdBy;
  if (c && typeof c === "object") return c.name || c.email || "—";
  return "—";
}

/** Clip event to a calendar day in `zone`; minutes from local midnight [0, 1440+]. */
function clipEventToDay(dayStart, ev, zone) {
  const dayEnd = dayStart.plus({ days: 1 });
  const evS = DateTime.fromJSDate(new Date(ev.scheduledAt), { zone: "utc" }).setZone(zone);
  const evE = DateTime.fromJSDate(new Date(effectiveEndMs(ev)), { zone: "utc" }).setZone(zone);
  const clipStart = evS > dayStart ? evS : dayStart;
  const clipEnd = evE < dayEnd ? evE : dayEnd;
  if (clipEnd <= clipStart) return null;
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

/** Pixel Y within grid → slot index [0, SLOTS_PER_DAY - 1]. */
function yToSlot(clientY, gridEl) {
  const rect = gridEl.getBoundingClientRect();
  const y = clientY - rect.top;
  const raw = Math.floor(y / PX_PER_SLOT);
  return Math.max(0, Math.min(SLOTS_PER_DAY - 1, raw));
}

function eventOverlapsDay(ev, dayStart) {
  const ds = dayStart.toUTC().toMillis();
  const de = dayStart.plus({ days: 1 }).toUTC().toMillis();
  const s = new Date(ev.scheduledAt).getTime();
  const e = effectiveEndMs(ev);
  return s < de && e > ds;
}

function formatRangeInZone(ev, zone) {
  const z = zone || CALENDAR_DEFAULT_TZ;
  const s = DateTime.fromJSDate(new Date(ev.scheduledAt), { zone: "utc" }).setZone(z);
  const e = DateTime.fromJSDate(new Date(effectiveEndMs(ev)), { zone: "utc" }).setZone(z);
  if (!s.isValid || !e.isValid) return "—";
  return `${s.toFormat("EEE, MMM d · h:mm a")} – ${e.toFormat("h:mm a")}`;
}

export default function InterviewCalendarPage() {
  const navigate = useNavigate();
  const [calendarTz, setCalendarTz] = useState(CALENDAR_DEFAULT_TZ);
  const [weekMondayIso, setWeekMondayIso] = useState(() =>
    startOfWeekMondayInZone(new Date(), CALENDAR_DEFAULT_TZ).toISODate()
  );
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedEv, setSelectedEv] = useState(null);
  /** Drag-select preview: same column, min/max slot while pointer down. */
  const [dragDraft, setDragDraft] = useState(null);
  const dragStartRef = useRef(null);
  /** Recomputed on interval so the “now” line moves. */
  const [nowTick, setNowTick] = useState(0);

  const timeZoneIds = useMemo(() => getSortedTimeZones(), []);
  const timeZoneSelectOptions = useMemo(
    () => timeZoneIds.map((iana) => ({ value: iana, label: formatTimeZoneOptionLabel(iana) })),
    [timeZoneIds]
  );

  const weekMondayDt = useMemo(() => {
    const base = DateTime.fromISO(`${weekMondayIso}T00:00:00`, { zone: calendarTz });
    return base.isValid ? base : startOfWeekMondayInZone(new Date(), calendarTz);
  }, [weekMondayIso, calendarTz]);

  const weekDays = useMemo(() => {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(weekMondayDt.plus({ days: i }));
    return out;
  }, [weekMondayDt]);

  const fromIso = useMemo(() => weekMondayDt.toUTC().toISO(), [weekMondayDt]);
  const toIso = useMemo(() => weekMondayDt.plus({ days: 7 }).toUTC().toISO(), [weekMondayDt]);

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

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const nowLine = useMemo(() => {
    const now = DateTime.now().setZone(calendarTz);
    const todayIso = now.toISODate();
    const inWeek = weekDays.some((d) => d.toISODate() === todayIso);
    if (!inWeek) return null;
    const dayStart = DateTime.fromISO(`${todayIso}T00:00:00`, { zone: calendarTz });
    const minutesFromMidnight = now.diff(dayStart, "minutes").minutes;
    const top = (minutesFromMidnight / SLOT_MINUTES) * PX_PER_SLOT;
    const clamped = Math.max(0, Math.min(top, GRID_HEIGHT - 2));
    return { top: clamped, label: now.toFormat("h:mm a") };
  }, [calendarTz, weekDays, nowTick]);

  const ownerPalette = useMemo(() => buildOwnerPaletteMaps(rows), [rows]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const d of weekDays) {
      const key = d.toISODate();
      map.set(key, []);
    }
    for (const ev of rows) {
      for (const d of weekDays) {
        const dayStart = d;
        if (eventOverlapsDay(ev, dayStart)) {
          map.get(dayStart.toISODate()).push(ev);
        }
      }
    }
    return map;
  }, [rows, weekDays]);

  const overlapIds = useMemo(() => {
    const ids = new Set();
    for (const d of weekDays) {
      const list = byDay.get(d.toISODate()) || [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (rangesOverlap(list[i], list[j])) {
            ids.add(String(list[i]._id));
            ids.add(String(list[j]._id));
          }
        }
      }
    }
    return ids;
  }, [byDay, weekDays]);

  const prevWeek = () => {
    setWeekMondayIso((prev) => {
      const mon = DateTime.fromISO(`${prev}T00:00:00`, { zone: calendarTz });
      return mon.minus({ weeks: 1 }).toISODate();
    });
  };

  const nextWeek = () => {
    setWeekMondayIso((prev) => {
      const mon = DateTime.fromISO(`${prev}T00:00:00`, { zone: calendarTz });
      return mon.plus({ weeks: 1 }).toISODate();
    });
  };

  const thisWeek = () => {
    setWeekMondayIso(startOfWeekMondayInZone(new Date(), calendarTz).toISODate());
  };

  const slotLines = useMemo(() => Array.from({ length: SLOTS_PER_DAY }, (_, i) => i), []);

  const refDayForLabels = weekDays[0] || weekMondayDt;

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
    ? ownerPalette.colorByKey.get(ownerKey(selectedEv)) || DEFAULT_OWNER_COLOR
    : null;

  return (
    <main className="container container-dashboard interview-calendar-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Interview calendar</h1>
          <p>
            Week grid uses the timezone below (default Pacific). Drag on an empty area to pick a time range (like Google
            Calendar), then add interview details on the Interviews page. Click a block for details. Manage rows on{" "}
            <Link to="/interviews">Interviews</Link>.
          </p>
        </div>
        <div className="page-header-actions interview-cal-nav">
          <label className="interview-cal-tz-label">
            <span className="muted-text">View as</span>
            <select
              className="interview-cal-tz-select"
              value={
                calendarTz && !timeZoneIds.includes(calendarTz)
                  ? calendarTz
                  : calendarTz || CALENDAR_DEFAULT_TZ
              }
              onChange={(e) => setCalendarTz(e.target.value)}
              aria-label="Calendar timezone"
            >
              {calendarTz && !timeZoneIds.includes(calendarTz) ? (
                <option value={calendarTz}>{formatTimeZoneOptionLabel(calendarTz) || calendarTz}</option>
              ) : null}
              {timeZoneSelectOptions.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="small muted" onClick={prevWeek}>
            ← Prev week
          </button>
          <button type="button" className="small muted" onClick={thisWeek}>
            This week
          </button>
          <button type="button" className="small muted" onClick={nextWeek}>
            Next week →
          </button>
        </div>
      </header>

      {error && <div className="card error">{error}</div>}
      {loading && <div className="card">Loading calendar…</div>}

      {!loading && !error && (
        <div className="card interview-cal-gcal-card">
          <div className="interview-cal-gcal-scroll">
            <div className="interview-cal-gcal">
              <div className="interview-cal-gcal-header">
                <div className="interview-cal-gcal-corner" aria-hidden />
                {weekDays.map((d) => (
                  <div key={d.toISODate()} className="interview-cal-gcal-head-cell">
                    <span className="interview-cal-gcal-dow">{d.toFormat("ccc")}</span>
                    <span className="interview-cal-gcal-dom">{d.day}</span>
                  </div>
                ))}
              </div>

              <div className="interview-cal-gcal-body">
                <div className="interview-cal-time-gutter" style={{ height: GRID_HEIGHT }}>
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

                {weekDays.map((d) => {
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

                  return (
                    <div key={key} className="interview-cal-day-column">
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
                          {list.map((ev) => {
                            const clip = clipEventToDay(dayStart, ev, calendarTz);
                            if (!clip) return null;
                            const st = eventBlockStyle(clip);
                            const oid = String(ev._id);
                            const bad = overlapIds.has(oid);
                            const col = ownerPalette.colorByKey.get(ownerKey(ev)) || DEFAULT_OWNER_COLOR;
                            return (
                              <div
                                key={`${oid}-${key}`}
                                role="button"
                                tabIndex={0}
                                className={`interview-cal-block${bad ? " interview-cal-block--overlap" : ""}`}
                                style={{
                                  top: st.top,
                                  height: st.height,
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
                                <span className="interview-cal-block-title" style={{ color: col.title }}>
                                  {ev.subjectName}
                                </span>
                                <span className="interview-cal-block-sub">{ev.company}</span>
                                <span className="interview-cal-block-by">{loggedByLabel(ev)}</span>
                                {bad && <span className="interview-cal-block-warn">Overlap</span>}
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
          <p className="interview-cal-legend muted-text">
            Times and day columns follow <strong>{calendarTz}</strong> (Pacific by default). Each horizontal line is 30
            minutes. Drag on empty space to schedule; each row is snapped to 30 minutes. The{" "}
            <strong className="interview-cal-now-legend">red line</strong> is the current time (when today falls in this
            week); it updates every 30 seconds. Slot colors match the <strong>interview subject</strong> (teammate);
            linked users share one color.
          </p>
          {ownerPalette.orderedKeys.length > 0 && (
            <div className="interview-cal-owner-legend" aria-label="Subject colors for this week">
              <span className="interview-cal-owner-legend-heading muted-text">Subject colors</span>
              <ul className="interview-cal-owner-legend-list">
                {ownerPalette.orderedKeys.map((k) => {
                  const col = ownerPalette.colorByKey.get(k);
                  const label = ownerPalette.labelByKey.get(k);
                  if (!col) return null;
                  return (
                    <li key={k}>
                      <span
                        className="interview-cal-owner-swatch"
                        style={{ background: col.bg2, borderColor: col.border }}
                        aria-hidden
                      />
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
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
