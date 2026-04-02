import { useEffect, useState } from "react";
import { changeMyPassword, patchMyProfile } from "../api";
import { useAuth } from "../context/AuthContext";

const DEFAULT_HEX = "#2563eb";

function normalizeProfilesForEdit(u) {
  const list = u?.jobProfiles;
  if (Array.isArray(list) && list.length) {
    return list.map((p) => ({
      id: p.id || "",
      label: p.label || "",
      calendarColor: /^#[0-9a-f]{6}$/i.test(p.calendarColor || "") ? p.calendarColor : DEFAULT_HEX
    }));
  }
  const legacy = u?.interviewProfiles;
  if (Array.isArray(legacy) && legacy.length) {
    return legacy.map((label) => ({ id: "", label: String(label), calendarColor: DEFAULT_HEX }));
  }
  return [];
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [nameMsg, setNameMsg] = useState("");
  const [profilesMsg, setProfilesMsg] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordMsg, setPasswordMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.name || "");
    setProfiles(normalizeProfilesForEdit(user));
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

  const saveProfiles = async (e) => {
    e.preventDefault();
    setBusy(true);
    setProfilesMsg("");
    try {
      const jobProfiles = profiles
        .map(({ id, label, calendarColor }) => ({
          ...(id ? { id } : {}),
          label: label.trim(),
          calendarColor: /^#[0-9a-f]{6}$/i.test(calendarColor || "") ? calendarColor : DEFAULT_HEX
        }))
        .filter((p) => p.label);
      const updated = await patchMyProfile({ jobProfiles });
      await refreshUser();
      setProfiles(normalizeProfilesForEdit(updated));
      setProfilesMsg("Saved.");
    } catch (err) {
      setProfilesMsg(err.message || "Save failed");
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
          Your display name, job-search profiles (with calendar colors), and password. More fields may be added later
          (resumes, tech stack, etc.).
        </p>
      </header>

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

      <section className="card" style={{ marginBottom: "1rem" }}>
        <h2 className="table-card-title">Job apply profiles</h2>
        <p className="muted-text" style={{ marginBottom: "1rem" }}>
          Each profile is a context you apply in (for example Staff engineer vs. contract). Calendar colors apply to your
          interviews when a row is linked to you and this profile.
        </p>
        <form onSubmit={saveProfiles}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {profiles.map((row, idx) => (
              <div
                key={row.id || `new-${idx}`}
                style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}
              >
                <input
                  type="color"
                  value={/^#[0-9a-f]{6}$/i.test(row.calendarColor) ? row.calendarColor : DEFAULT_HEX}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, calendarColor: v } : p)));
                  }}
                  aria-label={`Calendar color for ${row.label || "profile"}`}
                  style={{ width: 44, height: 36, padding: 0, border: "none", cursor: "pointer" }}
                />
                <input
                  value={row.label}
                  onChange={(e) => {
                    const v = e.target.value;
                    setProfiles((prev) => prev.map((p, i) => (i === idx ? { ...p, label: v } : p)));
                  }}
                  placeholder="Profile label"
                  style={{ flex: "1 1 200px", maxWidth: 320 }}
                />
                <button
                  type="button"
                  className="muted"
                  onClick={() => setProfiles((prev) => prev.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="muted"
              onClick={() => setProfiles((prev) => [...prev, { id: "", label: "", calendarColor: DEFAULT_HEX }])}
            >
              Add profile
            </button>
            <button type="submit" disabled={busy}>
              Save profiles
            </button>
            {profilesMsg ? <span className="field-hint muted-text">{profilesMsg}</span> : null}
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
