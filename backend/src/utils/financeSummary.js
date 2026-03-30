export function startOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 59, 999);
}

export function localYmd(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekKeyLocal(d) {
  const x = startOfLocalDay(d);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  const monday = new Date(x);
  monday.setDate(monday.getDate() - diff);
  return localYmd(monday);
}

export function monthKeyLocal(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
}

function netOf(t) {
  return (Number(t.deposit) || 0) - (Number(t.withdraw) || 0);
}

/** Owner name (trimmed, lowercased): only rows with a non-empty ref count toward dashboard totals. */
const DUSTIN_LEE_REF_ONLY_OWNER = "dustin lee";

const SERVICE_INCOME_REF_PHRASES = new Set([
  "service",
  "income",
  "service income",
  "service earnings",
  "service & income",
  "services",
  "svc"
]);

function normalizeRefForMatch(ref) {
  return String(ref ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** True when ref looks like a Service / Income category (used when "include service & income" is off). */
export function isServiceOrIncomeRef(ref) {
  const r = normalizeRefForMatch(ref);
  if (!r) return false;
  if (SERVICE_INCOME_REF_PHRASES.has(r)) return true;
  const head = r.split(/\s*[,;/|]\s*/)[0].trim();
  if (SERVICE_INCOME_REF_PHRASES.has(head)) return true;
  return false;
}

/**
 * Row included in Finance dashboard aggregates (summary, charts, by-owner on dashboard).
 * - Dustin Lee: only rows with non-empty ref.
 * - When includeServiceIncomeRefs is false: exclude ref values classified as service/income.
 */
export function passesDashboardAggregationFilters(t, options = {}) {
  const { includeServiceIncomeRefs = true } = options;
  const ownerNorm = (t.owner || "").trim().toLowerCase();
  const refVal = (t.ref || "").trim();

  if (ownerNorm === DUSTIN_LEE_REF_ONLY_OWNER && refVal === "") {
    return false;
  }
  if (!includeServiceIncomeRefs && isServiceOrIncomeRef(t.ref)) {
    return false;
  }
  return true;
}

export function filterTransactionsForDashboard(transactions, options) {
  return transactions.filter((t) => passesDashboardAggregationFilters(t, options));
}

export function attachRunningBalances(transactions) {
  const sorted = [...transactions].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    if (ta !== tb) return ta - tb;
    return String(a._id).localeCompare(String(b._id));
  });
  let bal = 0;
  return sorted.map((t) => {
    const plain = typeof t.toObject === "function" ? t.toObject() : { ...t };
    bal += netOf(plain);
    return { ...plain, runningBalance: Math.round(bal * 100) / 100 };
  });
}

export function rollupRange(transactions, start, end) {
  const s = start.getTime();
  const e = end.getTime();
  let deposits = 0;
  let withdrawals = 0;
  let count = 0;
  for (const t of transactions) {
    const dt = new Date(t.date).getTime();
    if (dt < s || dt > e) continue;
    count += 1;
    deposits += Number(t.deposit) || 0;
    withdrawals += Number(t.withdraw) || 0;
  }
  const net = deposits - withdrawals;
  return {
    deposits: Math.round(deposits * 100) / 100,
    withdrawals: Math.round(withdrawals * 100) / 100,
    net: Math.round(net * 100) / 100,
    transactionCount: count
  };
}

export function buildSummary(transactions, now = new Date()) {
  const today = startOfLocalDay(now);
  const last7Start = new Date(today);
  last7Start.setDate(last7Start.getDate() - 6);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = endOfLocalDay(
    new Date(today.getFullYear(), today.getMonth() + 1, 0)
  );

  const last7 = rollupRange(transactions, startOfLocalDay(last7Start), endOfLocalDay(today));
  const thisMonth = rollupRange(transactions, monthStart, monthEnd);
  const allTime = rollupRange(
    transactions,
    new Date(0),
    new Date(8640000000000000)
  );

  const byWeek = new Map();
  const byMonth = new Map();
  for (const t of transactions) {
    const wk = weekKeyLocal(t.date);
    const mk = monthKeyLocal(t.date);
    const n = netOf(t);
    const dep = Number(t.deposit) || 0;
    const w = Number(t.withdraw) || 0;
    if (!byWeek.has(wk)) byWeek.set(wk, { deposits: 0, withdrawals: 0, net: 0, count: 0 });
    const bw = byWeek.get(wk);
    bw.deposits += dep;
    bw.withdrawals += w;
    bw.net += n;
    bw.count += 1;
    if (!byMonth.has(mk)) byMonth.set(mk, { deposits: 0, withdrawals: 0, net: 0, count: 0 });
    const bm = byMonth.get(mk);
    bm.deposits += dep;
    bm.withdrawals += w;
    bm.net += n;
    bm.count += 1;
  }

  const roundBucket = (b) => ({
    deposits: Math.round(b.deposits * 100) / 100,
    withdrawals: Math.round(b.withdrawals * 100) / 100,
    net: Math.round(b.net * 100) / 100,
    count: b.count
  });

  const weeklySeries = [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ period: key, label: key, ...roundBucket(v) }));

  const monthlySeries = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => ({ period: key, label: key, ...roundBucket(v) }));

  return {
    windows: {
      last7Days: last7,
      thisMonth,
      allTime
    },
    weeklySeries,
    monthlySeries
  };
}

/** All-time totals per Owner (full ledger; not affected by report filter). */
export function buildByOwnerSummary(transactions) {
  const m = new Map();
  for (const t of transactions) {
    const key = (t.owner || "").trim() || "(no owner)";
    if (!m.has(key)) m.set(key, { deposits: 0, withdrawals: 0, net: 0, count: 0 });
    const b = m.get(key);
    const dep = Number(t.deposit) || 0;
    const w = Number(t.withdraw) || 0;
    b.deposits += dep;
    b.withdrawals += w;
    b.net += netOf(t);
    b.count += 1;
  }
  const roundBucket = (v) => ({
    deposits: Math.round(v.deposits * 100) / 100,
    withdrawals: Math.round(v.withdrawals * 100) / 100,
    net: Math.round(v.net * 100) / 100,
    transactionCount: v.count
  });
  return [...m.entries()]
    .map(([owner, v]) => ({ owner, ...roundBucket(v) }))
    .sort((a, b) => a.owner.localeCompare(b.owner));
}

export function filterTransactionsByOwner(transactions, ownerParam) {
  const p = String(ownerParam || "").trim();
  if (!p) return transactions;
  return transactions.filter((t) => {
    const o = (t.owner || "").trim();
    if (p === "(no owner)") return o === "";
    return o.toLowerCase() === p.toLowerCase();
  });
}
