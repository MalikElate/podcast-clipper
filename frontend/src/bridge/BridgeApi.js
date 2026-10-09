import { getAuthToken } from "../authToken.js";
import { normalizePlatformCollections } from "./platforms.js";
import { uploadWithProgress } from "./uploadTransport.js";
import { captureRequestSuccess } from "../productAnalytics.js";
import { captureGoogleRequestSuccess } from "../googleAnalytics.js";
export const localPreview = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_BRIDGE_LOCAL_PREVIEW === "true");
const sessionError = () => Object.assign(new Error("Your Meadow sign-in could not be verified. Please sign in again to continue."), { code: "authentication_required", status: 401 });
const networkError = cause => Object.assign(new Error("Meadow could not reach the server. Check your internet connection and try again.", { cause }), { code: "network_error" });
const waitForUpload = signal => new Promise((resolve, reject) => {
  signal?.throwIfAborted();
  const finish = () => { signal?.removeEventListener("abort", abort); resolve(); };
  const timer = setTimeout(finish, 2000);
  const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
  signal?.addEventListener("abort", abort, { once: true });
});
export class BridgeApi {
  constructor({ getToken = getAuthToken, fetcher = (...args) => fetch(...args), uploader = uploadWithProgress, preview = localPreview, track = captureRequestSuccess, waitForPreparation = waitForUpload } = {}) {
    Object.assign(this, { getToken, fetcher, uploader, preview, track, waitForPreparation });
  }
  async headers(json = true, refresh = false) {
    let token;
    try {
      token = this.preview ? null : await this.getToken({ skipCache: refresh });
      if (!this.preview && !token && !refresh) token = await this.getToken({ skipCache: true });
    } catch (error) { if (error.name === "TypeError") throw networkError(error); throw error; }
    if (!this.preview && !token) throw sessionError();
    return { ...(json ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(this.preview ? { "X-Bridge-Preview": "1" } : {}) };
  }
  async request(path, { method = "GET", body, signal } = {}) {
    const form = body instanceof FormData;
    let retriedNetwork = false;
    const send = async refresh => {
      signal?.throwIfAborted();
      const headers = await this.headers(!form, refresh);
      signal?.throwIfAborted();
      const options = { method, headers, body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal };
      let res;
      for (;;) {
        try { res = await this.fetcher(`/api/bridge${path}`, options); break; }
        catch (error) {
          signal?.throwIfAborted();
          if (error.name !== "TypeError") throw error;
          // Read requests may recover from one dropped connection. A write
          // may already have reached the server, so it must never be replayed.
          if (method === "GET" && !form && body === undefined && !retriedNetwork) { retriedNetwork = true; continue; }
          throw networkError(error);
        }
      }
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
    if (!this.preview) {
      try { this.track(path, method); } catch { /* Tracking cannot fail a successful request. */ }
      captureGoogleRequestSuccess(path, method, body);
    }
    return normalizePlatformCollections(data);
  }
  projectPath(projectId, path = "") { return `/projects/${encodeURIComponent(projectId)}${path}`; }
  getProjects(signal) { return this.request("/projects", { signal }); }
  getBilling(signal, refresh = false) { return this.request(`/billing${refresh ? "?refresh=1" : ""}`, { signal }); }
  createCheckout(planId, cycle, expected = {}) { return this.request("/billing/checkout", { method: "POST", body: { planId, cycle, ...expected } }); }
  confirmCheckout(sessionId, signal) { return this.request("/billing/checkout/confirm", { method: "POST", body: { sessionId }, signal }); }
  createBillingPortal() { return this.request("/billing/portal", { method: "POST", body: {} }); }
  ensureDefaultProject(body, signal) { return this.request("/projects/default", { method: "POST", body, signal }); }
  updateProject(id, body) { return this.request(this.projectPath(id), { method: "PATCH", body }); }
  project(id, path, options) { return this.request(this.projectPath(id, path), options); }
  async uploadMedia(projectId, file, { signal, onProgress = () => {} } = {}) {
    onProgress({ stage: "authorizing", loaded: 0, total: file.size });
    const { uploadToken, directUpload } = await this.project(projectId, "/media/uploads", { method: "POST", body: { bytes: file.size, filename: file.name, direct: true }, signal });
    signal?.throwIfAborted();
    if (directUpload) return this.uploadDirect(projectId, file, directUpload, { signal, onProgress });
    if (typeof uploadToken !== "string" || !uploadToken.startsWith("meadow_upload_")) throw new Error("Meadow could not start the upload. Please refresh and try again.");
    const body = new FormData();
    body.append("file", file);
    onProgress({ stage: "uploading", loaded: 0, total: file.size });
    // The single-use grant authorizes this file transfer before its bytes are
    // sent. A long transfer must not depend on a one-minute session token.
    const { ok, status, data } = await this.uploader(`/api/bridge${this.projectPath(projectId, "/media")}`, { body, token: uploadToken, signal, onProgress });
    if (!ok) {
      const error = new Error(data.error || (status === 413 ? "This file is too large for the current upload route. Please choose a smaller video." : `Upload failed (${status}). Please try again.`));
      Object.assign(error, { code: data.code, details: data.details, status });
      throw error;
    }
    if (!this.preview) { try { this.track(this.projectPath(projectId, "/media"), "POST"); } catch { /* Tracking cannot fail an upload. */ } }
    return normalizePlatformCollections(data);
  }

  async uploadDirect(projectId, file, ticket, { signal, onProgress }) {
    const url = new URL(ticket.uploadUrl);
    if (url.protocol !== "https:" || !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(url.hostname) || ticket.method !== "PUT" || !/^[a-f0-9-]{36}$/.test(ticket.mediaId)) throw new Error("Meadow could not start the upload. Please refresh and try again.");
    onProgress({ stage: "uploading", loaded: 0, total: file.size });
    // Only the file and scoped R2 signature cross origins; never a Meadow session token.
    const result = await this.uploader(ticket.uploadUrl, { body: file, method: "PUT", headers: { "Content-Type": "application/octet-stream", "If-None-Match": "*" }, signal, onProgress });
    if (!result.ok) throw Object.assign(new Error(`The file could not be uploaded (${result.status}). Please try again.`), { status: result.status });
    signal?.throwIfAborted();
    onProgress({ stage: "processing", loaded: file.size, total: file.size });
    const statusPath = `/media/${ticket.mediaId}`, completePath = `/media/uploads/${ticket.mediaId}/complete`;
    let data;
    try { data = await this.project(projectId, completePath, { method: "POST", body: {}, signal }); }
    catch (error) {
      if (error.code !== "network_error") throw error;
      // Completion is idempotent: recover its acknowledgement without sending the file again.
      data = await this.project(projectId, statusPath, { signal });
      if (data.media?.status === "uploading") data = await this.project(projectId, completePath, { method: "POST", body: {}, signal });
    }
    const deadline = Date.now() + 60 * 60000;
    while (data.media?.status === "processing") {
      if (Date.now() >= deadline) throw new Error("Your file is saved, but preparation is taking longer than expected. Check your media library shortly.");
      await this.waitForPreparation(signal);
      signal?.throwIfAborted();
      data = await this.project(projectId, statusPath, { signal });
    }
    if (data.media?.status !== "ready") throw new Error(data.media?.error || "The uploaded file could not be prepared. Please try again.");
    if (!this.preview) { try { this.track(this.projectPath(projectId, "/media"), "POST"); } catch { /* Tracking cannot fail an upload. */ } }
    return data;
  }
}
export const api = new BridgeApi();
