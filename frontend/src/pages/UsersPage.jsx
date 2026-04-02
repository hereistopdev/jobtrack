import { useEffect, useMemo, useState } from "react";
import { adminBulkDeleteJobLinks, deleteAdminUser, fetchAdminUsers, updateAdminUser } from "../api";
import { useAuth } from "../context/AuthContext";
import { exportUsersToXlsx } from "../utils/exportXlsx";

const CONFIRM_PHRASE = "DELETE_JOB_LINKS";

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const [deleteAll, setDeleteAll] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState(() => new Set());
  const [confirmText, setConfirmText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await fetchAdminUsers();
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const pa = a.signupApproved === false ? 0 : 1;
      const pb = b.signupApproved === false ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return (a.email || "").localeCompare(b.email || "");
    });
  }, [users]);

  const handleApproveSignup = async (u) => {
    if (u.signupApproved !== false) return;
    setSavingId(u._id);
    try {
      const updated = await updateAdminUser(u._id, { signupApproved: true });
      setUsers((prev) => prev.map((row) => (row._id === updated._id ? updated : row)));
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleRoleChange = async (user, newRole) => {
    if (newRole === user.role) return;
    setSavingId(user._id);
    try {
      const updated = await updateAdminUser(user._id, { role: newRole });
      setUsers((prev) => prev.map((u) => (u._id === updated._id ? updated : u)));
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteUser = async (u) => {
    if (String(u._id) === String(currentUser?.id)) return;
    const ok = window.confirm(
      `Permanently delete ${u.email}?\n\nThis removes their account, jobs they added, interviews they logged, calendar sync sources, TOTP entries, and saved team accounts. Finance rows they created stay but are no longer attributed to a user. Interviews where they were only the “subject” remain in the team log with the subject unlinked.\n\nThis cannot be undone.`
    );
    if (!ok) return;
    setDeletingId(u._id);
    setError("");
    try {
      await deleteAdminUser(u._id);
      setUsers((prev) => prev.filter((row) => row._id !== u._id));
    } catch (e) {
      setError(e.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFinanceOwnerBlur = async (u, value) => {
    const next = value.trim();
    const cur = (u.financeOwnerLabel || "").trim();
    if (next === cur) return;
    setSavingId(u._id);
    try {
      const updated = await updateAdminUser(u._id, { financeOwnerLabel: next });
      setUsers((prev) => prev.map((row) => (row._id === updated._id ? updated : row)));
    } catch (e) {
      setError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  const toggleUserFilter = (id) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setError("");
    setBulkResult("");
    if (confirmText !== CONFIRM_PHRASE) {
      setError(`Type exactly ${CONFIRM_PHRASE} in the confirmation field.`);
      return;
    }
    if (!deleteAll && !dateFrom && !dateTo && selectedUserIds.size === 0) {
      setError('Choose "Delete all jobs", or set a date range and/or pick at least one user.');
      return;
    }

    const summary = deleteAll
      ? "ALL job records on the team board (every user)."
      : [
          dateFrom || dateTo
            ? `Job date ${dateFrom || "…"} → ${dateTo || "…"} (inclusive, UTC calendar days).`
            : null,
          selectedUserIds.size > 0
            ? `Only rows added by ${selectedUserIds.size} selected user(s).`
            : "All users (for the chosen dates, if any)."
        ]
          .filter(Boolean)
          .join(" ");

    const ok = window.confirm(`Permanently delete matching jobs?\n\n${summary}\n\nThis cannot be undone.`);
    if (!ok) return;

    setBulkBusy(true);
    try {
      const payload = { confirm: CONFIRM_PHRASE, deleteAll };
      if (!deleteAll) {
        if (dateFrom) payload.dateFrom = dateFrom;
        if (dateTo) payload.dateTo = dateTo;
        if (selectedUserIds.size > 0) payload.userIds = [...selectedUserIds];
      }
      const data = await adminBulkDeleteJobLinks(payload);
      setBulkResult(data.message || `Removed ${data.deletedCount ?? 0} record(s).`);
      setConfirmText("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <main className="container container-dashboard users-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Users</h1>
          <p>
            Manage accounts and roles. <strong>Delete</strong> removes a member and their owned data (see confirmation
            text). <strong>New signups</strong> appear as pending until you approve them. Set{" "}
            <strong>Finance owner</strong> so it matches the ledger &quot;Owner&quot; column (1:1 with the account);
            overrides display name when set.
          </p>
        </div>
        {!loading && users.length > 0 && (
          <button
            type="button"
            className="small muted table-export-btn"
            onClick={() => exportUsersToXlsx(users, "users")}
          >
            Export XLSX
          </button>
        )}
      </header>

      {error && <div className="card error">{error}</div>}
      {loading ? (
        <div className="card">Loading users…</div>
      ) : (
        <div className="card table-card">
          <div className="table-wrap">
            <table className="data-table users-table">
              <thead>
                <tr>
                  <th className="th-email">Email</th>
                  <th className="th-name">Name</th>
                  <th className="th-access">Access</th>
                  <th className="th-finance-owner">Finance owner (ledger)</th>
                  <th className="th-role">Role</th>
                  <th className="th-date">Joined</th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => (
                  <tr key={u._id}>
                    <td className="cell-ellipsis" title={u.email}>
                      {u.email}
                    </td>
                    <td className="cell-ellipsis" title={u.name || ""}>
                      {u.name || "—"}
                    </td>
                    <td className="users-access-cell">
                      {u.signupApproved === false ? (
                        <span className="users-pending-wrap">
                          <span className="users-pending-badge" title="Cannot sign in until approved">
                            Pending
                          </span>
                          <button
                            type="button"
                            className="small users-approve-btn"
                            disabled={savingId === u._id}
                            onClick={() => handleApproveSignup(u)}
                          >
                            Approve
                          </button>
                        </span>
                      ) : (
                        <span className="users-active-label">Active</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="text"
                        className="users-finance-owner-input"
                        defaultValue={u.financeOwnerLabel || ""}
                        placeholder="Same as ledger Owner"
                        title="Optional. When set, matches Finance Owner column instead of Name"
                        disabled={savingId === u._id}
                        onBlur={(e) => handleFinanceOwnerBlur(u, e.target.value)}
                        aria-label={`Finance owner label for ${u.email}`}
                      />
                    </td>
                    <td>
                      <select
                        className="users-role-select"
                        value={u.role}
                        disabled={savingId === u._id}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        aria-label={`Role for ${u.email}`}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="cell-date">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="users-actions-cell">
                      {String(u._id) === String(currentUser?.id) ? (
                        <span className="muted-text users-delete-hint" title="You cannot delete your own account">
                          —
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="small users-delete-btn"
                          disabled={savingId === u._id || deletingId === u._id}
                          onClick={() => handleDeleteUser(u)}
                        >
                          {deletingId === u._id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="card admin-bulk-delete-card" aria-label="Bulk delete jobs">
        <h2>Remove job records</h2>
        <p className="admin-bulk-delete-warn">
          Deletes rows from the <strong>jobs board</strong> only (not user accounts). Use filters, or remove everything.
          Matching uses each row&apos;s <strong>job date</strong> field and <strong>who added</strong> the job.
        </p>

        <label className="admin-bulk-delete-check">
          <input
            type="checkbox"
            checked={deleteAll}
            onChange={(e) => {
              setDeleteAll(e.target.checked);
              if (e.target.checked) {
                setDateFrom("");
                setDateTo("");
                setSelectedUserIds(new Set());
              }
            }}
          />
          <span>Delete <strong>all</strong> jobs (entire board)</span>
        </label>

        {!deleteAll && (
          <div className="admin-bulk-delete-filters">
            <div className="admin-bulk-delete-dates">
              <label className="toolbar-date-label">
                Job date from
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>
              <label className="toolbar-date-label">
                Job date to
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
            <fieldset className="admin-bulk-delete-users">
              <legend>Added by (optional — leave none checked to include every user for the date range)</legend>
              <div className="admin-bulk-delete-user-chips">
                {users.map((u) => (
                  <label key={u._id} className="admin-bulk-delete-user-label">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u._id)}
                      onChange={() => toggleUserFilter(u._id)}
                    />
                    <span className="cell-ellipsis" title={u.email}>
                      {u.email}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="field-hint">
              Provide a <strong>date range</strong> and/or <strong>one or more users</strong>. If you only pick users
              (no dates), all of their links are removed.
            </p>
          </div>
        )}

        <label className="admin-bulk-delete-confirm-label full-width">
          Type <code className="admin-bulk-delete-code">{CONFIRM_PHRASE}</code> to confirm
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            placeholder={CONFIRM_PHRASE}
          />
        </label>

        <div className="actions">
          <button type="button" className="danger" disabled={bulkBusy || loading} onClick={handleBulkDelete}>
            {bulkBusy ? "Deleting…" : "Delete matching records"}
          </button>
        </div>

        {bulkResult && <p className="admin-bulk-delete-success">{bulkResult} Refresh the job board to see changes.</p>}
      </section>
    </main>
  );
}
