import { auth } from "../firebase.js";
export const localPreview = import.meta.env.DEV && import.meta.env.VITE_BRIDGE_LOCAL_PREVIEW === "true";
export class BridgeApi {
  async headers(json = true) {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(localPreview ? { "X-Bridge-Preview": "1" } : {}) };
  }
  async request(path, { method = "GET", body, signal } = {}) {
    const form = body instanceof FormData;
    const res = await fetch(`/api/bridge${path}`, { method, headers: await this.headers(!form), body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || `Request failed (${res.status}).`);
      Object.assign(error, { code: data.code, details: data.details, status: res.status });
      throw error;
    }
    return data;
  }
  projectPath(projectId, path = "") { return `/projects/${encodeURIComponent(projectId)}${path}`; }
  getProjects(signal) { return this.request("/projects", { signal }); }
  ensureDefaultProject(body, signal) { return this.request("/projects/default", { method: "POST", body, signal }); }
  createProject(body) { return this.request("/projects", { method: "POST", body }); }
  updateProject(id, body) { return this.request(this.projectPath(id), { method: "PATCH", body }); }
  project(id, path, options) { return this.request(this.projectPath(id, path), options); }
  affiliate(signal) { return this.request("/affiliate", { signal }); }
  enrollAffiliate(body) { return this.request("/affiliate", { method: "POST", body }); }
  trackAffiliate(code) { return this.request("/affiliate/track", { method: "POST", body: { code } }); }
  claimAffiliate(body) { return this.request("/affiliate/claim", { method: "POST", body }); }
  async download(projectId, path, filename) {
    let ids;
    if (path.startsWith("/clips/")) {
      const { job } = await this.project(projectId, path.replace(/\/download$/, ""));
      ids = job.clips.filter(clip => !clip.unavailable).map(clip => clip.mediaId);
    } else ids = new URLSearchParams(path.split("?")[1]).get("ids")?.split(",") || [];
    const { url } = await this.project(projectId, "/downloads", { method: "POST", body: { ids } });
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }
}
export const api = new BridgeApi();
