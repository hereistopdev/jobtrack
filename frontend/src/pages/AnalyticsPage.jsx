import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { fetchAnalyticsSummary } from "../api";
import { exportAnalyticsToXlsx } from "../utils/exportXlsx";

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2", "#db2777", "#4f46e5"];

function monthLabel(ym) {
  if (!ym || ym.length < 7) return ym;
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchAnalyticsSummary()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const byUserChart = (data?.byUser || []).map((u) => ({
    name: u.name ? `${u.name}` : u.email,
    full: u.name ? `${u.name} (${u.email})` : u.email,
    count: u.count
  }));

  const byMonthChart = (data?.byMonth || []).map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    count: m.count
  }));

  const statusData = (data?.statusBreakdown || []).map((s) => ({
    name: s.status || "Unknown",
    value: s.count
  }));

  return (
    <main className="container container-dashboard analytics-page">
      <header className="page-header page-header-row">
        <div>
          <h1>Analytics</h1>
          <p>Who added job links over time, and status mix.</p>
        </div>
        {data && !loading && (
          <button
            type="button"
            className="small muted table-export-btn"
            disabled={
              !(data.byUser?.length || data.byMonth?.length || data.statusBreakdown?.length)
            }
            onClick={() => exportAnalyticsToXlsx(data, "analytics")}
          >
            Export XLSX
          </button>
        )}
      </header>

      {loading && <div className="card">Loading analytics…</div>}
      {error && <div className="card error">{error}</div>}

      {data && !loading && (
        <>
          <div className="analytics-kpis card">
            <div className="analytics-kpi">
              <span className="analytics-kpi-value">{data.totalLinks}</span>
              <span className="analytics-kpi-label">Job links</span>
            </div>
            <div className="analytics-kpi">
              <span className="analytics-kpi-value">{data.userCount}</span>
              <span className="analytics-kpi-label">Users</span>
            </div>
          </div>

          <div className="analytics-grid">
            <section className="card analytics-chart-card">
              <h2 className="table-card-title">Links added by teammate</h2>
              <div className="analytics-chart-wrap">
                {byUserChart.length === 0 ? (
                  <p className="analytics-empty">No per-user data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={byUserChart} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => (v.length > 18 ? `${v.slice(0, 16)}…` : v)}
                      />
                      <Tooltip
                        formatter={(value) => [value, "Links"]}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""}
                      />
                      <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} name="Links added" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="card analytics-chart-card">
              <h2 className="table-card-title">New links by month (created)</h2>
              <div className="analytics-chart-wrap">
                {byMonthChart.length === 0 ? (
                  <p className="analytics-empty">No timeline data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={byMonthChart} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(value) => [value, "Links"]} />
                      <Line type="monotone" dataKey="count" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} name="Added" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            <section className="card analytics-chart-card analytics-chart-wide">
              <h2 className="table-card-title">Status breakdown</h2>
              <div className="analytics-chart-wrap analytics-pie-wrap">
                {statusData.length === 0 ? (
                  <p className="analytics-empty">No status data.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {statusData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value, "Links"]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
