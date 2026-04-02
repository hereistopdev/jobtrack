import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  deleteProfileIdDocument,
  deleteProfileOtherDocument,
  deleteProfileResumeFile,
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
    addressLine: "",
    country: "",
    taxId: "",
    resumeText: "",
    resumeUrl: "",
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
      addressLine: p.addressLine ?? "",
      country: p.country ?? "",
      taxId: p.taxId ?? "",
      resumeText: p.resumeText ?? "",
      resumeUrl: p.resumeUrl ?? "",
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

function CalendarColorSwatches({ value, onChange, groupLabel }) {
  const v = coerceCalendarProfileColor(value) ?? DEFAULT_CALENDAR_PROFILE_COLOR;
  return (
    <div
      className="calendar-color-swatches"
      role="radiogroup"
      aria-label={groupLabel || "Calendar color"}
    >
      {CALENDAR_PROFILE_COLOR_PALETTE.map((hex) => (
        <button
          key={hex}
          type="button"
          role="radio"
          aria-checked={v === hex}
          tabIndex={v === hex ? 0 : -1}
          className={`calendar-color-swatch ${v === hex ? "selected" : ""}`}
          style={{ backgroundColor: hex }}
          onClick={() => onChange(hex)}
          title={hex}
        />
      ))}
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

export default function JobProfilesPage() {
  const { user, refreshUser } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadKey, setUploadKey] = useState("");

  useEffect(() => {
    if (!user) return;
    setProfiles(normalizeFromUser(user));
  }, [user]);

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
      const jobProfiles = profiles
        .map(
          (
            {
              id,
              label,
              calendarColor,
              summary,
              overview,
              fullName,
              addressLine,
              country,
              taxId,
              resumeText,
              resumeUrl,
              technologies,
              experiences,
              universities,
              notes
            },
            i
          ) => ({
            ...(id ? { id } : {}),
            label: label.trim(),
            calendarColor:
              coerceCalendarProfileColor(calendarColor) ??
              CALENDAR_PROFILE_COLOR_PALETTE[i % CALENDAR_PROFILE_COLOR_PALETTE.length],
            summary: summary ?? "",
            overview: overview ?? "",
            fullName: fullName ?? "",
            addressLine: addressLine ?? "",
            country: country ?? "",
            taxId: taxId ?? "",
            resumeText: resumeText ?? "",
            resumeUrl: (resumeUrl ?? "").trim(),
            technologies: technologies ?? "",
            experiences: (Array.isArray(experiences) ? experiences : []).filter(
              (e) => e && Object.values(e).some((v) => String(v ?? "").trim())
            ),
            universities: (Array.isArray(universities) ? universities : []).filter(
              (u) => u && Object.values(u).some((v) => String(v ?? "").trim())
            ),
            notes: notes ?? ""
          })
        )
        .filter((p) => p.label);
      await patchMyProfile({ jobProfiles });
      await refreshUser();
      setMsg("Saved.");
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setBusy(false);
    }
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
      {msg ? (
        <div className="card" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#047857" }}>
          {msg}
        </div>
      ) : null}

      <form onSubmit={handleSubmit}>
        <div className="job-profiles-list">
          {profiles.length === 0 ? (
            <div className="card muted-text" style={{ marginBottom: "1rem" }}>
              No profiles yet. Add one to store details and documents for each way you apply.
            </div>
          ) : null}
          {profiles.map((row, idx) => (
            <section key={row.id || `new-${idx}`} className="card job-profile-editor-card">
              <div className="job-profile-editor-head">
                <h2 className="table-card-title">Profile {idx + 1}</h2>
                <button type="button" className="muted small" onClick={() => removeAt(idx)}>
                  Remove
                </button>
              </div>

              <div className="interviews-form-grid">
                <label className="form-field">
                  <span>Label</span>
                  <input
                    required
                    value={row.label}
                    onChange={(e) => updateAt(idx, { label: e.target.value })}
                    placeholder="e.g. Staff engineer, Contract FE"
                    maxLength={120}
                  />
                </label>
                <label className="form-field form-field-calendar-color">
                  <span>Calendar color</span>
                  <CalendarColorSwatches
                    value={row.calendarColor}
                    onChange={(hex) => updateAt(idx, { calendarColor: hex })}
                    groupLabel={`Calendar color for profile ${idx + 1}`}
                  />
                </label>

                <h3 className="job-profile-section-title form-field-span2">Identity & contact (this profile)</h3>
                <label className="form-field">
                  <span>Full name</span>
                  <input
                    value={row.fullName}
                    onChange={(e) => updateAt(idx, { fullName: e.target.value })}
                    maxLength={200}
                    placeholder="As on applications"
                  />
                </label>
                <label className="form-field">
                  <span>Country</span>
                  <input
                    value={row.country}
                    onChange={(e) => updateAt(idx, { country: e.target.value })}
                    maxLength={120}
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>Address</span>
                  <input
                    value={row.addressLine}
                    onChange={(e) => updateAt(idx, { addressLine: e.target.value })}
                    maxLength={500}
                    placeholder="Street, city, region, postal code"
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>SSN or EIN (optional)</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Sensitive — only store if your team deployment is trusted and access-controlled.
                  </span>
                  <input
                    value={row.taxId}
                    onChange={(e) => updateAt(idx, { taxId: e.target.value })}
                    maxLength={32}
                    autoComplete="off"
                  />
                </label>

                <h3 className="job-profile-section-title form-field-span2">Overview & stack</h3>
                <label className="form-field form-field-span2">
                  <span>Overview</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    How you position this search (role, seniority, contract vs FTE, focus areas).
                  </span>
                  <textarea
                    value={row.overview}
                    onChange={(e) => updateAt(idx, { overview: e.target.value })}
                    rows={5}
                    maxLength={16000}
                    placeholder="Professional summary for this persona…"
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>Technologies & keywords</span>
                  <textarea
                    value={row.technologies}
                    onChange={(e) => updateAt(idx, { technologies: e.target.value })}
                    rows={3}
                    placeholder="e.g. React, TypeScript, Node.js — or one per line"
                    maxLength={4000}
                  />
                </label>

                <h3 className="job-profile-section-title form-field-span2">Experience</h3>
                <div className="form-field-span2 job-profile-repeatable">
                  {(row.experiences?.length ? row.experiences : [emptyExperience()]).map((ex, j) => (
                    <div key={j} className="job-profile-repeatable-block card">
                      <div className="job-profile-repeatable-head">
                        <span className="muted-text small">Role {j + 1}</span>
                        <button
                          type="button"
                          className="muted small"
                          onClick={() => {
                            const next = [...(row.experiences?.length ? row.experiences : [emptyExperience()])];
                            next.splice(j, 1);
                            updateAt(idx, { experiences: next.length ? next : [] });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="interviews-form-grid" style={{ marginTop: "8px" }}>
                        <label className="form-field">
                          <span>Title</span>
                          <input
                            value={ex.title}
                            onChange={(e) => {
                              const next = [...(row.experiences || [])];
                              next[j] = { ...ex, title: e.target.value };
                              updateAt(idx, { experiences: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Company</span>
                          <input
                            value={ex.company}
                            onChange={(e) => {
                              const next = [...(row.experiences || [])];
                              next[j] = { ...ex, company: e.target.value };
                              updateAt(idx, { experiences: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Location</span>
                          <input
                            value={ex.location}
                            onChange={(e) => {
                              const next = [...(row.experiences || [])];
                              next[j] = { ...ex, location: e.target.value };
                              updateAt(idx, { experiences: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Start</span>
                          <input
                            value={ex.startDate}
                            onChange={(e) => {
                              const next = [...(row.experiences || [])];
                              next[j] = { ...ex, startDate: e.target.value };
                              updateAt(idx, { experiences: next });
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
                              const next = [...(row.experiences || [])];
                              next[j] = { ...ex, endDate: e.target.value };
                              updateAt(idx, { experiences: next });
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
                              const next = [...(row.experiences || [])];
                              next[j] = { ...ex, description: e.target.value };
                              updateAt(idx, { experiences: next });
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
                      updateAt(idx, {
                        experiences: [...(row.experiences || []), emptyExperience()]
                      })
                    }
                  >
                    + Add experience
                  </button>
                </div>

                <h3 className="job-profile-section-title form-field-span2">Education</h3>
                <div className="form-field-span2 job-profile-repeatable">
                  {(row.universities?.length ? row.universities : [emptyUniversity()]).map((uni, j) => (
                    <div key={j} className="job-profile-repeatable-block card">
                      <div className="job-profile-repeatable-head">
                        <span className="muted-text small">School {j + 1}</span>
                        <button
                          type="button"
                          className="muted small"
                          onClick={() => {
                            const next = [...(row.universities?.length ? row.universities : [emptyUniversity()])];
                            next.splice(j, 1);
                            updateAt(idx, { universities: next.length ? next : [] });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="interviews-form-grid" style={{ marginTop: "8px" }}>
                        <label className="form-field">
                          <span>University / school</span>
                          <input
                            value={uni.name}
                            onChange={(e) => {
                              const next = [...(row.universities || [])];
                              next[j] = { ...uni, name: e.target.value };
                              updateAt(idx, { universities: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Degree</span>
                          <input
                            value={uni.degree}
                            onChange={(e) => {
                              const next = [...(row.universities || [])];
                              next[j] = { ...uni, degree: e.target.value };
                              updateAt(idx, { universities: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Field</span>
                          <input
                            value={uni.field}
                            onChange={(e) => {
                              const next = [...(row.universities || [])];
                              next[j] = { ...uni, field: e.target.value };
                              updateAt(idx, { universities: next });
                            }}
                            maxLength={200}
                          />
                        </label>
                        <label className="form-field">
                          <span>Year</span>
                          <input
                            value={uni.year}
                            onChange={(e) => {
                              const next = [...(row.universities || [])];
                              next[j] = { ...uni, year: e.target.value };
                              updateAt(idx, { universities: next });
                            }}
                            maxLength={40}
                          />
                        </label>
                        <label className="form-field form-field-span2">
                          <span>Notes</span>
                          <textarea
                            value={uni.notes}
                            onChange={(e) => {
                              const next = [...(row.universities || [])];
                              next[j] = { ...uni, notes: e.target.value };
                              updateAt(idx, { universities: next });
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
                      updateAt(idx, {
                        universities: [...(row.universities || []), emptyUniversity()]
                      })
                    }
                  >
                    + Add education
                  </button>
                </div>

                <h3 className="job-profile-section-title form-field-span2">Resume file & text</h3>
                <p className="form-field-span2 muted-text small" style={{ margin: 0 }}>
                  Upload PDF, DOCX, or TXT — text is extracted into the resume field, and experience/education sections
                  are parsed when the file uses common section titles (e.g. &quot;Experience&quot;, &quot;Education&quot;).
                  Save the profile first, then upload.
                </p>
                {row.id ? (
                  <div className="form-field-span2 job-profile-upload-row">
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                      disabled={!!uploadKey}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        runUpload(`resume-${idx}`, () => uploadProfileResume(row.id, f));
                      }}
                    />
                    {row.resumeFile ? (
                      <span className="job-profile-file-meta">
                        {row.resumeFile.originalName || "Resume"}
                        {row.resumeFile.parsedTextLength
                          ? ` · ${row.resumeFile.parsedTextLength} chars extracted`
                          : ""}
                        <button
                          type="button"
                          className="small muted"
                          disabled={!!uploadKey}
                          onClick={() =>
                            runUpload(`dl-resume-${idx}`, async () => {
                              const blob = await fetchProfileFileBlob(row.id, { type: "resume" });
                              triggerBlobDownload(blob, row.resumeFile?.originalName || "resume");
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
                            runUpload(`rm-resume-${idx}`, () => deleteProfileResumeFile(row.id))
                          }
                        >
                          Remove file
                        </button>
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="form-field-span2 muted-text small">Save this profile once to enable resume upload.</p>
                )}

                <label className="form-field form-field-span2">
                  <span>Resume (text)</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Editable copy for applications — filled from upload or paste manually.
                  </span>
                  <textarea
                    value={row.resumeText}
                    onChange={(e) => updateAt(idx, { resumeText: e.target.value })}
                    rows={12}
                    placeholder="Paste resume content or upload a file above…"
                    className="job-profile-resume-textarea"
                    maxLength={50000}
                  />
                </label>
                <label className="form-field form-field-span2">
                  <span>Resume or portfolio URL</span>
                  <input
                    type="url"
                    value={row.resumeUrl}
                    onChange={(e) => updateAt(idx, { resumeUrl: e.target.value })}
                    placeholder="https://…"
                    maxLength={2000}
                  />
                </label>

                <h3 className="job-profile-section-title form-field-span2">ID & verification documents</h3>
                {row.id ? (
                  <div className="form-field-span2 job-profile-docs-block">
                    <div className="job-profile-upload-inline">
                      <select id={`id-kind-${idx}`} defaultValue="passport" className="job-profile-select">
                        {ID_KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        disabled={!!uploadKey}
                        onChange={(e) => {
                          const list = e.target.files;
                          const kind = document.getElementById(`id-kind-${idx}`)?.value || "other";
                          e.target.value = "";
                          if (!list?.length) return;
                          runUpload(`id-${idx}`, () =>
                            uploadProfileIdDocuments(row.id, Array.from(list), kind)
                          );
                        }}
                      />
                    </div>
                    <div className="job-profile-doc-grid">
                      {(row.idDocuments || []).map((d) => (
                        <div key={d.id} className="job-profile-doc-card">
                          <ProfileDocumentThumb
                            profileId={row.id}
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
                                  const blob = await fetchProfileFileBlob(row.id, { type: "id", docId: d.id });
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
                              onClick={() =>
                                runUpload(`idr-${d.id}`, () => deleteProfileIdDocument(row.id, d.id))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="form-field-span2 muted-text small">Save the profile to upload ID documents.</p>
                )}

                <h3 className="job-profile-section-title form-field-span2">Other documents</h3>
                {row.id ? (
                  <div className="form-field-span2 job-profile-docs-block">
                    <div className="job-profile-upload-inline">
                      <select id={`other-cat-${idx}`} defaultValue="diploma" className="job-profile-select">
                        {OTHER_DOC_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        id={`other-label-${idx}`}
                        placeholder="Label (optional)"
                        maxLength={200}
                        className="job-profile-other-label"
                      />
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        disabled={!!uploadKey}
                        onChange={(e) => {
                          const list = e.target.files;
                          const category = document.getElementById(`other-cat-${idx}`)?.value || "other";
                          const label = document.getElementById(`other-label-${idx}`)?.value || "";
                          e.target.value = "";
                          if (!list?.length) return;
                          runUpload(`oth-${idx}`, () =>
                            uploadProfileOtherDocuments(row.id, Array.from(list), category, label)
                          );
                        }}
                      />
                    </div>
                    <div className="job-profile-doc-grid">
                      {(row.otherDocuments || []).map((d) => (
                        <div key={d.id} className="job-profile-doc-card">
                          <ProfileDocumentThumb
                            profileId={row.id}
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
                                  const blob = await fetchProfileFileBlob(row.id, { type: "other", docId: d.id });
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
                                runUpload(`odr-${d.id}`, () => deleteProfileOtherDocument(row.id, d.id))
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="form-field-span2 muted-text small">Save the profile to upload diplomas, transcripts, etc.</p>
                )}

                <label className="form-field form-field-span2">
                  <span>Private notes</span>
                  <span className="field-hint muted-text" style={{ display: "block", fontSize: "0.8rem" }}>
                    Talking points, comp bands, targets — not shown on calendar.
                  </span>
                  <textarea
                    value={row.notes}
                    onChange={(e) => updateAt(idx, { notes: e.target.value })}
                    rows={4}
                    placeholder="Optional notes…"
                    maxLength={8000}
                  />
                </label>
              </div>
            </section>
          ))}
        </div>

        <div className="job-profiles-actions card">
          <button type="button" className="muted" onClick={() => setProfiles((p) => [...p, emptyProfile()])}>
            Add profile
          </button>
          <button type="submit" disabled={busy || !!uploadKey}>
            {busy ? "Saving…" : "Save all profiles"}
          </button>
        </div>
      </form>
    </main>
  );
}
