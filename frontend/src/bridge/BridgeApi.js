import { getAuthToken } from "../AuthContext.jsx";
import { normalizePlatformCollections } from "./platforms.js";
export const localPreview = import.meta.env.DEV && import.meta.env.VITE_BRIDGE_LOCAL_PREVIEW === "true";
export class BridgeApi {
  async headers(json = true) {
    const token = localPreview ? null : await getAuthToken();
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
    return normalizePlatformCollections(data);
  }
  projectPath(projectId, path = "") { return `/projects/${encodeURIComponent(projectId)}${path}`; }
  getProjects(signal) { return this.request("/projects", { signal }); }
  getBilling(signal) { return this.request("/billing", { signal }); }
  createCheckout(planId, cycle) { return this.request("/billing/checkout", { method: "POST", body: { planId, cycle } }); }
  createBillingPortal() { return this.request("/billing/portal", { method: "POST", body: {} }); }
  ensureDefaultProject(body, signal) { return this.request("/projects/default", { method: "POST", body, signal }); }
  updateProject(id, body) { return this.request(this.projectPath(id), { method: "PATCH", body }); }
  project(id, path, options) { return this.request(this.projectPath(id, path), options); }
}
export const api = new BridgeApi();
