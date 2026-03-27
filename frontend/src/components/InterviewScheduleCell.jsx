import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  const [saving, setSaving] = useState(false);

  const interviews = [...(item.interviews || [])].sort(
    (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
  );

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
    setSaving(false);
  };

  const handleModalAdd = async () => {
    if (!when || saving) return;
    setSaving(true);
    try {
      await onAddInterview(item._id, {
        label: label.trim() || "Interview",
        scheduledAt: when
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
            Date &amp; time
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              autoFocus
            />
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
        {interviews.map((inv) => (
          <span
            key={inv._id}
            className="schedule-chip"
            title={new Date(inv.scheduledAt).toLocaleString()}
          >
            <span className="schedule-chip-text">
              {inv.label && inv.label !== "Interview" ? `${inv.label} · ` : ""}
              {formatChipTime(inv.scheduledAt)}
            </span>
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
          </span>
        ))}
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
