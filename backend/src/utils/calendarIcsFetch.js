const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20000;

function normalizeIcsUrl(raw) {
  const input = String(raw || "").trim();
  if (!input) return "";
  // Many providers show webcal:// for subscriptions; fetch needs https://
  if (/^webcal:\/\//i.test(input)) {
    return `https://${input.replace(/^webcal:\/\//i, "")}`;
  }
  return input;
}

export function assertSafeIcsUrl(urlStr) {
  let u;
  try {
    u = new URL(normalizeIcsUrl(urlStr));
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("URL must use http or https");
  }
  const host = u.hostname.toLowerCase();
  if (process.env.NODE_ENV === "production") {
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local")) {
      throw new Error("That host is not allowed for calendar URLs in production");
    }
  }
  // Common mistake: Google calendar web UI link instead of ICS feed URL.
  if (
    host.includes("calendar.google.com") &&
    !/\/calendar\/ical\//i.test(u.pathname) &&
    !/\.ics(\?|$)/i.test(u.pathname)
  ) {
    throw new Error(
      "Google link is not an ICS feed. Use Settings -> your calendar -> Secret address in iCal format."
    );
  }
  return u.toString();
}

export async function fetchIcsText(urlStr) {
  const url = assertSafeIcsUrl(urlStr);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "JobTrack-CalendarSync/1.0", Accept: "text/calendar,*/*" }
    });
    if (!res.ok) throw new Error(`Calendar HTTP ${res.status}`);
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (
      contentType &&
      !contentType.includes("text/calendar") &&
      !contentType.includes("application/ics") &&
      !contentType.includes("application/octet-stream") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error(`Calendar URL did not return an ICS file (content-type: ${contentType})`);
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("Calendar file too large");
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } finally {
    clearTimeout(t);
  }
}
