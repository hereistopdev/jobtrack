import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { changeMyPassword, patchMyProfile } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordMsg, setPasswordMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.name || "");
  }, [user]);

  const saveName = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNameMsg("");
    try {
      const updated = await patchMyProfile({ name: displayName.trim() });
      await refreshUser();
      setDisplayName(updated.name || "");
      setNameMsg("Saved.");
    } catch (err) {
      setNameMsg(err.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg("");
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordMsg("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      await changeMyPassword(passwordForm.current, passwordForm.next);
      setPasswordForm({ current: "", next: "", confirm: "" });
      setPasswordMsg("Password updated.");
    } catch (err) {
      setPasswordMsg(err.message || "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="container container-dashboard">
      <header className="page-header">
        <h1>Profile</h1>
        <p className="muted-text">
          Your account name and password. Job-search personas (resumes, calendar colors, tech keywords) live on{" "}
          <Link to="/job-profiles" className="interviews-cal-link">
            Job Profiles
          </Link>
          .
        </p>
      </header>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="table-card-title">Job Profiles</h2>
        <p className="muted-text" style={{ marginBottom: "0.75rem" }}>
          Manage multiple apply personas—each with full detail, resume text, links, and notes.
        </p>
        <Link to="/job-profiles" className="interviews-cal-link">
          Open Job Profiles →
        </Link>
      </section>

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="table-card-title">Account</h2>
        <p>
          <strong>Email</strong>{" "}
          <span className="muted-text" title={user?.email}>
            {user?.email}
          </span>
        </p>
        <form onSubmit={saveName} className="interviews-form-grid" style={{ marginTop: "1rem" }}>
          <label className="form-field form-field-span2">
            <span>Display name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={160} />
          </label>
          <div className="form-field form-field-span2">
            <button type="submit" disabled={busy}>
              Save name
            </button>
            {nameMsg ? (
              <span className="field-hint muted-text" style={{ marginLeft: 12 }}>
                {nameMsg}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="table-card-title">Password</h2>
        <form onSubmit={changePassword} className="interviews-form-grid">
          <label className="form-field form-field-span2">
            <span>Current password</span>
            <input
              type="password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
              autoComplete="current-password"
            />
          </label>
          <label className="form-field">
            <span>New password</span>
            <input
              type="password"
              value={passwordForm.next}
              onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
              autoComplete="new-password"
            />
          </label>
          <label className="form-field">
            <span>Confirm new</span>
            <input
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
              autoComplete="new-password"
            />
          </label>
          <div className="form-field form-field-span2">
            <button type="submit" disabled={busy}>
              Change password
            </button>
            {passwordMsg ? (
              <span className="field-hint muted-text" style={{ marginLeft: 12 }}>
                {passwordMsg}
              </span>
            ) : null}
          </div>
        </form>
      </section>
    </main>
  );
}
