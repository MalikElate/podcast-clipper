import { getAuthToken } from "../authToken.js";
import { normalizePlatformCollections } from "./platforms.js";
export const localPreview = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_BRIDGE_LOCAL_PREVIEW === "true");
const sessionError = () => Object.assign(new Error("Your Meadow session has expired. Please sign in again to continue."), { code: "authentication_required", status: 401 });
export class BridgeApi {
  constructor({ getToken = getAuthToken, fetcher = (...args) => fetch(...args), preview = localPreview } = {}) {
    Object.assign(this, { getToken, fetcher, preview });
  }
  async headers(json = true, refresh = false) {
    let token = this.preview ? null : await this.getToken({ skipCache: refresh });
    if (!this.preview && !token && !refresh) token = await this.getToken({ skipCache: true });
    if (!this.preview && !token) throw sessionError();
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(this.preview ? { "X-Bridge-Preview": "1" } : {}) };
  }
  async request(path, { method = "GET", body, signal } = {}) {
    const form = body instanceof FormData;
    const send = async refresh => {
      signal?.throwIfAborted();
      const headers = await this.headers(!form, refresh);
      signal?.throwIfAborted();
      const res = await this.fetcher(`/api/bridge${path}`, { method, headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal });
      return { res, data: await res.json().catch(() => ({})) };
    };
    let { res, data } = await send(form);
    // This code is emitted only by Meadow's authentication gate, before an
    // upload or other write runs. Reusing FormData creates a fresh request body.
    if (!this.preview && res.status === 401 && data.code === "authentication_required") {
      ({ res, data } = await send(true));
    }
    if (!res.ok) {
      if (res.status === 401 && data.code === "authentication_required") throw sessionError();
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
