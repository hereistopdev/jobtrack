/** Local calendar YYYY-MM-DD (for &lt;input type="date"&gt;). */
export function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today and the previous 6 days (7 calendar days inclusive). */
export function defaultLast7DayRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { dateFrom: localYmd(start), dateTo: localYmd(end) };
}
