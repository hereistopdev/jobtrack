function resolveApiBase() {
  const v = import.meta.env.VITE_API_BASE_URL?.trim();
  if (v) return v.replace(/\/$/, "");
  if (import.meta.env.DEV) return "http://localhost:5000/api";
  throw new Error(
    "VITE_API_BASE_URL is missing. Vercel: Project → Settings → Environment Variables → add VITE_API_BASE_URL = https://YOUR-SERVICE.onrender.com/api (enable for Production and Preview), then Redeploy. Vite bakes this in at build time."
  );
}

const API_BASE_URL = resolveApiBase();
const TOKEN_KEY = "jobtrack_token";

function authHeaders(explicitToken) {
  const t = explicitToken ?? (typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null);
  if (!t) return {};
  return { Authorization: `Bearer ${t}` };
}

async function parseJsonError(res) {
  const data = await res.json().catch(() => ({}));
  return data.message || `Request failed (${res.status})`;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function register(email, password, name) {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name: name || "" })
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchMe(token) {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: { ...authHeaders(token) }
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchTeamDirectory() {
  const res = await fetch(`${API_BASE_URL}/users/directory`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

/** PATCH /auth/me — pass any of: name, jobProfiles, interviewProfiles (legacy label list). */
export async function patchMyProfile(body) {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/** POST multipart — PDF, DOCX, or TXT; extracted text fills resumeText. */
export async function uploadProfileResume(profileId, file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/auth/profile-files/${encodeURIComponent(profileId)}/resume`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Upload failed (${res.status})`);
  return data;
}

/** One or more images/PDFs; field name `files` */
export async function uploadProfileIdDocuments(profileId, files, kind) {
  const list = Array.isArray(files) ? files : [files];
  if (!list.length) throw new Error("No files selected");
  const fd = new FormData();
  for (const f of list) {
    fd.append("files", f);
  }
  fd.append("kind", kind);
  const res = await fetch(`${API_BASE_URL}/auth/profile-files/${encodeURIComponent(profileId)}/id-documents`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Upload failed (${res.status})`);
  return data;
}

export async function uploadProfileIdDocument(profileId, file, kind) {
  return uploadProfileIdDocuments(profileId, [file], kind);
}

/** One or more images/PDFs; field name `files` */
export async function uploadProfileOtherDocuments(profileId, files, category, label) {
  const list = Array.isArray(files) ? files : [files];
  if (!list.length) throw new Error("No files selected");
  const fd = new FormData();
  for (const f of list) {
    fd.append("files", f);
  }
  fd.append("category", category);
  fd.append("label", label || "");
  const res = await fetch(`${API_BASE_URL}/auth/profile-files/${encodeURIComponent(profileId)}/other-documents`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Upload failed (${res.status})`);
  return data;
}

export async function uploadProfileOtherDocument(profileId, file, category, label) {
  return uploadProfileOtherDocuments(profileId, [file], category, label);
}

/** GET /auth/job-profile-stats/:profileId — interviews + job board counts for this profile */
export async function fetchJobProfileStats(profileId) {
  const res = await fetch(`${API_BASE_URL}/auth/job-profile-stats/${encodeURIComponent(profileId)}`, {
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteProfileResumeFile(profileId) {
  const res = await fetch(`${API_BASE_URL}/auth/profile-files/${encodeURIComponent(profileId)}/resume`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteProfileIdDocument(profileId, docId) {
  const res = await fetch(
    `${API_BASE_URL}/auth/profile-files/${encodeURIComponent(profileId)}/id-documents/${encodeURIComponent(docId)}`,
    { method: "DELETE", headers: { ...authHeaders() } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteProfileOtherDocument(profileId, docId) {
  const res = await fetch(
    `${API_BASE_URL}/auth/profile-files/${encodeURIComponent(profileId)}/other-documents/${encodeURIComponent(docId)}`,
    { method: "DELETE", headers: { ...authHeaders() } }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/** Authenticated download (opens save). */
export async function fetchProfileFileBlob(profileId, { type, docId }) {
  const q = new URLSearchParams({ type });
  if (docId) q.set("docId", docId);
  const res = await fetch(
    `${API_BASE_URL}/auth/profile-files/${encodeURIComponent(profileId)}/files?${q}`,
    { headers: { ...authHeaders() } }
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Download failed (${res.status})`);
  }
  return res.blob();
}

export function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @deprecated Prefer managing job profiles on Profile; kept for minimal label-only updates. */
export async function patchMyInterviewProfiles(interviewProfiles) {
  return patchMyProfile({ interviewProfiles });
}

export async function changeMyPassword(currentPassword, newPassword) {
  const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export const parseJobLinkFromUrl = async (url) => {
  const res = await fetch(`${API_BASE_URL}/job-links/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
};

export const fetchJobLinks = async () => {
  const res = await fetch(`${API_BASE_URL}/job-links`, {
    headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
};

export const importJobLinksExcel = async (file) => {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/job-links/import`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Import failed (${res.status})`);
  }
  return data;
};

export const createJobLink = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/job-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 409) err.duplicatePayload = data;
    throw err;
  }
  return data;
};

export const updateJobLink = async (id, payload) => {
  const res = await fetch(`${API_BASE_URL}/job-links/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 409) err.duplicatePayload = data;
    throw err;
  }
  return data;
};

export const deleteJobLink = async (id) => {
  const res = await fetch(`${API_BASE_URL}/job-links/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
};

export async function fetchAnalyticsSummary() {
  const res = await fetch(`${API_BASE_URL}/analytics/summary`, {
    headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchPipelineTimeseries() {
  const res = await fetch(`${API_BASE_URL}/analytics/pipeline-timeseries`, {
    headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchAdminUsers() {
  const res = await fetch(`${API_BASE_URL}/admin/users`, {
    headers: { ...authHeaders() }
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function addJobInterview(jobId, body) {
  const res = await fetch(`${API_BASE_URL}/job-links/${jobId}/interviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function removeJobInterview(jobId, interviewId) {
  const res = await fetch(`${API_BASE_URL}/job-links/${jobId}/interviews/${interviewId}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function updateAdminUser(id, body) {
  const res = await fetch(`${API_BASE_URL}/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteAdminUser(id) {
  const res = await fetch(`${API_BASE_URL}/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function adminBulkDeleteJobLinks(payload) {
  const res = await fetch(`${API_BASE_URL}/admin/job-links/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function fetchFinanceSummary(options = {}) {
  const q = new URLSearchParams();
  if (options.owner != null && String(options.owner).trim() !== "") {
    q.set("owner", String(options.owner).trim());
  }
  if (options.includeServiceIncomeRefs === false) {
    q.set("includeServiceIncomeRefs", "0");
  }
  const suffix = q.toString() ? `?${q.toString()}` : "";
  const res = await fetch(`${API_BASE_URL}/finance/summary${suffix}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchFinanceTransactions() {
  const res = await fetch(`${API_BASE_URL}/finance/transactions`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function createFinanceTransaction(body) {
  const res = await fetch(`${API_BASE_URL}/finance/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function updateFinanceTransaction(id, body) {
  const res = await fetch(`${API_BASE_URL}/finance/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteFinanceTransaction(id) {
  const res = await fetch(`${API_BASE_URL}/finance/transactions/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/** Admin only: delete many ledger rows by id. */
export async function bulkDeleteFinanceTransactions(ids) {
  const res = await fetch(`${API_BASE_URL}/finance/transactions/bulk-delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ids })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function importFinanceExcel(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/finance/import`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Import failed (${res.status})`);
  return data;
}

export async function fetchInterviewSummary() {
  const res = await fetch(`${API_BASE_URL}/interviews/summary`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchInterviewRecords() {
  const res = await fetch(`${API_BASE_URL}/interviews`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchInterviewCalendar(fromIso, toIso) {
  const q = new URLSearchParams({ from: fromIso, to: toIso });
  const res = await fetch(`${API_BASE_URL}/interviews/calendar?${q}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchInterviewFeedLinks() {
  const res = await fetch(`${API_BASE_URL}/interviews/feeds`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function rotateInterviewCombinedFeedToken() {
  const res = await fetch(`${API_BASE_URL}/interviews/feeds/combined-token`, {
    method: "POST",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

/** @param {{ view?: "all" }} opts */
export async function fetchCalendarSources(opts = {}) {
  const q = opts.view === "all" ? "?view=all" : "";
  const res = await fetch(`${API_BASE_URL}/calendar-sources${q}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function createCalendarSource(body) {
  const res = await fetch(`${API_BASE_URL}/calendar-sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteCalendarSource(id) {
  const res = await fetch(`${API_BASE_URL}/calendar-sources/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function syncCalendarSource(id) {
  const res = await fetch(`${API_BASE_URL}/calendar-sources/${id}/sync`, {
    method: "POST",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Sync failed (${res.status})`);
  return data;
}

export async function syncAllCalendarSources() {
  const res = await fetch(`${API_BASE_URL}/calendar-sources/sync-all`, {
    method: "POST",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Sync all failed (${res.status})`);
  return data;
}

export async function checkInterviewConflicts(body) {
  const res = await fetch(`${API_BASE_URL}/interviews/conflicts-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function createInterviewRecord(body) {
  const res = await fetch(`${API_BASE_URL}/interviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 409 && Array.isArray(data.conflicts)) err.conflicts = data.conflicts;
    throw err;
  }
  return data;
}

export async function updateInterviewRecord(id, body) {
  const res = await fetch(`${API_BASE_URL}/interviews/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    if (res.status === 409 && Array.isArray(data.conflicts)) err.conflicts = data.conflicts;
    throw err;
  }
  return data;
}

export async function deleteInterviewRecord(id) {
  const res = await fetch(`${API_BASE_URL}/interviews/${id}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function importInterviewExcel(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE_URL}/interviews/import`, {
    method: "POST",
    headers: { ...authHeaders() },
    body: fd
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Import failed (${res.status})`);
  return data;
}

/** @param {{ view?: "all" }} opts */
export async function fetchTeamAccounts(opts = {}) {
  const q = opts.view === "all" ? "?view=all" : "";
  const res = await fetch(`${API_BASE_URL}/team-accounts${q}`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function createTeamAccount(body) {
  const res = await fetch(`${API_BASE_URL}/team-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function updateTeamAccount(id, body) {
  const res = await fetch(`${API_BASE_URL}/team-accounts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteTeamAccount(id) {
  const res = await fetch(`${API_BASE_URL}/team-accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function fetchTotpEntries() {
  const res = await fetch(`${API_BASE_URL}/totp-entries`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function fetchTotpCodes() {
  const res = await fetch(`${API_BASE_URL}/totp-entries/codes`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function createTotpEntry(body) {
  const res = await fetch(`${API_BASE_URL}/totp-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}

export async function deleteTotpEntry(id) {
  const res = await fetch(`${API_BASE_URL}/totp-entries/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { ...authHeaders() }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
  return data;
}
