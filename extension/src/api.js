import { auth, fetchMeadowJson, meadowUrl, MEADOW_ORIGIN } from "./auth.js";
import { normalizePlatformCollections } from "../../frontend/src/bridge/platforms.js";
import { uploadWithProgress } from "../../frontend/src/bridge/uploadTransport.js";

export const localPreview = false;
export const MAX_UPLOAD_BYTES = 90 * 1024 ** 2;

function mediaUrl(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^(\/media\/|https:\/\/findmeadow\.com\/media\/)/.test(value)) return null;
  try {
    const url = new URL(value, MEADOW_ORIGIN);
    if (url.origin !== MEADOW_ORIGIN || url.username || url.password || url.hash || !/^\/media\/[\w-]{1,200}\/(original|thumbnail)$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function normalizeExtensionResponse(value) {
  if (Array.isArray(value)) return value.map(normalizeExtensionResponse);
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeExtensionResponse(entry)]));
  if (result.creator && typeof result.creator === "object") {
    // Creator names and limits remain visible; arbitrary avatar hosts are not
    // loaded by this extension or added to its network permissions.
    const { avatar, ...creator } = result.creator; result.creator = creator;
  }
  if (result.media) {
    const normalize = item => !item || typeof item !== "object" ? item : {
      ...item, ...Object.fromEntries(["url", "thumbnailUrl", "downloadUrl"].filter(key => key in item).map(key => [key, mediaUrl(item[key])])),
    };
    result.media = Array.isArray(result.media) ? result.media.map(normalize) : normalize(result.media);
  }
  return result;
}

export class BridgeApi {
  constructor({ authClient = auth, fetcher = (...args) => globalThis.fetch(...args), uploader = uploadWithProgress, timeoutMs = 60000 } = {}) {
    Object.assign(this, { authClient, fetcher, uploader, timeoutMs });
    this.maxUploadBytes = MAX_UPLOAD_BYTES;
  }
  async request(path, { method = "GET", body, signal } = {}) {
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid Meadow API address.");
    const url = meadowUrl(`/api/bridge${path}`);
    if (!new URL(url).pathname.startsWith("/api/bridge/")) throw new Error("Invalid Meadow API address.");
    const key = await this.authClient.getKey();
    signal?.throwIfAborted();
    try {
      const data = await fetchMeadowJson(`/api/bridge${path}`, { method, body, token: key, signal, timeoutMs: this.timeoutMs, fetcher: this.fetcher });
      if (path === "/config" && Number.isSafeInteger(data.maxUploadBytes) && data.maxUploadBytes > 0) {
        this.maxUploadBytes = Math.min(MAX_UPLOAD_BYTES, data.maxUploadBytes);
        data.maxUploadBytes = this.maxUploadBytes;
      }
      return normalizePlatformCollections(normalizeExtensionResponse(data));
    } catch (error) {
      if (error.status === 401) await this.authClient.invalidateKey(key);
      throw error;
    }
  }
  projectPath(projectId, path = "") { return `/projects/${encodeURIComponent(projectId)}${path}`; }
  project(projectId, path, options) { return this.request(this.projectPath(projectId, path), options); }
  getProjects(signal) { return this.request("/projects", { signal }); }
  ensureDefaultProject(body, signal) { return this.request("/projects/default", { method: "POST", body, signal }); }
  async forCurrentConnection() {
    const original = this.authClient, key = await original.getKey();
    const pinned = new BridgeApi({
      fetcher: this.fetcher, uploader: this.uploader, timeoutMs: this.timeoutMs,
      authClient: {
        async getKey() {
          let current;
          try { current = await original.getKey(); } catch { /* A disconnected account is also a changed connection. */ }
          if (current !== key) throw Object.assign(new Error("Your Meadow connection changed. Review the accounts and submit again."), { code: "connection_changed", status: 409 });
          return key;
        },
        invalidateKey: failed => original.invalidateKey(failed),
      },
    });
    pinned.maxUploadBytes = this.maxUploadBytes;
    return pinned;
  }
  async uploadMedia(projectId, file, { signal, onProgress = () => {} } = {}) {
    signal?.throwIfAborted();
    if (!(file instanceof Blob) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > this.maxUploadBytes) {
      const limit = Math.round(this.maxUploadBytes / 1024 ** 2 * 10) / 10;
      throw new Error(`Choose an image or video up to ${limit} MiB. Larger files can be uploaded in Meadow.`);
    }
    if (typeof file.name !== "string" || !file.name || file.name.length > 180) throw new Error("Choose a file with a name up to 180 characters.");
    onProgress({ stage: "authorizing", loaded: 0, total: file.size });
    const { uploadToken, directUpload } = await this.project(projectId, "/media/uploads", { method: "POST", body: { bytes: file.size, filename: file.name, direct: false }, signal });
    signal?.throwIfAborted();
    if (directUpload || typeof uploadToken !== "string" || !/^meadow_upload_[A-Za-z0-9_-]{43}$/.test(uploadToken)) {
      throw new Error("Meadow could not authorize this upload. Select the file again.");
    }
    const body = new FormData(); body.append("file", file);
    onProgress({ stage: "uploading", loaded: 0, total: file.size });
    // Only a single-use, file-sized grant accompanies the bytes. The account key
    // never reaches a storage host and file transfers are never replayed.
    const { ok, status, data } = await this.uploader(meadowUrl(`/api/bridge${this.projectPath(projectId, "/media")}`), { body, token: uploadToken, signal, onProgress });
    if (!ok) {
      const error = new Error(typeof data?.error === "string" ? data.error : status === 413 ? "This file is too large for this upload route. Use Meadow to upload it." : `Upload failed (${status}). Select the file again.`);
      Object.assign(error, { code: data?.code, details: data?.details, status }); throw error;
    }
    if (data?.media?.status !== "ready" || typeof data.media.id !== "string" || !data.media.id) throw new Error("The upload could not be confirmed. Check your Meadow media library before uploading again.");
    return normalizePlatformCollections(normalizeExtensionResponse(data));
  }
}

export const api = new BridgeApi();
