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

/** Replace saved interview profile labels for the current user (used for datalist suggestions). */
export async function fetchTeamDirectory() {
  const res = await fetch(`${API_BASE_URL}/users/directory`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return res.json();
}

export async function patchMyInterviewProfiles(interviewProfiles) {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ interviewProfiles })
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
