import { useEffect, useState } from "react";

const initialForm = {
  company: "",
  title: "",
  link: "",
  date: "",
  status: "Saved",
  notes: ""
};

function JobForm({ onSubmit, editingItem, onCancelEdit }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (editingItem) {
      setForm({
        company: editingItem.company || "",
        title: editingItem.title || "",
        link: editingItem.link || "",
        date: editingItem.date ? new Date(editingItem.date).toISOString().slice(0, 10) : "",
        status: editingItem.status || "Saved",
        notes: editingItem.notes || ""
      });
    } else {
      setForm(initialForm);
    }
  }, [editingItem]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(form);
    if (!editingItem) {
      setForm(initialForm);
    }
  };

  return (
    <form className="card form-grid" onSubmit={handleSubmit}>
      <h2>{editingItem ? "Edit Job Link" : "Add Job Link"}</h2>

      <label>
        Company
        <input name="company" value={form.company} onChange={handleChange} required />
      </label>

      <label>
        Job Title
        <input name="title" value={form.title} onChange={handleChange} required />
      </label>

      <label>
        Job Link
        <input name="link" type="url" value={form.link} onChange={handleChange} required />
      </label>

      <label>
        Date
        <input name="date" type="date" value={form.date} onChange={handleChange} required />
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
        <button type="submit">{editingItem ? "Update Link" : "Add Link"}</button>
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
