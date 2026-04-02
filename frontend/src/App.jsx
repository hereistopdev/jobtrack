import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppLayout from "./components/AppLayout";
import LoginForm from "./components/LoginForm";
import DashboardPage from "./pages/DashboardPage";
import UsersPage from "./pages/UsersPage";
import FinancePage from "./pages/FinancePage";
import InterviewsPage from "./pages/InterviewsPage";
import InterviewCalendarPage from "./pages/InterviewCalendarPage";
import AccountsPage from "./pages/AccountsPage";
import ProfilePage from "./pages/ProfilePage";
import JobProfilesPage from "./pages/JobProfilesPage";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container auth-loading">
        <div className="card">Loading session…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container auth-wrap">
        <LoginForm />
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/jobs" element={<DashboardPage />} />
        <Route path="/" element={<Navigate to="/jobs" replace />} />
        <Route path="/analytics" element={<Navigate to="/jobs?tab=dashboard" replace />} />
        <Route path="/jobs/dashboard" element={<Navigate to="/jobs?tab=dashboard" replace />} />
        <Route path="/pipeline" element={<Navigate to="/jobs" replace />} />
        <Route path="/interviews" element={<InterviewsPage />} />
        <Route path="/interviews/calendar" element={<InterviewCalendarPage />} />
        <Route path="/accounts" element={<AccountsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/job-profiles" element={<JobProfilesPage />} />
        <Route
          path="/users"
          element={user.role === "admin" ? <UsersPage /> : <Navigate to="/jobs" replace />}
        />
        <Route
          path="/finance"
          element={
            user.role === "admin" || user.financeAccess ? <FinancePage /> : <Navigate to="/jobs" replace />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/jobs" replace />} />
    </Routes>
  );
}

export default App;
