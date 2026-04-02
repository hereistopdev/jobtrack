import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import JobBidStatusDashboard from "./JobBidStatusDashboard";
import { JOB_STATUSES, STATUS_COLORS } from "../utils/jobStatusDashboard";

const TIME_TABS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" }
];

function StackedPipelineChart({ data, title, hint }) {
  const hasData = data?.length > 0;
  return (
    <section className="card analytics-chart-card analytics-chart-wide">
      <h2 className="table-card-title">{title}</h2>
      {hint && <p className="dashboard-bid-dash-hint muted-text">{hint}</p>}
      <div className="pipeline-time-chart-wrap">
        <div className="pipeline-time-chart-inner">
          {!hasData ? (
            <p className="analytics-empty">No jobs in this range yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9 }}
                  angle={data.length > 14 ? -35 : 0}
                  textAnchor={data.length > 14 ? "end" : "middle"}
                  height={data.length > 14 ? 68 : 32}
                  interval={data.length > 20 ? Math.floor(data.length / 12) : 0}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value, name) => [value, name]} />
                <Legend />
                {JOB_STATUSES.map((s) => (
                  <Bar key={s} dataKey={s} stackId="pipe" fill={STATUS_COLORS[s]} name={s} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

export default function JobLinksPipelineSection({ links, series, timeTab, onTimeTabChange, timeseriesLoading }) {
  const chartData = useMemo(() => {
    if (!series) return null;
    if (timeTab === "daily") return series.daily;
    if (timeTab === "weekly") return series.weekly;
    return series.monthly;
  }, [series, timeTab]);

  const chartTitle = useMemo(() => {
    if (!series) return "";
    if (timeTab === "daily") return `Daily — last ${series.meta?.dailyDays ?? 30} days (UTC)`;
    if (timeTab === "weekly") return `Weekly — ISO weeks (last ~${series.meta?.weeklyWeeksMax ?? 26} weeks)`;
    return `Monthly — last ${series.meta?.monthlyMonths ?? 24} months`;
  }, [series, timeTab]);

  const chartHint =
    series?.meta &&
    "Counts are jobs added in each period (created time), stacked by current status.";

  return (
    <div className="joblinks-pipeline-section">
      <JobBidStatusDashboard links={links} />

      <div className="pipeline-time-inline-tabs" role="tablist" aria-label="Pipeline time range">
        {TIME_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`joblinks-pipeline-time-${t.id}`}
            aria-selected={timeTab === t.id}
            className={`pipeline-time-tab-btn${timeTab === t.id ? " is-active" : ""}`}
            onClick={() => onTimeTabChange(t.id)}
            disabled={timeseriesLoading && !series}
          >
            {t.label}
          </button>
        ))}
      </div>

      {timeseriesLoading && !series && (
        <p className="muted-text" style={{ margin: 0 }}>
          Loading daily / weekly / monthly charts…
        </p>
      )}

      {series && (
        <StackedPipelineChart data={chartData} title={chartTitle} hint={chartHint || undefined} />
      )}
    </div>
  );
}
