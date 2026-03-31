import { useEffect, useState } from "react";
import { createTotpEntry, deleteTotpEntry, fetchTotpCodes } from "../api";

async function copyText(text) {
  const t = String(text ?? "");
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    window.prompt("Copy:", t);
  }
}

export default function AuthenticatorSection() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: "", issuer: "", secret: "" });
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const ui = window.setInterval(() => setPulse((p) => p + 1), 250);
    return () => window.clearInterval(ui);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchTotpCodes();
        if (!cancelled) {
          setCodes(data.entries || []);
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load codes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    poll();
    const id = window.setInterval(() => {
      setNowMs(Date.now());
      poll();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createTotpEntry({
        label: form.label.trim(),
        issuer: form.issuer.trim(),
        secret: form.secret.trim()
      });
      setForm({ label: "", issuer: "", secret: "" });
      const data = await fetchTotpCodes();
      setCodes(data.entries || []);
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this authenticator entry? The secret will be deleted from JobTrack.")) return;
    setError("");
    try {
      await deleteTotpEntry(id);
      const data = await fetchTotpCodes();
      setCodes(data.entries || []);
    } catch (err) {
      setError(err.message || "Delete failed");
    }
  };

  const firstExp = codes[0]?.expiresAtMs;
  const period = codes[0]?.period || 30;
  const nowMs = Date.now();
  const remainingMs = firstExp ? Math.max(0, firstExp - nowMs) : 0;
  const progress = firstExp ? remainingMs / (period * 1000) : 0;

  return (
    <div className="authenticator-section">
      <div className="card accounts-warning authenticator-warning">
        <strong>TOTP secrets.</strong> Same idea as Google Authenticator: we store your base32 keys on the server and
        show rotating 6-digit codes. Only use this if you trust this deployment; prefer your phone for the most
        sensitive accounts.
      </div>

      <section className="card accounts-form-card">
        <h2 className="table-card-title">Add entry</h2>
        <p className="field-hint muted-text">
          Paste the <strong>secret key</strong> (base32) or the full <code>otpauth://totp/…</code> URL from the site when
          you set up 2FA. If you use a URL, we can fill label/issuer automatically.
        </p>
        <form className="accounts-form-grid" onSubmit={handleAdd}>
          <label className="form-field">
            <span>Issuer (optional)</span>
            <input
              value={form.issuer}
              onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))}
              placeholder="e.g. GitHub"
              maxLength={120}
            />
          </label>
          <label className="form-field">
            <span>Account label</span>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. work@company.com"
              maxLength={200}
            />
          </label>
          <label className="form-field form-field-span2">
            <span>Secret or otpauth URL</span>
            <textarea
              required
              value={form.secret}
              onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
              rows={3}
              className="accounts-textarea-mono"
              placeholder="otpauth://totp/… or paste base32 secret"
            />
          </label>
          <div className="accounts-form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </section>

      {error && <div className="card error">{error}</div>}

      {loading ? (
        <div className="card">Loading authenticator…</div>
      ) : (
        <section className="card authenticator-codes-card">
          <div className="authenticator-codes-head">
            <h2 className="table-card-title">Your codes</h2>
            {firstExp ? (
              <div className="authenticator-timer" aria-live="polite" data-pulse={pulse}>
                <span className="authenticator-timer-bar-wrap">
                  <span className="authenticator-timer-bar" style={{ width: `${progress * 100}%` }} />
                </span>
                <span className="authenticator-timer-text">{Math.ceil(remainingMs / 1000)}s</span>
              </div>
            ) : null}
          </div>

          {codes.length === 0 ? (
            <p className="table-empty">No entries yet. Add a secret above.</p>
          ) : (
            <ul className="authenticator-code-list">
              {codes.map((row) => (
                <li key={row.id} className="authenticator-code-row">
                  <div className="authenticator-code-meta">
                    {row.issuer ? <span className="authenticator-code-issuer">{row.issuer}</span> : null}
                    <span className="authenticator-code-label">{row.label}</span>
                  </div>
                  <div className="authenticator-code-digits">
                    <code className="authenticator-code-value">{row.code}</code>
                    <button type="button" className="small muted" onClick={() => copyText(row.code)}>
                      Copy
                    </button>
                    <button type="button" className="small danger" onClick={() => handleDelete(row.id)}>
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
