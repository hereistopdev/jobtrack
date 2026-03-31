const DEFAULT_MS = 60 * 60 * 1000;

export function effectiveEndMs(row) {
  if (row.scheduledEndAt) {
    const t = new Date(row.scheduledEndAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return new Date(row.scheduledAt).getTime() + DEFAULT_MS;
}

export function rangesOverlap(a, b) {
  const s1 = new Date(a.scheduledAt).getTime();
  const e1 = effectiveEndMs(a);
  const s2 = new Date(b.scheduledAt).getTime();
  const e2 = effectiveEndMs(b);
  return s1 < e2 && s2 < e1;
}

export function startOfWeekMonday(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
