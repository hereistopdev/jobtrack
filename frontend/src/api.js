const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:5000/api");
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
