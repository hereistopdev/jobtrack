import { useEffect, useState } from "react";
import { fetchAdminUsers, updateAdminUser } from "../api";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

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

  return (
    <main className="container container-dashboard users-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Users</h1>
          <p>Manage accounts and roles. Admins can edit or delete any job link.</p>
        </div>
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
                  <th className="th-role">Role</th>
                  <th className="th-date">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u._id}>
                    <td className="cell-ellipsis" title={u.email}>
                      {u.email}
                    </td>
                    <td className="cell-ellipsis" title={u.name || ""}>
                      {u.name || "—"}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
