import { getAuthToken } from "../authToken.js";
import { normalizePlatformCollections } from "./platforms.js";
import { uploadPartWithProgress, uploadWithProgress } from "./uploadTransport.js";
import { captureRequestSuccess } from "../productAnalytics.js";
import { captureGoogleRequestSuccess } from "../googleAnalytics.js";
export const localPreview = Boolean(import.meta.env?.DEV && import.meta.env?.VITE_BRIDGE_LOCAL_PREVIEW === "true");
const sessionError = () => Object.assign(new Error("Your Meadow sign-in could not be verified. Please sign in again to continue."), { code: "authentication_required", status: 401 });
const networkError = cause => Object.assign(new Error("Meadow could not reach the server. Check your internet connection and try again.", { cause }), { code: "network_error" });
const invalidUpload = () => new Error("Meadow could not start the upload. Please refresh and try again.");
function waitForUploadRetry(ms, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
function validateUploadParts(grant, file) {
  if (typeof grant.id !== "string" || !grant.id || !Number.isSafeInteger(grant.partSize) || grant.partSize <= 0 || !Array.isArray(grant.parts) || !grant.parts.length || grant.parts.length > 10000) throw invalidUpload();
  let bytes = 0;
  for (const [index, part] of grant.parts.entries()) {
    if (!part || part.partNumber !== index + 1 || !Number.isSafeInteger(part.bytes) || part.bytes <= 0 || part.bytes > grant.partSize || index < grant.parts.length - 1 && part.bytes !== grant.partSize) throw invalidUpload();
    let url; try { url = new URL(part.url); } catch { throw invalidUpload(); }
    if (url.protocol !== "https:" || !url.hostname.endsWith(".r2.cloudflarestorage.com") || url.username || url.password || url.port || url.hash) throw invalidUpload();
    bytes += part.bytes;
  }
  if (bytes !== file.size) throw invalidUpload();
}
export class BridgeApi {
  constructor({ getToken = getAuthToken, fetcher = (...args) => fetch(...args), uploader = uploadWithProgress, partUploader = uploadPartWithProgress, retryWait = waitForUploadRetry, preview = localPreview, track = captureRequestSuccess } = {}) {
    Object.assign(this, { getToken, fetcher, uploader, partUploader, retryWait, preview, track });
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
  async request(path, { method = "GET", body, signal, refreshAuth = false } = {}) {
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
    let { res, data } = await send(form || refreshAuth);
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
  createCheckout(planId, cycle) { return this.request("/billing/checkout", { method: "POST", body: { planId, cycle } }); }
  confirmCheckout(sessionId, signal) { return this.request("/billing/checkout/confirm", { method: "POST", body: { sessionId }, signal }); }
  createBillingPortal() { return this.request("/billing/portal", { method: "POST", body: {} }); }
  ensureDefaultProject(body, signal) { return this.request("/projects/default", { method: "POST", body, signal }); }
  updateProject(id, body) { return this.request(this.projectPath(id), { method: "PATCH", body }); }
  project(id, path, options) { return this.request(this.projectPath(id, path), options); }
  async retryUpload(action, signal) {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try { return await action(); }
      catch (error) {
        signal?.throwIfAborted();
        const transient = ["network_error", "upload_timeout"].includes(error.code) || error.name === "TypeError" || error.status >= 500 && error.status < 600;
        if (!transient || attempt >= 2) throw error;
        await this.retryWait(500 * 2 ** attempt, signal);
      }
    }
  }
  async uploadMultipart(projectId, file, grant, { signal, onProgress }) {
    const path = typeof grant.id === "string" && grant.id ? `/media/uploads/${encodeURIComponent(grant.id)}` : null;
    try {
      signal?.throwIfAborted();
      validateUploadParts(grant, file);
      let uploaded = 0, reported = 0;
      const report = loaded => {
        reported = Math.max(reported, Math.min(file.size, loaded));
        onProgress({ stage: "uploading", loaded: reported, total: file.size });
      };
      report(0);
      const parts = [];
      for (const part of grant.parts) {
        const body = file.slice(uploaded, uploaded + part.bytes, "application/octet-stream");
        const result = await this.retryUpload(async () => {
          const response = await this.partUploader(part.url, { body, signal, onProgress: event => {
            if (Number.isFinite(event.loaded)) report(uploaded + Math.max(0, Math.min(part.bytes, event.loaded)));
          } });
          if (!response.ok) throw Object.assign(new Error(`The upload failed (${response.status}). Please try again.`), { status: response.status });
          if (typeof response.etag !== "string" || !response.etag.trim()) throw new Error("Meadow could not confirm the uploaded file. Please try again.");
          return response;
        }, signal);
        parts.push({ partNumber: part.partNumber, etag: result.etag });
        uploaded += part.bytes;
        report(uploaded);
      }
      signal?.throwIfAborted();
      onProgress({ stage: "processing", loaded: file.size, total: file.size });
      // Completion is idempotent. Obtain a fresh session after the long file
      // transfer and safely recover if its response is lost in transit.
      return await this.retryUpload(async () => {
        const data = await this.project(projectId, `${path}/complete`, { method: "POST", body: { parts }, signal, refreshAuth: true });
        if (!data.media?.id) throw networkError(new Error("The upload completion response was incomplete."));
        return data;
      }, signal);
    } catch (error) {
      // The caller's signal may already be cancelled. Abort the remote upload
      // independently; server expiry also cleans up if this request cannot run.
      if (path) try { await this.project(projectId, path, { method: "DELETE" }); } catch { /* Best-effort cleanup. */ }
      throw error;
    }
  }
  async uploadMedia(projectId, file, { signal, onProgress = () => {} } = {}) {
    onProgress({ stage: "authorizing", loaded: 0, total: file.size });
    const grant = await this.project(projectId, "/media/uploads", { method: "POST", body: { bytes: file.size, filename: file.name, contentType: file.type || "application/octet-stream", direct: true }, signal });
    if (grant.mode === "r2-multipart") {
      const data = await this.uploadMultipart(projectId, file, grant, { signal, onProgress });
      if (!this.preview) { try { this.track(this.projectPath(projectId, "/media"), "POST"); } catch { /* Tracking cannot fail an upload. */ } }
      return normalizePlatformCollections(data);
    }
    signal?.throwIfAborted();
    const { uploadToken } = grant;
    if (typeof uploadToken !== "string" || !uploadToken.startsWith("meadow_upload_")) throw invalidUpload();
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
