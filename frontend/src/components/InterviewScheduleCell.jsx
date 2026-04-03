import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { fetchInterviewRecords } from "../api";

function formatChipTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toDatetimeLocalValue(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function linkedRecordIdFromInterview(inv) {
  const x = inv.linkedInterviewRecordId;
  if (!x) return null;
  if (typeof x === "object" && x._id) return String(x._id);
  return String(x);
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export default function InterviewScheduleCell({ item, canEdit, onAddInterview, onRemoveInterview }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState("");
  const [linkedRecordId, setLinkedRecordId] = useState("");
  const [calendarRecords, setCalendarRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const interviews = [...(item.interviews || [])].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
  );

  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    setRecordsLoading(true);
    fetchInterviewRecords()
      .then((rows) => {
        if (!cancelled) setCalendarRecords(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setCalendarRecords([]);
      })
      .finally(() => {
        if (!cancelled) setRecordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const closeModal = () => {
    setModalOpen(false);
    setLabel("");
    setWhen("");
    setLinkedRecordId("");
    setSaving(false);
  };

  const sortedCalendarOptions = [...calendarRecords].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
  );

  const handlePickCalendarRow = (e) => {
    const id = e.target.value;
    setLinkedRecordId(id);
    if (!id) return;
    const rec = calendarRecords.find((r) => String(r._id) === id);
    if (rec) {
      setWhen(toDatetimeLocalValue(rec.scheduledAt));
      setLabel((prev) => (prev.trim() ? prev : rec.roleTitle || rec.title || ""));
    }
  };

  const handleModalAdd = async () => {
    if (!when || saving) return;
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) return;
    setSaving(true);
    try {
      await onAddInterview(item._id, {
        label: label.trim() || "Interview",
        scheduledAt: start.toISOString(),
        ...(linkedRecordId ? { linkedInterviewRecordId: linkedRecordId } : {})
      });
      closeModal();
    } catch {
      setSaving(false);
    }
  };

  const modal =
    modalOpen &&
    createPortal(
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div
          className="modal-card interview-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="interview-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 id="interview-modal-title" className="interview-modal-title">
            Add interview
          </h3>
          <p className="interview-modal-context">
            <strong>{item.company}</strong>
            <span className="interview-modal-sep">·</span>
            {item.title}
          </p>
          <label className="interview-modal-field">
            Link to team interview log (optional)
            <span className="field-hint">
              Pick an existing row from the team calendar / interview log, or leave as manual and set the time below. The
              log row is updated with this job link.
            </span>
            <select
              value={linkedRecordId}
              onChange={handlePickCalendarRow}
              disabled={recordsLoading}
              aria-label="Link to interview log row"
            >
              <option value="">{recordsLoading ? "Loading…" : "— Create new log row (manual time) —"}</option>
              {sortedCalendarOptions.map((rec) => (
                <option key={rec._id} value={String(rec._id)}>
                  {(rec.company || "—") +
                    " · " +
                    (rec.roleTitle || rec.title || "Role") +
                    " · " +
                    formatChipTime(rec.scheduledAt)}
                </option>
              ))}
            </select>
          </label>
          <label className="interview-modal-field">
            Date &amp; time
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          <label className="interview-modal-field">
            Round / label
            <input
              type="text"
              placeholder="e.g. Phone screen, Onsite"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          <div className="interview-modal-actions">
            <button type="button" className="muted" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
            <button type="button" onClick={handleModalAdd} disabled={!when || saving}>
              {saving ? "Saving…" : "Add interview"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <div className="interview-cell">
      <div className="chip-list chip-list-with-action">
        {interviews.map((inv) => {
          const logId = linkedRecordIdFromInterview(inv);
          const chipLabel = (
            <>
              {inv.label && inv.label !== "Interview" ? `${inv.label} · ` : ""}
              {formatChipTime(inv.scheduledAt)}
            </>
          );
          return (
            <div key={inv._id} className="schedule-chip-wrap">
              {logId ? (
                <Link
                  className="schedule-chip schedule-chip--cal"
                  to={`/interviews/calendar?event=${encodeURIComponent(logId)}`}
                  title="View this slot on the team calendar"
                >
                  <span className="schedule-chip-text">{chipLabel}</span>
                  <span className="schedule-chip-cal-ico" aria-hidden>
                    ↗
                  </span>
                </Link>
              ) : (
                <span className="schedule-chip" title={new Date(inv.scheduledAt).toLocaleString()}>
                  <span className="schedule-chip-text">{chipLabel}</span>
                </span>
              )}
              {canEdit && (
                <button
                  type="button"
                  className="schedule-chip-remove"
                  onClick={() => onRemoveInterview(item._id, inv._id)}
                  aria-label="Remove interview"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        {canEdit && (
          <button
            type="button"
            className="interview-add-btn"
            title="Add interview"
            aria-label="Add interview"
            onClick={() => setModalOpen(true)}
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {modal}
    </div>
  );
}
