/**
 * Fetch a job posting URL and infer company + role from HTML meta tags and URL shape.
 * Many ATS pages block bots; URL heuristics still help for Greenhouse, Lever, Ashby, etc.
 */

const FETCH_TIMEOUT_MS = 12_000;

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html, key, attr = "property") {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${esc}["'][^>]+content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${esc}["']`, "i")
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

function titleTag(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1] ? decodeHtmlEntities(m[1].trim()) : null;
}

function capitalizeWords(s) {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function companyFromUrl(urlString) {
  try {
    const u = new URL(urlString);
    const host = u.hostname.toLowerCase();
    const parts = u.pathname.split("/").filter(Boolean);

    // job-boards.greenhouse.io/{company}/jobs/...
    if (host.includes("greenhouse.io") && parts[0] !== "embed") {
      const j = parts.indexOf("jobs");
      if (j > 0) return capitalizeWords(parts[j - 1]);
    }

    // boards.greenhouse.io/embed/job_app?for=slug
    if (host.includes("greenhouse.io") && parts[0] === "embed") {
      const forParam = u.searchParams.get("for");
      if (forParam) return capitalizeWords(forParam);
    }

    // jobs.lever.co/{company}/...
    if (host.includes("lever.co") && parts.length) {
      return capitalizeWords(parts[0]);
    }

    // jobs.ashbyhq.com/{CompanySlug}/...
    if (host.includes("ashbyhq.com") && parts.length) {
      return capitalizeWords(parts[0]);
    }

    // ats.rippling.com/.../chess/jobs/... -> segment before "jobs" sometimes org name
    if (host.includes("rippling.com")) {
      const j = parts.indexOf("jobs");
      if (j > 0) return capitalizeWords(parts[j - 1]);
    }

    // apply.workable.com/{company}/...
    if (host.includes("workable.com") && parts[0] === "api" && parts[2]) {
      return capitalizeWords(parts[2]);
    }
    if (host.includes("workable.com") && parts[0] && parts[0] !== "jobs") {
      return capitalizeWords(parts[0]);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Split a combined title into role + company when separators are common on job boards.
 */
function splitRoleAndCompany(rawTitle, siteName) {
  if (!rawTitle) return { title: null, company: null };

  const at = rawTitle.match(/^(.+?)\s+at\s+(.+)$/i);
  if (at) {
    return { title: at[1].trim(), company: at[2].trim() };
  }

  for (const sep of [" | ", " – ", " — ", " - "]) {
    const idx = rawTitle.indexOf(sep);
    if (idx > 0) {
      const a = rawTitle.slice(0, idx).trim();
      const b = rawTitle.slice(idx + sep.length).trim();
      if (a && b) {
        const lower = rawTitle.toLowerCase();
        if (lower.includes("career") || lower.includes("job")) {
          continue;
        }
        const jobWords = /engineer|developer|manager|designer|scientist|analyst|architect/i;
        if (jobWords.test(a)) return { title: a, company: b };
        if (jobWords.test(b)) return { title: b, company: a };
        return { title: a, company: b };
      }
    }
  }

  if (siteName && rawTitle.length > siteName.length) {
    if (rawTitle.toLowerCase().includes(siteName.toLowerCase())) {
      return { title: rawTitle.replace(new RegExp(siteName, "i"), "").replace(/^[\s|–\-—]+/, "").trim() || rawTitle, company: siteName };
    }
  }

  return { title: rawTitle, company: null };
}

export async function parseJobUrl(urlString) {
  const date = todayISODate();
  let link = urlString.trim();

  let parsed;
  try {
    parsed = new URL(link);
  } catch {
    return { company: "", title: "", description: "", link, date, source: "invalid-url" };
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    return { company: "", title: "", description: "", link, date, source: "invalid-url" };
  }

  const urlCompany = companyFromUrl(link);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html = "";
  try {
    const res = await fetch(link, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml"
      }
    });
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html") || ct.includes("application/xhtml")) {
        html = await res.text();
      }
    }
  } catch {
    // blocked, timeout, or non-HTML
  } finally {
    clearTimeout(timer);
  }

  const ogSite = metaContent(html, "og:site_name");
  const ogTitle = metaContent(html, "og:title") || metaContent(html, "twitter:title", "name");
  const appName = metaContent(html, "application-name", "name");
  const docTitle = titleTag(html);

  const combined = ogTitle || docTitle || "";
  const siteName = ogSite || appName || "";

  let company = siteName || "";
  let title = "";

  if (combined) {
    const split = splitRoleAndCompany(combined, siteName);
    title = split.title || combined;
    company = split.company || siteName || urlCompany || "";
    if (!split.company && urlCompany && !company) company = urlCompany;
  } else {
    title = docTitle || "";
    company = urlCompany || siteName || "";
  }

  if (!company && urlCompany) company = urlCompany;
  if (!title && docTitle) title = docTitle;

  const ogDesc = metaContent(html, "og:description");
  const twDesc = metaContent(html, "twitter:description", "name");
  const metaDesc = metaContent(html, "description", "name");
  const rawDesc = (ogDesc || twDesc || metaDesc || "").trim();
  const description = rawDesc.slice(0, 4000);

  return {
    company: company || "",
    title: title || "",
    description,
    link,
    date,
    source: html ? "fetch+meta" : "url-only"
  };
}
