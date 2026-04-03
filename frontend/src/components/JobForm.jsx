import { useEffect, useRef, useState } from "react";
import { parseJobLinkFromUrl } from "../api";

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm = (jobProfileId = "") => ({
  company: "",
  title: "",
  country: "",
  link: "",
  date: todayISO(),
  status: "Saved",
  notes: "",
  jobProfileId
});

function JobForm({ onSubmit, editingItem, onCancelEdit, linkInputRef, jobProfiles = [] }) {
  const defaultProfileId = jobProfiles?.[0]?._id ? String(jobProfiles[0]._id) : "";
  const [form, setForm] = useState(() => emptyForm(defaultProfileId));
  const [parsing, setParsing] = useState(false);
  const lastParsedLinkRef = useRef("");

  useEffect(() => {
    if (editingItem) {
      lastParsedLinkRef.current = "";
      setForm({
        company: editingItem.company || "",
        title: editingItem.title || "",
        country: editingItem.country || "",
        link: editingItem.link || "",
        date: editingItem.date ? new Date(editingItem.date).toISOString().slice(0, 10) : todayISO(),
        status: editingItem.status || "Saved",
        notes: editingItem.notes || "",
        jobProfileId: editingItem.jobProfileId ? String(editingItem.jobProfileId) : ""
      });
    } else {
      lastParsedLinkRef.current = "";
      const pid = jobProfiles?.[0]?._id ? String(jobProfiles[0]._id) : "";
      setForm(emptyForm(pid));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when switching add/edit; profile backfill uses separate effect
  }, [editingItem]);

  useEffect(() => {
    if (editingItem) return;
    if (!jobProfiles?.length) return;
    setForm((prev) => {
      if (prev.jobProfileId) return prev;
      return { ...prev, jobProfileId: String(jobProfiles[0]._id) };
    });
  }, [jobProfiles, editingItem]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const applyParsed = (data) => {
    setForm((prev) => ({
      ...prev,
      link: data.link || prev.link,
      company: data.company?.trim() ? data.company.trim() : prev.company,
      title: data.title?.trim() ? data.title.trim() : prev.title,
      date: data.date || todayISO(),
      notes: prev.notes.trim()
        ? prev.notes
        : data.description?.trim()
          ? data.description.trim().slice(0, 8000)
          : prev.notes
    }));
  };

  const runParse = async (url) => {
    const trimmed = url.trim();
    if (!trimmed || editingItem) return;
    if (!/^https?:\/\//i.test(trimmed)) return;
    if (trimmed === lastParsedLinkRef.current) return;

    setParsing(true);
    try {
      const data = await parseJobLinkFromUrl(trimmed);
      lastParsedLinkRef.current = trimmed;
      applyParsed(data);
    } catch {
      setForm((prev) => ({
        ...prev,
        link: trimmed,
        date: prev.date || todayISO()
      }));
    } finally {
      setParsing(false);
    }
  };

  const handleLinkPaste = (e) => {
    const text = e.clipboardData?.getData("text")?.trim();
    if (!text || editingItem) return;
    if (!/^https?:\/\//i.test(text)) return;
    setTimeout(() => runParse(text), 0);
  };

  const handleLinkBlur = (e) => {
    runParse(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(form);
    if (!editingItem) {
      setForm(emptyForm(defaultProfileId));
      lastParsedLinkRef.current = "";
    }
  };

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>{editingItem ? "Edit job" : "Add job"}</h2>

      <label className="full-width">
        Job URL
        <span className="field-hint">
          Paste a posting URL to autofill company, role, and sometimes a short description from the page (best effort;
          many ATS sites block automated reads).
        </span>
        <input
          ref={linkInputRef}
          name="link"
          type="url"
          value={form.link}
          onChange={handleChange}
          onPaste={handleLinkPaste}
          onBlur={handleLinkBlur}
          placeholder="https://..."
          required
          disabled={parsing}
          autoComplete="off"
        />
        {parsing && <span className="inline-status">Reading page…</span>}
      </label>

      <label>
        Company
        <input name="company" value={form.company} onChange={handleChange} required />
      </label>

      <label>
        Role
        <input name="title" value={form.title} onChange={handleChange} required />
      </label>

      <label className="full-width">
        Country
        <span className="field-hint">Used to detect duplicates (same country + role as another row). Optional.</span>
        <input name="country" value={form.country} onChange={handleChange} placeholder="e.g. United States" />
      </label>

      <label>
        Date
        <input name="date" type="date" value={form.date} onChange={handleChange} required />
      </label>

      <label>
        Profile
        <span className="field-hint">Which job-search profile this application is for (team stats).</span>
        <select
          name="jobProfileId"
          value={form.jobProfileId}
          onChange={handleChange}
          aria-label="Job profile"
        >
          <option value="">—</option>
          {jobProfiles.map((p) => (
            <option key={p._id} value={String(p._id)}>
              {p.label || "Profile"}
            </option>
          ))}
        </select>
      </label>

      <label>
        Status
        <select name="status" value={form.status} onChange={handleChange}>
          <option>Saved</option>
          <option>Applied</option>
          <option>Interview</option>
          <option>Offer</option>
          <option>Rejected</option>
        </select>
      </label>

      <label className="full-width">
        Notes
        <textarea name="notes" rows={3} value={form.notes} onChange={handleChange} />
      </label>

      <div className="actions full-width">
        <button type="submit" disabled={parsing}>
          {editingItem ? "Update Link" : "Add Link"}
        </button>
        {editingItem && (
          <button type="button" className="muted" onClick={onCancelEdit}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

export default JobForm;
