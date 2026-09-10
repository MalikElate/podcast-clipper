import { getAuthToken } from "./AuthContext.jsx";

async function authHeaders() {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function createJob({ youtubeUrl, numClips, clipLengthSec, subtitleColor, cropMode }) {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ youtubeUrl, numClips, clipLengthSec, subtitleColor, cropMode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to create job");
  return data.jobId;
}

export async function getJob(jobId) {
  const res = await fetch(`/api/jobs/${jobId}`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch job");
  return data;
}

export async function listJobs() {
  const res = await fetch("/api/jobs", { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to fetch job history");
  return data.jobs;
}
