import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  buildStatusByUserFromLinks,
  JOB_STATUSES,
  STATUS_COLORS,
  toStackedChartRows,
  totalStatusCounts,
  totalsFromStackedRows
} from "../utils/jobStatusDashboard";

/**
 * @param {{ links?: Array<unknown>, rows?: Array<Record<string, unknown>> }} props
 * — Pass `links` on the job board page, or `rows` from analytics `byUserStatus`.
 */
export default function JobBidStatusDashboard({ links, rows: rowsFromApi }) {
  const chartRows = useMemo(() => {
    if (rowsFromApi?.length) return toStackedChartRows(rowsFromApi);
    return toStackedChartRows(buildStatusByUserFromLinks(links || []));
  }, [links, rowsFromApi]);

  const totals = useMemo(() => {
    if (links?.length) return totalStatusCounts(links);
    return totalsFromStackedRows(chartRows);
  }, [links, chartRows]);

  const hasTeam = chartRows.length > 0;
  const totalJobs = links?.length
    ? links.length
    : JOB_STATUSES.reduce((s, k) => s + totals[k], 0);

  return (
    <div className="dashboard-job-bid-dash">
      <div className="analytics-kpis card">
        {JOB_STATUSES.map((s) => (
          <div key={s} className="analytics-kpi">
            <span className="analytics-kpi-value" style={{ color: STATUS_COLORS[s] }}>
              {totals[s]}
            </span>
            <span className="analytics-kpi-label">{s}</span>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <section className="card analytics-chart-card analytics-chart-wide">
          <h2 className="table-card-title">Bid status by teammate</h2>
          <p className="dashboard-bid-dash-hint muted-text">
            Stacked counts per person: Saved → Applied → Interview → Offer / Rejected. Based on each row&apos;s status.
            {totalJobs > 0 ? ` ${totalJobs} job${totalJobs === 1 ? "" : "s"} total.` : ""}
          </p>
          <div className="analytics-chart-wrap">
            {!hasTeam ? (
              <p className="analytics-empty">No teammate-owned jobs yet. Add a job to see this chart.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={chartRows}
                  layout="vertical"
                  margin={{ left: 8, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={118}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 14)}…` : v)}
                  />
                  <Tooltip
                    formatter={(value, name) => [value, name]}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.full || ""}
                  />
                  <Legend />
                  {JOB_STATUSES.map((s) => (
                    <Bar key={s} dataKey={s} stackId="bid" fill={STATUS_COLORS[s]} name={s} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
