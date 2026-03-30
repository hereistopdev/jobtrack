import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="app-shell">
      <header className="app-nav">
        <NavLink to="/" className={({ isActive }) => `app-brand${isActive ? " active" : ""}`} end>
          JobTrack
        </NavLink>
        <nav className="app-nav-links" aria-label="Main">
          <NavLink to="/" className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`} end>
            Job links
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}>
            Analytics
          </NavLink>
          {isAdmin && (
            <>
              <NavLink to="/finance" className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}>
                Finance
              </NavLink>
              <NavLink to="/users" className={({ isActive }) => `app-nav-link${isActive ? " active" : ""}`}>
                Users
              </NavLink>
            </>
          )}
        </nav>
        <div className="app-nav-spacer" />
        <span className="app-nav-user" title={user?.email}>
          {user?.name ? `${user.name}` : user?.email}
          {isAdmin && <span className="app-nav-badge">admin</span>}
        </span>
        <button type="button" className="muted app-nav-logout" onClick={logout}>
          Sign out
        </button>
      </header>
      <Outlet />
    </div>
  );
}
