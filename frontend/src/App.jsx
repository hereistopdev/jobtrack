import { useEffect, useMemo, useState } from "react";
import { createJobLink, deleteJobLink, fetchJobLinks, updateJobLink } from "./api";
import JobForm from "./components/JobForm";
import JobTable from "./components/JobTable";

function App() {
  const [links, setLinks] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = window.confirm("Delete this job link?");
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

  const filteredLinks = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return links;
    return links.filter((item) =>
      [item.company, item.title, item.status, item.notes]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [links, query]);

  return (
    <main className="container">
      <header className="page-header">
        <h1>Team Job Links Dashboard</h1>
        <p>Track and manage applications by company, role, link, date, and status.</p>
      </header>

      <JobForm onSubmit={handleSubmit} editingItem={editingItem} onCancelEdit={() => setEditingItem(null)} />

      <section className="toolbar card">
        <input
          placeholder="Search company, title, status, notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>{filteredLinks.length} result(s)</span>
      </section>

      {error && <div className="card error">{error}</div>}
      {loading ? (
        <div className="card">Loading job links...</div>
      ) : (
        <JobTable items={filteredLinks} onEdit={setEditingItem} onDelete={handleDelete} />
      )}
    </main>
  );
}

export default App;
