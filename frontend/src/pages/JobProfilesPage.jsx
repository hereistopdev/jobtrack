import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteProfileIdDocument,
  deleteProfileOtherDocument,
  deleteProfileResumeFile,
  fetchJobProfileStats,
  fetchProfileFileBlob,
  patchMyProfile,
  triggerBlobDownload,
  uploadProfileIdDocuments,
  uploadProfileOtherDocuments,
  uploadProfileResume
} from "../api";
import ProfileDocumentThumb from "../components/ProfileDocumentThumb.jsx";
import { useAuth } from "../context/AuthContext";
import {
  CALENDAR_PROFILE_COLOR_PALETTE,
  coerceCalendarProfileColor,
  DEFAULT_CALENDAR_PROFILE_COLOR
} from "../utils/calendarProfileColors";

function emptyExperience() {
  return { title: "", company: "", location: "", startDate: "", endDate: "", description: "" };
}

function emptyUniversity() {
  return { name: "", degree: "", field: "", year: "", notes: "" };
}

function emptyProfile() {
  return {
    id: "",
    label: "",
    calendarColor: DEFAULT_CALENDAR_PROFILE_COLOR,
    summary: "",
    overview: "",
    fullName: "",
    dateOfBirth: "",
    profileEmail: "",
    linkedinUrl: "",
    portfolioUrl: "",
    addressLine: "",
    country: "",
    taxId: "",
    resumeText: "",
    resumeUrl: "",
    resumeAtsScore: null,
    technologies: "",
    experiences: [],
    universities: [],
    notes: "",
    resumeFile: null,
    idDocuments: [],
    otherDocuments: []
  };
}

function normalizeFromUser(u) {
  const list = u?.jobProfiles;
  if (Array.isArray(list) && list.length) {
    return list.map((p, i) => ({
      id: p.id || "",
      label: p.label || "",
      calendarColor:
        coerceCalendarProfileColor(p.calendarColor) ??
        CALENDAR_PROFILE_COLOR_PALETTE[i % CALENDAR_PROFILE_COLOR_PALETTE.length],
      summary: p.summary ?? "",
      overview: p.overview ?? p.summary ?? "",
      fullName: p.fullName ?? "",
      dateOfBirth: p.dateOfBirth ?? "",
      profileEmail: p.profileEmail ?? "",
      linkedinUrl: p.linkedinUrl ?? "",
      portfolioUrl: p.portfolioUrl ?? "",
      addressLine: p.addressLine ?? "",
      country: p.country ?? "",
      taxId: p.taxId ?? "",
      resumeText: p.resumeText ?? "",
      resumeUrl: p.resumeUrl ?? "",
      resumeAtsScore: p.resumeAtsScore != null ? p.resumeAtsScore : null,
      technologies: p.technologies ?? "",
      experiences: Array.isArray(p.experiences) && p.experiences.length ? p.experiences : [],
      universities: Array.isArray(p.universities) && p.universities.length ? p.universities : [],
      notes: p.notes ?? "",
      resumeFile: p.resumeFile ?? null,
      idDocuments: Array.isArray(p.idDocuments) ? p.idDocuments : [],
      otherDocuments: Array.isArray(p.otherDocuments) ? p.otherDocuments : []
    }));
  }
  const legacy = u?.interviewProfiles;
  if (Array.isArray(legacy) && legacy.length) {
    return legacy.map((label) => ({
      ...emptyProfile(),
      label: String(label)
    }));
  }
  return [];
}

/** Opens a floating color board (like calendar UI popups) instead of an inline-only grid. */
function CalendarColorBoardPopup({ value, onChange, groupLabel }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const v = coerceCalendarProfileColor(value) ?? DEFAULT_CALENDAR_PROFILE_COLOR;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className="job-profile-color-board" ref={wrapRef}>
      <button
        type="button"
        className="job-profile-color-board-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${groupLabel || "Calendar color"}: ${v}. Open palette.`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="job-profile-color-board-trigger-swatch" style={{ backgroundColor: v }} aria-hidden />
        <span className="job-profile-color-board-trigger-text">
          <span className="job-profile-color-board-trigger-label">Choose color</span>
          <span className="job-profile-color-board-trigger-hex muted-text">{v}</span>
        </span>
      </button>
      {open ? (
        <div
          className="job-profile-color-board-popup card"
          role="dialog"
          aria-label={groupLabel || "Choose calendar color"}
        >
          <div className="job-profile-color-board-popup-grid" role="listbox">
            {CALENDAR_PROFILE_COLOR_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                role="option"
                aria-selected={v === hex}
                className={`job-profile-color-board-cell ${v === hex ? "selected" : ""}`}
                style={{ backgroundColor: hex }}
                title={hex}
                onClick={() => {
                  onChange(hex);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const ID_KIND_OPTIONS = [
  { value: "drivers_license", label: "Driver license" },
  { value: "passport", label: "Passport" },
  { value: "green_card", label: "Permanent resident card" },
  { value: "state_id", label: "State ID" },
  { value: "other", label: "Other ID" }
];

const OTHER_DOC_OPTIONS = [
  { value: "diploma", label: "Diploma" },
  { value: "transcript", label: "Transcript" },
  { value: "paystub", label: "Paystub" },
  { value: "certificate", label: "Certificate" },
  { value: "other", label: "Other" }
];

function mapProfilesToPayload(profiles) {
  return profiles
    .map((p, i) => ({
      ...(p.id ? { id: p.id } : {}),
      label: String(p.label ?? "").trim(),
      calendarColor:
        coerceCalendarProfileColor(p.calendarColor) ??
        CALENDAR_PROFILE_COLOR_PALETTE[i % CALENDAR_PROFILE_COLOR_PALETTE.length],
      summary: p.summary ?? "",
      overview: p.overview ?? "",
      fullName: p.fullName ?? "",
      dateOfBirth: p.dateOfBirth ?? "",
      profileEmail: p.profileEmail ?? "",
      linkedinUrl: p.linkedinUrl ?? "",
      portfolioUrl: p.portfolioUrl ?? "",
      addressLine: p.addressLine ?? "",
      country: p.country ?? "",
      taxId: p.taxId ?? "",
      resumeText: p.resumeText ?? "",
      resumeUrl: (p.resumeUrl ?? "").trim(),
      resumeAtsScore: p.resumeAtsScore != null ? p.resumeAtsScore : null,
      technologies: p.technologies ?? "",
      experiences: (Array.isArray(p.experiences) ? p.experiences : []).filter(
        (e) => e && Object.values(e).some((v) => String(v ?? "").trim())
      ),
      universities: (Array.isArray(p.universities) ? p.universities : []).filter(
        (u) => u && Object.values(u).some((v) => String(v ?? "").trim())
      ),
      notes: p.notes ?? ""
    }))
    .filter((p) => p.label);
}

function previewText(s, max = 72) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function externalHref(u) {
  const s = String(u || "").trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/** Profiles list only: stored PDF preview (iframe). No extracted text. */
function ResumePreviewPanel({ profile }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfErr, setPdfErr] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const pid = profile?.id;
  const rf = profile?.resumeFile;
  const mime = String(rf?.mimeType || "").toLowerCase();
  const isPdf = Boolean(rf && mime.includes("pdf"));

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;

    setPdfErr(null);
    setPdfUrl(null);

    if (!pid || !rf || !isPdf) {
      return () => {
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    setLoadingPdf(true);
    fetchProfileFileBlob(pid, { type: "resume" })
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      })
      .catch((e) => {
        if (!cancelled) setPdfErr(e?.message || "Could not load PDF");
      })
      .finally(() => {
        if (!cancelled) setLoadingPdf(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [pid, rf?.originalName, rf?.mimeType, isPdf]);

  if (!profile) {
    return <p className="muted-text job-profile-resume-preview-empty">Select a profile to preview its resume.</p>;
  }

  const label = profile.label?.trim() || "Unnamed profile";

  return (
    <div className="job-profile-resume-preview-stack">
      {loadingPdf && isPdf ? (
        <p className="muted-text job-profile-resume-preview-empty" role="status">
          Loading PDF…
        </p>
      ) : null}

      {pdfErr && isPdf ? <p className="job-profile-resume-preview-empty error">{pdfErr}</p> : null}

      {pdfUrl && isPdf ? (
        <div className="job-profile-resume-preview-body job-profile-resume-preview-body--pdf">
          <p className="job-profile-resume-preview-meta muted-text small">
            Stored file:{" "}
            <strong>{profile.resumeFile?.originalName || "resume.pdf"}</strong>
            <span className="job-profile-resume-preview-badge">PDF</span>
          </p>
          <iframe title={`Resume PDF: ${label}`} src={pdfUrl} className="job-profile-resume-preview-iframe" />
        </div>
      ) : null}

      {!isPdf && !loadingPdf && profile.resumeFile?.originalName ? (
        <p className="muted-text job-profile-resume-preview-empty">
          {mime.includes("word")
            ? "Word file is on file — this panel only previews PDFs. Convert or upload a PDF to preview here, or open the file from Add or update."
            : "This panel only previews PDFs. Upload a PDF in Add or update to see it here."}
        </p>
      ) : null}

      {!isPdf && !profile.resumeFile ? (
        <p className="muted-text job-profile-resume-preview-empty">No PDF on file for {label} yet.</p>
      ) : null}
    </div>
  );
}

function ProfileSelectionInfo({ profile, accountEmail, stats, statsLoading }) {
  if (!profile) return null;

  const li = (k, v, { href } = {}) => {
    const empty = v == null || String(v).trim() === "";
    const display = empty ? "—" : String(v).trim();
    return (
      <div className="job-profile-info-row" key={k}>
        <dt>{k}</dt>
        <dd>
          {href && !empty ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {display}
            </a>
          ) : (
            display
          )}
        </dd>
      </div>
    );
  };

  return (
    <div className="job-profiles-selection-info-inner">
      <h3 className="job-profiles-selection-info-heading">Selection details</h3>
      <dl className="job-profiles-selection-dl">
        {li("Full name", profile.fullName)}
        {li("Country", profile.country)}
        {li("Full address", profile.addressLine)}
        {li("Date of birth", profile.dateOfBirth)}
        {li("Account email", accountEmail)}
        {li("Profile / application email", profile.profileEmail)}
        {li("LinkedIn", profile.linkedinUrl, { href: externalHref(profile.linkedinUrl) })}
        {li("Portfolio URL", profile.portfolioUrl, { href: externalHref(profile.portfolioUrl) })}
        {li("Resume / CV link", profile.resumeUrl, { href: externalHref(profile.resumeUrl) })}
        {li(
          "ATS score (heuristic)",
          profile.resumeAtsScore != null ? `${profile.resumeAtsScore}/100` : null
        )}
        <div className="job-profile-info-row">
          <dt>Job applies (tracked)</dt>
          <dd>
            {statsLoading ? "…" : stats ? String(stats.appliedJobsCount) : profile.id ? "—" : "Save profile first"}
          </dd>
        </div>
        <div className="job-profile-info-row">
          <dt>Interviews logged</dt>
          <dd>
            {statsLoading ? "…" : stats ? String(stats.interviewsLoggedCount) : profile.id ? "—" : "Save profile first"}
          </dd>
        </div>
        <div className="job-profile-info-row job-profile-info-row--hint">
          <dt />
          <dd className="muted-text small">
            Link job board rows to this profile to count applies. Stats use interviews tied to this profile in the team
            log.
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function JobProfilesPage() {
  const { user, refreshUser } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadKey, setUploadKey] = useState("");
  /** list | edit */
  const [view, setView] = useState("list");
  /** index into profiles when view === 'edit' */
  const [editIdx, setEditIdx] = useState(0);
  /** highlighted profile for resume preview (list view) */
  const [previewIdx, setPreviewIdx] = useState(0);
  const [profileStats, setProfileStats] = useState(null);
  const [profileStatsLoading, setProfileStatsLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setProfiles(normalizeFromUser(user));
  }, [user]);

  useEffect(() => {
    setPreviewIdx((i) => {
      if (profiles.length === 0) return 0;
      return Math.min(Math.max(0, i), profiles.length - 1);
    });
  }, [profiles.length]);

  const previewProfile = profiles[previewIdx];
  const previewProfileId = previewProfile?.id;

  useEffect(() => {
    if (!previewProfileId) {
      setProfileStats(null);
      setProfileStatsLoading(false);
      return;
    }
    let cancelled = false;
    setProfileStatsLoading(true);
    fetchJobProfileStats(previewProfileId)
      .then((s) => {
        if (!cancelled) setProfileStats(s);
      })
      .catch(() => {
        if (!cancelled) setProfileStats(null);
      })
      .finally(() => {
        if (!cancelled) setProfileStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewProfileId]);

  const updateAt = (idx, patch) => {
    setProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeAt = (idx) => {
    setProfiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const jobProfiles = mapProfilesToPayload(profiles);
      await patchMyProfile({ jobProfiles });
      await refreshUser();
      setMsg("Saved.");
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteProfileAt = async (idx) => {
    const row = profiles[idx];
    const label = row?.label?.trim() || "Unnamed profile";
    if (!window.confirm(`Remove “${label}” from your job profiles?`)) return;
    setError("");
    setMsg("");
    try {
      const next = profiles.filter((_, i) => i !== idx);
      const jobProfiles = mapProfilesToPayload(next);
      await patchMyProfile({ jobProfiles });
      await refreshUser();
      setMsg("Profile removed.");
      if (view === "edit") {
        if (editIdx === idx) {
          setView("list");
        } else {
          let nextIdx = editIdx > idx ? editIdx - 1 : editIdx;
          if (nextIdx >= next.length) {
            nextIdx = Math.max(0, next.length - 1);
          }
          setEditIdx(nextIdx);
        }
      }
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const goList = () => setView("list");

  const goAddNew = () => {
    const next = [...profiles, emptyProfile()];
    setProfiles(next);
    setEditIdx(next.length - 1);
    setView("edit");
    setError("");
    setMsg("");
  };

  const goEdit = (i) => {
    setEditIdx(i);
    setPreviewIdx(i);
    setView("edit");
    setError("");
    setMsg("");
  };

  /** Subnav: open editor (first profile, or create one if none). */
  const goAddOrUpdate = () => {
    if (profiles.length === 0) {
      goAddNew();
      return;
    }
    const safe = Math.min(Math.max(0, editIdx), profiles.length - 1);
    setEditIdx(safe);
    setView("edit");
    setError("");
    setMsg("");
  };

  const runUpload = async (key, fn) => {
    setUploadKey(key);
    setError("");
    try {
      const data = await fn();
      await refreshUser();
      if (data?.extractedChars != null) {
        setMsg(
          `Resume uploaded (${data.extractedChars} characters). Parsed ${data.parsedExperiences ?? 0} experience block(s) and ${data.parsedUniversities ?? 0} education block(s) where section headings were found.`
        );
      } else if (typeof data?.message === "string" && data.message) {
        setMsg(data.message);
      } else {
        setMsg("Updated.");
      }
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploadKey("");
    }
  };

  const editorRow = view === "edit" ? profiles[editIdx] : null;
  const editorIdx = editIdx;

  return (
    <main className="container container-dashboard job-profiles-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Job Profiles</h1>
          <p className="muted-text">
            Manage one or more apply personas—identity, documents, resume text, and calendar color. Use a profile when
            logging interviews so the team calendar can color by persona.{" "}
            <Link to="/profile" className="interviews-cal-link">
              Account settings
            </Link>
          </p>
        </div>
      </header>

      {error ? <div className="card error">{error}</div> : null}
      {uploadKey ? (
        <div className="card" style={{ background: "#eff6ff", borderColor: "#bfdbfe", color: "#1d4ed8" }}>
          Uploading…
        </div>
      ) : null}
      {msg ? (
        <div className="card" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#047857" }}>
          {msg}
        </div>
      ) : null}

      <div className="job-profiles-layout">
        <aside className="job-profiles-subnav" aria-label="Job profiles sections">
          <button
            type="button"
            className={`job-profiles-subnav-item${view === "list" ? " active" : ""}`}
            onClick={goList}
          >
            Profiles
          </button>
          <button
            type="button"
            className={`job-profiles-subnav-item${view === "edit" ? " active" : ""}`}
            onClick={goAddOrUpdate}
          >
            Add or update
          </button>
        </aside>

        <div className="job-profiles-main">
          {view === "list" ? (
            <div className="job-profiles-list-preview-split">
              <div className="job-profiles-left-col">
                <div className="job-profiles-list-panel">
                  <div className="card table-card job-profiles-table-card">
                  <div className="table-card-head-row">
                    <h2 className="table-card-title">Your profiles</h2>
                    <button type="button" className="small" onClick={goAddNew}>
                      + Add profile
                    </button>
                  </div>
                  {profiles.length === 0 ? (
                    <p className="muted-text" style={{ padding: "12px 16px", margin: 0 }}>
                      No profiles yet. Use <strong>Add profile</strong> or open <strong>Add or update</strong> in the
                      menu to create one.
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table job-profiles-data-table">
                        <thead>
                          <tr>
                            <th className="th-job-prof-color" aria-label="Calendar color" />
                            <th>Label</th>
                            <th className="th-job-prof-overview">Overview</th>
                            <th className="th-job-prof-meta">Resume</th>
                            <th className="th-job-prof-meta">Docs</th>
                            <th className="th-actions">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profiles.map((p, i) => {
                            const docCount = (p.idDocuments?.length || 0) + (p.otherDocuments?.length || 0);
                            return (
                              <tr
                                key={p.id || `new-${i}`}
                                className={i === previewIdx ? "job-profiles-data-row-selected" : undefined}
                                onClick={() => setPreviewIdx(i)}
                              >
                                <td>
                                  <span
                                    className="job-prof-color-dot"
                                    style={{ backgroundColor: p.calendarColor }}
                                    title={p.calendarColor}
                                  />
                                </td>
                                <td className="cell-ellipsis" title={p.label || ""}>
                                  {p.label?.trim() ? (
                                    p.label
                                  ) : (
                                    <span className="muted-text">(unnamed draft)</span>
                                  )}
                                  {!p.id ? (
                                    <span className="job-prof-draft-badge" title="Not saved yet">
                                      Draft
                                    </span>
                                  ) : null}
                                </td>
                                <td className="cell-ellipsis th-job-prof-overview" title={p.overview || ""}>
                                  {previewText(p.overview)}
                                </td>
                                <td className="muted-text">
                                  {p.resumeFile ? "File" : p.resumeText?.trim() ? "Text" : "—"}
                                </td>
                                <td className="muted-text">{docCount || "—"}</td>
                                <td className="job-prof-table-actions">
                                  <button
                                    type="button"
                                    className="small muted"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      goEdit(i);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="small muted"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteProfileAt(i);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                </div>
                <div className="card job-profiles-selection-info">
                  <ProfileSelectionInfo
                    profile={profiles[previewIdx] ?? null}
                    accountEmail={user?.email ?? ""}
                    stats={profileStats}
                    statsLoading={profileStatsLoading}
                  />
                </div>
              </div>
              <section
                className="card job-profiles-resume-preview-panel"
                aria-label="Resume preview for selected profile"
              >
                <h2 className="table-card-title job-profiles-resume-preview-title">Resume preview</h2>
                <p className="muted-text small job-profiles-resume-preview-sub">
                  {profiles[previewIdx]
                    ? `Showing: ${profiles[previewIdx].label?.trim() || "Unnamed profile"} — click a row to switch. PDF preview only.`
                    : "Select a profile from the list."}
                </p>
                <ResumePreviewPanel profile={profiles[previewIdx] ?? null} />
              </section>
            </div>
          ) : null}

          {view === "edit" && editorRow ? (
            <form onSubmit={handleSubmit} className="job-profiles-edit-form job-profiles-edit-form-full">
              <section className="card job-profile-editor-card">
                <div className="job-profile-editor-head">
                  <h2 className="table-card-title">
                    {editorRow.label?.trim() ? `Edit: ${editorRow.label}` : `Profile ${editorIdx + 1}`}
                  </h2>
                  <div className="job-profile-editor-head-actions">
                    <button type="button" className="muted small" onClick={() => removeAt(editorIdx)}>
                      Remove from list
                    </button>
                  </div>
                </div>

                <div className="job-profile-form-outer">
                  <details className="job-profile-edit-section" open>
                    <summary>Profile basics</summary>
                    <div className="job-profile-section-body">
                      <div className="job-profile-form-grid">
                        <label className="form-field">
                          <span>Label</span>
                          <input
                            required
                            value={editorRow.label}
                            onChange={(e) => updateAt(editorIdx, { label: e.target.value })}
                            placeholder="e.g. Staff engineer, Contract FE"
                            maxLength={120}
                          />
                        </label>
                        <label className="form-field form-field-calendar-color">
                          <span>Calendar color</span>
                          <CalendarColorBoardPopup
                            value={editorRow.calendarColor}
                            onChange={(hex) => updateAt(editorIdx, { calendarColor: hex })}
                            groupLabel={`Calendar color for profile ${editorIdx + 1}`}
                          />
                        </label>
                      </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section" open>
                    <summary>Contact &amp; links</summary>
                    <div className="job-profile-section-body">
                      <div className="job-profile-form-grid">
                <label className="form-field">
                  <span>Full name</span>
                  <input
                    value={editorRow.fullName}
                    onChange={(e) => updateAt(editorIdx, { fullName: e.target.value })}
                    maxLength={200}
                    placeholder="As on applications"
                  />
                </label>
                <label className="form-field">
                  <span>Date of birth</span>
                  <input
                    value={editorRow.dateOfBirth}
                    onChange={(e) => updateAt(editorIdx, { dateOfBirth: e.target.value })}
                    maxLength={40}
                    placeholder="e.g. 1990-04-15 or as you prefer"
                  />
                </label>
                <label className="form-field">
                  <span>Email (applications)</span>
                  <input
                    type="email"
                    value={editorRow.profileEmail}
                    onChange={(e) => updateAt(editorIdx, { profileEmail: e.target.value })}
                    maxLength={200}
                    placeholder="May differ from account email"
                    autoComplete="off"
                  />
                </label>
                <label className="form-field">
                  <span>Country</span>
                  <input
                    value={editorRow.country}
                    onChange={(e) => updateAt(editorIdx, { country: e.target.value })}
                    maxLength={120}
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>Full address</span>
                  <input
                    value={editorRow.addressLine}
                    onChange={(e) => updateAt(editorIdx, { addressLine: e.target.value })}
                    maxLength={500}
                    placeholder="Street, city, region, postal code"
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>LinkedIn URL</span>
                  <input
                    type="url"
                    value={editorRow.linkedinUrl}
                    onChange={(e) => updateAt(editorIdx, { linkedinUrl: e.target.value })}
                    maxLength={500}
                    placeholder="https://linkedin.com/in/…"
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>Portfolio URL</span>
                  <input
                    type="url"
                    value={editorRow.portfolioUrl}
                    onChange={(e) => updateAt(editorIdx, { portfolioUrl: e.target.value })}
                    maxLength={2000}
                    placeholder="https://…"
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>SSN or EIN (optional)</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Sensitive — only store if your team deployment is trusted and access-controlled.
                  </span>
                  <input
                    value={editorRow.taxId}
                    onChange={(e) => updateAt(editorIdx, { taxId: e.target.value })}
                    maxLength={32}
                    autoComplete="off"
                  />
                </label>
                      </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section" open>
                    <summary>Overview &amp; positioning</summary>
                    <div className="job-profile-section-body">
                      <div className="job-profile-form-grid">
                <label className="form-field form-field-span2">
                  <span>Overview</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    How you position this search (role, seniority, contract vs FTE, focus areas).
                  </span>
                  <textarea
                    value={editorRow.overview}
                    onChange={(e) => updateAt(editorIdx, { overview: e.target.value })}
                    rows={4}
                    maxLength={16000}
                    placeholder="Professional summary for this persona…"
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>Technologies & keywords</span>
                  <textarea
                    value={editorRow.technologies}
                    onChange={(e) => updateAt(editorIdx, { technologies: e.target.value })}
                    rows={3}
                    placeholder="e.g. React, TypeScript, Node.js — or one per line"
                    maxLength={4000}
                  />
                </label>
                      </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section" open>
                    <summary>Work experience</summary>
                    <div className="job-profile-section-body">
                <div className="form-field-span2 job-profile-repeatable">
                  {(editorRow.experiences?.length ? editorRow.experiences : [emptyExperience()]).map((ex, j) => (
                    <div key={j} className="job-profile-repeatable-block card">
                      <div className="job-profile-repeatable-head">
                        <span className="muted-text small">Role {j + 1}</span>
                        <button
                          type="button"
                          className="muted small"
                          onClick={() => {
                            const next = [...(editorRow.experiences?.length ? editorRow.experiences : [emptyExperience()])];
                            next.splice(j, 1);
                            updateAt(editorIdx, { experiences: next.length ? next : [] });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="job-profile-form-grid" style={{ marginTop: "8px" }}>
                        <label className="form-field">
                          <span>Title</span>
                          <input
                            value={ex.title}
                            onChange={(e) => {
                              const next = [...(editorRow.experiences || [])];
                              next[j] = { ...ex, title: e.target.value };
                              updateAt(editorIdx, { experiences: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Company</span>
                          <input
                            value={ex.company}
                            onChange={(e) => {
                              const next = [...(editorRow.experiences || [])];
                              next[j] = { ...ex, company: e.target.value };
                              updateAt(editorIdx, { experiences: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Location</span>
                          <input
                            value={ex.location}
                            onChange={(e) => {
                              const next = [...(editorRow.experiences || [])];
                              next[j] = { ...ex, location: e.target.value };
                              updateAt(editorIdx, { experiences: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Start</span>
                          <input
                            value={ex.startDate}
                            onChange={(e) => {
                              const next = [...(editorRow.experiences || [])];
                              next[j] = { ...ex, startDate: e.target.value };
                              updateAt(editorIdx, { experiences: next });
                            }}
                            maxLength={80}
                            placeholder="2019-01"
                          />
                        </label>
                        <label className="form-field">
                          <span>End</span>
                          <input
                            value={ex.endDate}
                            onChange={(e) => {
                              const next = [...(editorRow.experiences || [])];
                              next[j] = { ...ex, endDate: e.target.value };
                              updateAt(editorIdx, { experiences: next });
                            }}
                            maxLength={80}
                            placeholder="Present"
                          />
                        </label>
                        <label className="form-field form-field-span2">
                          <span>Description</span>
                          <textarea
                            value={ex.description}
                            onChange={(e) => {
                              const next = [...(editorRow.experiences || [])];
                              next[j] = { ...ex, description: e.target.value };
                              updateAt(editorIdx, { experiences: next });
                            }}
                            rows={3}
                            maxLength={8000}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="muted small"
                    onClick={() =>
                      updateAt(editorIdx, {
                        experiences: [...(editorRow.experiences || []), emptyExperience()]
                      })
                    }
                  >
                    + Add experience
                  </button>
                </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section" open>
                    <summary>Education</summary>
                    <div className="job-profile-section-body">
                <div className="form-field-span2 job-profile-repeatable">
                  {(editorRow.universities?.length ? editorRow.universities : [emptyUniversity()]).map((uni, j) => (
                    <div key={j} className="job-profile-repeatable-block card">
                      <div className="job-profile-repeatable-head">
                        <span className="muted-text small">School {j + 1}</span>
                        <button
                          type="button"
                          className="muted small"
                          onClick={() => {
                            const next = [...(editorRow.universities?.length ? editorRow.universities : [emptyUniversity()])];
                            next.splice(j, 1);
                            updateAt(editorIdx, { universities: next.length ? next : [] });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="job-profile-form-grid" style={{ marginTop: "8px" }}>
                        <label className="form-field">
                          <span>University / school</span>
                          <input
                            value={uni.name}
                            onChange={(e) => {
                              const next = [...(editorRow.universities || [])];
                              next[j] = { ...uni, name: e.target.value };
                              updateAt(editorIdx, { universities: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Degree</span>
                          <input
                            value={uni.degree}
                            onChange={(e) => {
                              const next = [...(editorRow.universities || [])];
                              next[j] = { ...uni, degree: e.target.value };
                              updateAt(editorIdx, { universities: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Field</span>
                          <input
                            value={uni.field}
                            onChange={(e) => {
                              const next = [...(editorRow.universities || [])];
                              next[j] = { ...uni, field: e.target.value };
                              updateAt(editorIdx, { universities: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Year</span>
                          <input
                            value={uni.year}
                            onChange={(e) => {
                              const next = [...(editorRow.universities || [])];
                              next[j] = { ...uni, year: e.target.value };
                              updateAt(editorIdx, { universities: next });
                            }}
                            maxLength={40}
                          />
                        </label>
                        <label className="form-field form-field-span2">
                          <span>Notes</span>
                          <textarea
                            value={uni.notes}
                            onChange={(e) => {
                              const next = [...(editorRow.universities || [])];
                              next[j] = { ...uni, notes: e.target.value };
                              updateAt(editorIdx, { universities: next });
                            }}
                            rows={2}
                            maxLength={2000}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="muted small"
                    onClick={() =>
                      updateAt(editorIdx, {
                        universities: [...(editorRow.universities || []), emptyUniversity()]
                      })
                    }
                  >
                    + Add education
                  </button>
                </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section" open>
                    <summary>Resume file, text &amp; scoring</summary>
                    <div className="job-profile-section-body">
                <p className="form-field-span2 muted-text small" style={{ margin: "0 0 8px" }}>
                  Files are stored on the server; PDFs appear in Profiles preview. Save this profile once, then upload.
                </p>
                {!editorRow.id ? (
                  <p className="form-field-span2 job-profile-upload-hint card" style={{ margin: 0, padding: "10px 12px" }}>
                    <strong>Uploads locked:</strong> fill the label and click <strong>Save all profiles</strong> at the
                    bottom, then uploads activate for this card.
                  </p>
                ) : null}
                <div className="job-profile-form-grid">
                <div className="form-field-span2 job-profile-upload-row">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    disabled={!editorRow.id || !!uploadKey}
                    title={!editorRow.id ? "Save this profile first" : undefined}
                    onChange={(e) => {
                      const input = e.target;
                      // Snapshot before clearing: FileList is live and empties when value is reset.
                      const f = input.files?.length ? input.files[0] : null;
                      input.value = "";
                      if (!editorRow.id) {
                        setMsg("");
                        setError(
                          "Save this profile first: the label must be filled in, then click Save all profiles at the bottom. After that, uploads work."
                        );
                        return;
                      }
                      if (!f) {
                        setMsg("");
                        setError('No file was selected. Try again or pick All files in the dialog if you use PDF, DOCX, or TXT.');
                        return;
                      }
                      runUpload(`resume-${editorIdx}`, () => uploadProfileResume(editorRow.id, f));
                    }}
                  />
                  {editorRow.id && editorRow.resumeFile ? (
                    <span className="job-profile-file-meta">
                      {editorRow.resumeFile.originalName || "Resume"}
                      {editorRow.resumeFile.parsedTextLength
                        ? ` · ${editorRow.resumeFile.parsedTextLength} chars extracted`
                        : ""}
                      <button
                        type="button"
                        className="small muted"
                        disabled={!!uploadKey}
                        onClick={() =>
                          runUpload(`dl-resume-${editorIdx}`, async () => {
                            const blob = await fetchProfileFileBlob(editorRow.id, { type: "resume" });
                            triggerBlobDownload(blob, editorRow.resumeFile?.originalName || "resume");
                          })
                        }
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        className="small muted"
                        disabled={!!uploadKey}
                        onClick={() => runUpload(`rm-resume-${editorIdx}`, () => deleteProfileResumeFile(editorRow.id))}
                      >
                        Remove file
                      </button>
                    </span>
                  ) : null}
                </div>

                <label className="form-field form-field-span2">
                  <span>Resume (text)</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Editable copy for applications — filled from upload or paste manually.
                  </span>
                  <textarea
                    value={editorRow.resumeText}
                    onChange={(e) => updateAt(editorIdx, { resumeText: e.target.value })}
                    rows={8}
                    placeholder="Paste resume content or upload a file above…"
                    className="job-profile-resume-textarea"
                    maxLength={50000}
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>Public resume / CV URL (optional)</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Link to a hosted resume if you use one; portfolio is above.
                  </span>
                  <input
                    type="url"
                    value={editorRow.resumeUrl}
                    onChange={(e) => updateAt(editorIdx, { resumeUrl: e.target.value })}
                    placeholder="https://…"
                    maxLength={2000}
                  />
                </label>
                <label className="form-field">
                  <span>ATS score (0–100)</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Estimated when you upload a resume; you may override.
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editorRow.resumeAtsScore ?? ""}
                    placeholder="—"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") updateAt(editorIdx, { resumeAtsScore: null });
                      else {
                        const n = parseInt(v, 10);
                        if (!Number.isNaN(n)) {
                          updateAt(editorIdx, { resumeAtsScore: Math.max(0, Math.min(100, n)) });
                        }
                      }
                    }}
                  />
                </label>
                </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section">
                    <summary>ID &amp; verification documents</summary>
                    <div className="job-profile-section-body">
                <div className="form-field-span2 job-profile-docs-block">
                  <div className="job-profile-upload-inline">
                    <select
                      id={`id-kind-${editorIdx}`}
                      defaultValue="passport"
                      className="job-profile-select"
                      disabled={!editorRow.id || !!uploadKey}
                    >
                      {ID_KIND_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf"
                      disabled={!editorRow.id || !!uploadKey}
                      title={!editorRow.id ? "Save this profile first" : undefined}
                      onChange={(e) => {
                        const input = e.target;
                        const kind = document.getElementById(`id-kind-${editorIdx}`)?.value || "other";
                        // Snapshot before clearing: FileList is live and empties when value is reset.
                        const files = input.files?.length ? Array.from(input.files) : [];
                        input.value = "";
                        if (!editorRow.id) {
                          setMsg("");
                          setError(
                            "Save this profile first: fill the label and click Save all profiles at the bottom, then add ID documents."
                          );
                          return;
                        }
                        if (!files.length) {
                          setMsg("");
                          setError(
                            "No files were selected. Try JPEG, PNG, WebP, GIF, HEIC, or PDF, or choose All files in the dialog."
                          );
                          return;
                        }
                        runUpload(`id-${editorIdx}`, () => uploadProfileIdDocuments(editorRow.id, files, kind));
                      }}
                    />
                  </div>
                  {editorRow.id ? (
                    <div className="job-profile-doc-grid">
                      {(editorRow.idDocuments || []).map((d) => (
                        <div key={d.id} className="job-profile-doc-card">
                          <ProfileDocumentThumb
                            profileId={editorRow.id}
                            docType="id"
                            docId={d.id}
                            mimeType={d.mimeType}
                            title={ID_KIND_OPTIONS.find((x) => x.value === d.kind)?.label || d.kind}
                          />
                          <div className="job-profile-doc-actions">
                            <span className="muted-text small">{d.originalName || "file"}</span>
                            <button
                              type="button"
                              className="small muted"
                              disabled={!!uploadKey}
                              onClick={() =>
                                runUpload(`idl-${d.id}`, async () => {
                                  const blob = await fetchProfileFileBlob(editorRow.id, { type: "id", docId: d.id });
                                  triggerBlobDownload(blob, d.originalName || "id-document");
                                })
                              }
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              className="small muted"
                              disabled={!!uploadKey}
                              onClick={() => runUpload(`idr-${d.id}`, () => deleteProfileIdDocument(editorRow.id, d.id))}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section">
                    <summary>Other documents</summary>
                    <div className="job-profile-section-body">
                <div className="form-field-span2 job-profile-docs-block">
                  <div className="job-profile-upload-inline">
                    <select
                      id={`other-cat-${editorIdx}`}
                      defaultValue="diploma"
                      className="job-profile-select"
                      disabled={!editorRow.id || !!uploadKey}
                    >
                      {OTHER_DOC_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      id={`other-label-${editorIdx}`}
                      placeholder="Label (optional)"
                      maxLength={200}
                      className="job-profile-other-label"
                      disabled={!editorRow.id || !!uploadKey}
                    />
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.pdf"
                      disabled={!editorRow.id || !!uploadKey}
                      title={!editorRow.id ? "Save this profile first" : undefined}
                      onChange={(e) => {
                        const input = e.target;
                        const category = document.getElementById(`other-cat-${editorIdx}`)?.value || "other";
                        const label = document.getElementById(`other-label-${editorIdx}`)?.value || "";
                        // Snapshot before clearing: FileList is live and empties when value is reset.
                        const files = input.files?.length ? Array.from(input.files) : [];
                        input.value = "";
                        if (!editorRow.id) {
                          setMsg("");
                          setError(
                            "Save this profile first: fill the label and click Save all profiles at the bottom, then add documents."
                          );
                          return;
                        }
                        if (!files.length) {
                          setMsg("");
                          setError(
                            "No files were selected. Try JPEG, PNG, WebP, GIF, HEIC, or PDF, or choose All files in the dialog."
                          );
                          return;
                        }
                        runUpload(`oth-${editorIdx}`, () =>
                          uploadProfileOtherDocuments(editorRow.id, files, category, label)
                        );
                      }}
                    />
                  </div>
                  {editorRow.id ? (
                    <div className="job-profile-doc-grid">
                      {(editorRow.otherDocuments || []).map((d) => (
                        <div key={d.id} className="job-profile-doc-card">
                          <ProfileDocumentThumb
                            profileId={editorRow.id}
                            docType="other"
                            docId={d.id}
                            mimeType={d.mimeType}
                            title={
                              (OTHER_DOC_OPTIONS.find((x) => x.value === d.category)?.label || d.category) +
                              (d.label ? ` — ${d.label}` : "")
                            }
                          />
                          <div className="job-profile-doc-actions">
                            <span className="muted-text small">{d.originalName || "file"}</span>
                            <button
                              type="button"
                              className="small muted"
                              disabled={!!uploadKey}
                              onClick={() =>
                                runUpload(`odl-${d.id}`, async () => {
                                  const blob = await fetchProfileFileBlob(editorRow.id, { type: "other", docId: d.id });
                                  triggerBlobDownload(blob, d.originalName || "document");
                                })
                              }
                            >
                              Download
                            </button>
                            <button
                              type="button"
                              className="small muted"
                              disabled={!!uploadKey}
                              onClick={() =>
                                runUpload(`odr-${d.id}`, () => deleteProfileOtherDocument(editorRow.id, d.id))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                    </div>
                  </details>

                  <details className="job-profile-edit-section">
                    <summary>Private notes</summary>
                    <div className="job-profile-section-body">
                      <div className="job-profile-form-grid">
                <label className="form-field form-field-span2">
                  <span>Private notes</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Talking points, comp bands, targets — not shown on calendar.
                  </span>
                  <textarea
                    value={editorRow.notes}
                    onChange={(e) => updateAt(editorIdx, { notes: e.target.value })}
                    rows={3}
                    placeholder="Optional notes…"
                    maxLength={8000}
                  />
                </label>
                      </div>
                    </div>
                  </details>
                </div>
            </section>

            <div className="job-profiles-actions card">
              <button type="button" className="muted" onClick={goList}>
                Back to profiles
              </button>
              <button type="button" className="muted" onClick={goAddNew}>
                + Add another profile
              </button>
              <button type="submit" disabled={busy || !!uploadKey}>
                {busy ? "Saving…" : "Save all profiles"}
              </button>
            </div>
          </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}
