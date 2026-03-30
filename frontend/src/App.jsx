import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AppLayout from "./components/AppLayout";
import LoginForm from "./components/LoginForm";
import DashboardPage from "./pages/DashboardPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import UsersPage from "./pages/UsersPage";
import FinancePage from "./pages/FinancePage";

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
        <Route path="/" element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route
          path="/users"
          element={user.role === "admin" ? <UsersPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/finance"
          element={
            user.role === "admin" || user.financeAccess ? <FinancePage /> : <Navigate to="/" replace />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
