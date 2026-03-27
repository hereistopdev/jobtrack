const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const fetchJobLinks = async () => {
  const res = await fetch(`${API_BASE_URL}/job-links`);
  if (!res.ok) throw new Error("Failed to fetch job links");
  return res.json();
};

export const createJobLink = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/job-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Failed to create job link");
  return res.json();
};

export const updateJobLink = async (id, payload) => {
  const res = await fetch(`${API_BASE_URL}/job-links/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Failed to update job link");
  return res.json();
};

export const deleteJobLink = async (id) => {
  const res = await fetch(`${API_BASE_URL}/job-links/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete job link");
  return res.json();
};
