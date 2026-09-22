import { getAuthToken } from "../authToken.js";
import { normalizePlatformCollections } from "./platforms.js";
import { uploadWithProgress } from "./uploadTransport.js";
import { captureRequestSuccess } from "../productAnalytics.js";
export const localPreview = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_BRIDGE_LOCAL_PREVIEW === "true");
const sessionError = () => Object.assign(new Error("Your Meadow sign-in could not be verified. Please sign in again to continue."), { code: "authentication_required", status: 401 });
export class BridgeApi {
  constructor({ getToken = getAuthToken, fetcher = (...args) => fetch(...args), uploader = uploadWithProgress, preview = localPreview, track = captureRequestSuccess } = {}) {
    Object.assign(this, { getToken, fetcher, uploader, preview, track });
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
    // Refresh small requests rejected by the authentication gate. File bodies
    // are never replayed; uploads use a grant obtained before the transfer.
    if (!form && !this.preview && res.status === 401 && data.code === "authentication_required") {
      ({ res, data } = await send(true));
    }
    if (!res.ok) {
      if (res.status === 401 && data.code === "authentication_required") throw sessionError();
      const error = new Error(data.error || `Request failed (${res.status}).`);
      Object.assign(error, { code: data.code, details: data.details, status: res.status });
      throw error;
    }
    if (!this.preview) { try { this.track(path, method); } catch { /* Tracking cannot fail a successful request. */ } }
    return normalizePlatformCollections(data);
  }
  projectPath(projectId, path = "") { return `/projects/${encodeURIComponent(projectId)}${path}`; }
  getProjects(signal) { return this.request("/projects", { signal }); }
  getBilling(signal, refresh = false) { return this.request(`/billing${refresh ? "?refresh=1" : ""}`, { signal }); }
  createCheckout(planId, cycle) { return this.request("/billing/checkout", { method: "POST", body: { planId, cycle } }); }
  confirmCheckout(sessionId, signal) { return this.request("/billing/checkout/confirm", { method: "POST", body: { sessionId }, signal }); }
  createBillingPortal() { return this.request("/billing/portal", { method: "POST", body: {} }); }
  ensureDefaultProject(body, signal) { return this.request("/projects/default", { method: "POST", body, signal }); }
  updateProject(id, body) { return this.request(this.projectPath(id), { method: "PATCH", body }); }
  project(id, path, options) { return this.request(this.projectPath(id, path), options); }
  async uploadMedia(projectId, file, { signal, onProgress = () => {} } = {}) {
    onProgress({ stage: "authorizing", loaded: 0, total: file.size });
    const { uploadToken } = await this.project(projectId, "/media/uploads", { method: "POST", body: { bytes: file.size }, signal });
    signal?.throwIfAborted();
    if (typeof uploadToken !== "string" || !uploadToken.startsWith("meadow_upload_")) throw new Error("Meadow could not start the upload. Please refresh and try again.");
    const body = new FormData();
    body.append("file", file);
    onProgress({ stage: "uploading", loaded: 0, total: file.size });
    // The single-use grant authorizes this file transfer before its bytes are
    // sent. A long transfer must not depend on a one-minute session token.
    const { ok, status, data } = await this.uploader(`/api/bridge${this.projectPath(projectId, "/media")}`, { body, token: uploadToken, signal, onProgress });
    if (!ok) {
      const error = new Error(data.error || `Upload failed (${status}). Please try again.`);
      Object.assign(error, { code: data.code, details: data.details, status });
      throw error;
    }
    if (!this.preview) { try { this.track(this.projectPath(projectId, "/media"), "POST"); } catch { /* Tracking cannot fail an upload. */ } }
    return normalizePlatformCollections(data);
  }
}
export const api = new BridgeApi();
