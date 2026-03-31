import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTeamAccount,
  deleteTeamAccount,
  fetchTeamAccounts,
  updateTeamAccount
} from "../api";
import AuthenticatorSection from "../components/AuthenticatorSection";
import { useAuth } from "../context/AuthContext";

const CATEGORIES = [
  { value: "email", label: "Email" },
  { value: "payment", label: "Payment" },
  { value: "freelance", label: "Freelancing" },
  { value: "communication", label: "Communication (Discord, Telegram, Teams, …)" },
  { value: "other", label: "Other" }
];

function categoryLabel(v) {
  return CATEGORIES.find((c) => c.value === v)?.label || v;
}

function emptyForm() {
  return {
    category: "communication",
    label: "",
    identifier: "",
    credentials: "",
    notes: ""
  };
}

async function copyText(text) {
  const t = String(text ?? "");
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    window.prompt("Copy:", t);
  }
}

export default function AccountsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState("mine");
  const [mine, setMine] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [accountsSection, setAccountsSection] = useState("credentials");

  const loadMine = useCallback(async () => {
    const data = await fetchTeamAccounts();
    setMine(data.entries || []);
  }, []);

  const loadTeam = useCallback(async () => {
    const data = await fetchTeamAccounts({ view: "all" });
    setTeam(data.entries || []);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isAdmin) {
        await Promise.all([loadMine(), loadTeam()]);
      } else {
        await loadMine();
      }
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isAdmin, loadMine, loadTeam]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isAdmin && tab === "team") setTab("mine");
  }, [isAdmin, tab]);

  const activeList = tab === "team" ? team : mine;

  const filteredList = useMemo(() => {
    if (!filterCat) return activeList;
    return activeList.filter((r) => r.category === filterCat);
  }, [activeList, filterCat]);

  const groupedTeam = useMemo(() => {
    if (tab !== "team") return [];
    const m = new Map();
    for (const e of filteredList) {
      if (!m.has(e.ownerId)) {
        m.set(e.ownerId, {
          ownerId: e.ownerId,
          ownerEmail: e.ownerEmail,
          ownerName: e.ownerName,
          items: []
        });
      }
      m.get(e.ownerId).items.push(e);
    }
    const arr = [...m.values()];
    arr.sort((a, b) => {
      const na = (a.ownerName || a.ownerEmail || "").toLowerCase();
      const nb = (b.ownerName || b.ownerEmail || "").toLowerCase();
      return na.localeCompare(nb);
    });
    return arr;
  }, [tab, filteredList]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = {
        category: form.category,
        label: form.label.trim(),
        identifier: form.identifier.trim(),
        credentials: form.credentials,
        notes: form.notes.trim()
      };
      if (!body.label) {
        setError("Label is required.");
        return;
      }
      if (editingId) {
        const updated = await updateTeamAccount(editingId, body);
        setMine((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
        setTeam((prev) => prev.map((x) => (x._id === updated._id ? updated : x)));
      } else {
        const created = await createTeamAccount(body);
        setMine((prev) => [created, ...prev]);
        if (isAdmin) setTeam((prev) => [created, ...prev]);
      }
      setForm(emptyForm());
      setEditingId(null);
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row) => {
    setEditingId(row._id);
    setForm({
      category: row.category || "other",
      label: row.label || "",
      identifier: row.identifier || "",
      credentials: row.credentials || "",
      notes: row.notes || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this account row? This cannot be undone.")) return;
    setError("");
    try {
      await deleteTeamAccount(id);
      setMine((prev) => prev.filter((x) => x._id !== id));
      setTeam((prev) => prev.filter((x) => x._id !== id));
      if (editingId === id) cancelEdit();
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const canEditRow = (row) => isAdmin || row.ownerId === user?.id;

  const renderTableRows = (rows) =>
    rows.map((row) => (
      <tr key={row._id}>
        <td>
          <span className="accounts-cat-pill">{categoryLabel(row.category)}</span>
        </td>
        <td className="accounts-td-label">{row.label}</td>
        <td className="accounts-td-mono">{row.identifier || "—"}</td>
        <td className="accounts-td-cred">
          {row.credentials ? (
            <span className="accounts-cred-wrap">
              <span className="accounts-cred-text">••••••••</span>
              <button
                type="button"
                className="small muted accounts-copy-btn"
                onClick={() => copyText(row.credentials)}
              >
                Copy
              </button>
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="accounts-td-notes">{row.notes || "—"}</td>
        <td className="table-actions">
          {canEditRow(row) && (
            <>
              <button type="button" className="small muted" onClick={() => startEdit(row)}>
                Edit
              </button>
              <button type="button" className="small danger" onClick={() => handleDelete(row._id)}>
                Delete
              </button>
            </>
          )}
        </td>
      </tr>
    ));

  return (
    <main className="container container-dashboard accounts-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Team accounts</h1>
          <p>
            Store logins and credentials, or use the built-in authenticator for TOTP codes (Google Authenticator–style).
            Admins can review team credential rows; authenticator secrets stay per user.
          </p>
        </div>
      </header>

      <div className="finance-dash-shell accounts-dash-shell">
        <div
          className="finance-dash-panel"
          role="tabpanel"
          id="accounts-dash-panel"
          aria-labelledby={`accounts-dash-tab-${accountsSection}`}
          tabIndex={-1}
        >
          {accountsSection === "credentials" && (
            <>
      <div className="card accounts-warning">
        <strong>Sensitive data.</strong> Passwords and keys are stored in the database. Use HTTPS, limit who has admin
        access, and never share your JobTrack login.
      </div>

      {isAdmin && (
        <div className="accounts-tabs card toolbar-extended" role="tablist" aria-label="Accounts scope">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "mine"}
            className={`accounts-tab-btn${tab === "mine" ? " is-active" : ""}`}
            onClick={() => setTab("mine")}
          >
            My accounts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "team"}
            className={`accounts-tab-btn${tab === "team" ? " is-active" : ""}`}
            onClick={() => setTab("team")}
          >
            All team (admin)
          </button>
        </div>
      )}

      <section className="card accounts-form-card">
        <h2 className="table-card-title">{editingId ? "Edit account row" : "Add account row"}</h2>
        <form className="accounts-form-grid" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              aria-label="Category"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-field-span2">
            <span>Label</span>
            <input
              required
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. PayPal business, Discord work server"
              maxLength={200}
            />
          </label>
          <label className="form-field form-field-span2">
            <span>Identifier (email, username, URL)</span>
            <input
              value={form.identifier}
              onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))}
              placeholder="Optional — what you log in with"
              maxLength={500}
            />
          </label>
          <label className="form-field form-field-span2">
            <span>Credentials</span>
            <textarea
              value={form.credentials}
              onChange={(e) => setForm((f) => ({ ...f, credentials: e.target.value }))}
              rows={3}
              placeholder="Password, API key, backup codes — shown only to you and admins"
              className="accounts-textarea-mono"
            />
          </label>
          <label className="form-field form-field-span2">
            <span>Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional context (2FA app name, recovery email, …)"
            />
          </label>
          <div className="accounts-form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Add row"}
            </button>
            {editingId && (
              <button type="button" className="muted" onClick={cancelEdit}>
                Cancel edit
              </button>
            )}
          </div>
        </form>
      </section>

      {error && <div className="card error">{error}</div>}

      {loading ? (
        <div className="card">Loading accounts…</div>
      ) : (
        <section className="card accounts-table-card">
          <div className="accounts-table-head">
            <h2 className="table-card-title">{tab === "team" ? "Team directory" : "Your rows"}</h2>
            <label className="accounts-filter">
              <span className="muted-text">Filter</span>
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} aria-label="Filter by category">
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {tab === "team" && isAdmin ? (
            filteredList.length === 0 && activeList.length > 0 ? (
              <p className="table-empty">No rows match this category filter.</p>
            ) : groupedTeam.length === 0 ? (
              <p className="table-empty">No rows yet.</p>
            ) : (
              groupedTeam.map((g) => (
                <div key={g.ownerId} className="accounts-team-group">
                  <h3 className="accounts-team-heading">
                    {g.ownerName || g.ownerEmail}
                    <span className="accounts-team-email muted-text">{g.ownerEmail}</span>
                  </h3>
                  <div className="table-scroll-wrap">
                    <table className="data-table accounts-table">
                      <thead>
                        <tr>
                          <th scope="col">Category</th>
                          <th scope="col">Label</th>
                          <th scope="col">Identifier</th>
                          <th scope="col">Credentials</th>
                          <th scope="col">Notes</th>
                          <th scope="col" className="table-actions">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>{renderTableRows(g.items)}</tbody>
                    </table>
                  </div>
                </div>
              ))
            )
          ) : filteredList.length === 0 && activeList.length > 0 ? (
            <p className="table-empty">No rows match this category filter.</p>
          ) : filteredList.length === 0 ? (
            <p className="table-empty">No rows yet. Add your first account above.</p>
          ) : (
            <div className="table-scroll-wrap">
              <table className="data-table accounts-table">
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Label</th>
                    <th scope="col">Identifier</th>
                    <th scope="col">Credentials</th>
                    <th scope="col">Notes</th>
                    <th scope="col" className="table-actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>{renderTableRows(filteredList)}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
            </>
          )}

          {accountsSection === "authenticator" && <AuthenticatorSection />}
        </div>

        <nav className="finance-dash-tabs-nav" aria-label="Accounts sections">
          <div className="finance-dash-tabs-rail" role="tablist" aria-orientation="vertical">
            <button
              type="button"
              id="accounts-dash-tab-credentials"
              role="tab"
              aria-selected={accountsSection === "credentials"}
              aria-controls="accounts-dash-panel"
              className={`finance-dash-tab-btn${accountsSection === "credentials" ? " is-active" : ""}`}
              onClick={() => setAccountsSection("credentials")}
            >
              Account rows
            </button>
            <button
              type="button"
              id="accounts-dash-tab-authenticator"
              role="tab"
              aria-selected={accountsSection === "authenticator"}
              aria-controls="accounts-dash-panel"
              className={`finance-dash-tab-btn${accountsSection === "authenticator" ? " is-active" : ""}`}
              onClick={() => setAccountsSection("authenticator")}
            >
              Authenticator app
            </button>
          </div>
        </nav>
      </div>
    </main>
  );
}
