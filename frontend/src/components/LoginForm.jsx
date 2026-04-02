import { useState } from "react";
import { useAuth } from "../context/AuthContext";

function LoginForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMessage("");
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        const result = await register(email, password, name);
        if (result?.pending) {
          setSuccessMessage(
            result.message ||
              "Your account was created. An administrator must approve it before you can sign in."
          );
          setMode("login");
          setPassword("");
        }
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card auth-card" onSubmit={handleSubmit}>
      <h1>JobTrack</h1>
      <p className="auth-lead">
        {mode === "register"
          ? "Create an account with your work email. An administrator must approve new signups before you can use the app."
          : "Sign in with your work email to manage team jobs."}
      </p>

      <div className="auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => {
            setMode("login");
            setSuccessMessage("");
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => {
            setMode("register");
            setSuccessMessage("");
          }}
        >
          Create account
        </button>
      </div>

      {mode === "register" && (
        <label>
          Name
          <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
      )}

      <label>
        Email
        <input
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </label>

      <label>
        Password
        <input
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>

      {mode === "register" && (
        <p className="field-hint">Use at least 8 characters.</p>
      )}

      {successMessage && <div className="auth-success">{successMessage}</div>}
      {error && <div className="auth-error">{error}</div>}

      <button type="submit" disabled={busy} className="full-width-submit">
        {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}

export default LoginForm;
