import { randomUUID } from "node:crypto";
import { BridgeError, invariant } from "../core/errors.js";

const PART_BYTES = 32 * 1024 ** 2;
const UPLOAD_TTL = 30 * 60000;
const RECEIPT_TTL = 24 * 3600000;

/** The API handles upload metadata; file parts travel from the browser to R2. */
export class DirectUploadService {
  constructor({ store, projects, media, storage, locks, clock = () => Date.now(), enabled = false }) {
    Object.assign(this, { store, projects, media, storage, locks, clock, enabled });
  }

  async create(uid, projectId, { bytes, filename } = {}) {
    this.projects.require(uid, projectId);
    invariant(this.enabled && this.storage.createUpload, "Direct uploads are not configured.", { status: 503, code: "direct_upload_unavailable" });
    invariant(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= this.media.maxBytes, `Choose a file of up to ${Math.round(this.media.maxBytes / 1024 ** 2)} MB.`, { code: "upload_size_invalid" });
    invariant(typeof filename === "string" && filename.length > 0 && filename.length <= 512, "Choose a file to upload.");
    const active = this.store.list("media_upload", { ownerUid: uid, limit: null }).filter(item => !["ready", "cancelled"].includes(item.status) && item.expiresAt > this.clock());
    invariant(active.length < 10, "Finish or cancel your other uploads before starting another.", { status: 429, code: "upload_limit" });
    const id = randomUUID(), expiresAt = this.clock() + UPLOAD_TTL;
    let session = this.store.put("media_upload", {
      id, ownerUid: uid, projectId, bytes, filename: filename.replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180),
      key: `${id}.upload`, partSize: PART_BYTES, status: "creating", expiresAt, createdAt: this.clock(),
    });
    await this.store.flush?.();
    const upload = await this.storage.createUpload(session.key, { bytes, expiresAt, partSize: PART_BYTES });
    // Never disclose part URLs until the abort/recovery manifest is durable.
    session = this.store.put("media_upload", { ...session, status: "uploading", uploadId: upload.uploadId });
    await this.store.flush?.();
    this.projects.require(uid, projectId);
    return { mode: "r2-multipart", id, expiresAt, partSize: PART_BYTES, parts: upload.parts };
  }

  require(uid, projectId, id) {
    const session = this.projects.requireRecord(uid, projectId, "media_upload", id);
    invariant(session.ownerUid === uid, "Upload not found.", { status: 404 });
    return session;
  }

  parts(session, input) {
    const count = Math.ceil(session.bytes / session.partSize);
    invariant(Array.isArray(input) && input.length === count, "Upload every file part before finishing.", { code: "upload_parts_invalid" });
    const parts = input.map((part, index) => {
      invariant(part?.partNumber === index + 1 && typeof part.etag === "string" && /^(?:[a-f\d]{32}|"[a-f\d]{32}")$/i.test(part.etag), "The uploaded file parts could not be verified.", { code: "upload_parts_invalid" });
      return { partNumber: part.partNumber, etag: part.etag.replaceAll('"', "").toLowerCase() };
    });
    invariant(!session.parts || JSON.stringify(session.parts) === JSON.stringify(parts), "This upload was already completed with different file parts.", { status: 409, code: "upload_parts_mismatch" });
    return parts;
  }

  async complete(uid, projectId, id, input = {}) {
    this.require(uid, projectId, id);
    return this.locks.withLock(`upload:${id}`, async () => {
      let session = this.require(uid, projectId, id);
      const parts = this.parts(session, input.parts);
      const ready = this.store.get("media", id);
      if (ready?.status === "ready") { await this.store.flush?.(); return ready; }
      invariant(["uploading", "completing"].includes(session.status), "This upload is no longer available. Select the file again.", { status: 410, code: "upload_expired" });
      invariant(session.status === "completing" || session.expiresAt > this.clock(), "This upload has expired. Select the file again.", { status: 410, code: "upload_expired" });
      session = this.store.put("media_upload", { ...session, parts, status: "completing", completingAt: session.completingAt || this.clock() });
      await this.store.flush?.();
      try {
        await this.storage.completeUpload(session.key, { uploadId: session.uploadId, bytes: session.bytes, parts });
        this.projects.require(uid, projectId);
        const record = await this.media.ingestStored(uid, projectId, { id, key: session.key, filename: session.filename, bytes: session.bytes });
        this.store.put("media_upload", { ...session, status: "ready", completedAt: this.clock() });
        await this.store.flush?.();
        return record;
      } catch (error) {
        // Unknown storage outcomes remain recoverable. A definitive validation
        // failure is durably queued for removal, including an already completed object.
        if (this.store.get("media", id)?.status !== "ready" && error instanceof BridgeError && error.status < 500) {
          this.store.put("media_upload", { ...session, status: "cancelled" });
          await this.store.flush?.();
          await this.cleanup(this.store.get("media_upload", id)).catch(() => {});
        }
        throw error;
      }
    }, { waitMs: 30000, leaseMs: 90000 });
  }

  async cleanup(session) {
    const ready = this.store.get("media", session.id)?.status === "ready";
    if (!ready) {
      this.store.put("media_upload", { ...session, status: "cancelled" });
      await this.store.flush?.();
      if (session.uploadId) await this.storage.abortUpload(session.key, session.uploadId);
      // Only the server can complete a multipart upload. After abort, leaked
      // part URLs cannot restore a removed original or a deleted account.
      for (const key of [session.key, `${session.id}-thumb.jpg`]) await this.storage.remove(key);
      const record = this.store.get("media", session.id);
      if (record && record.status !== "ready") this.store.remove("media", session.id);
    }
    this.store.remove("media_upload", session.id);
    await this.store.flush?.();
    return !ready;
  }

  async cancel(uid, projectId, id) {
    this.projects.require(uid, projectId);
    return this.locks.withLock(`upload:${id}`, async () => {
      const session = this.store.get("media_upload", id);
      if (!session) return { cancelled: true };
      this.require(uid, projectId, id);
      if (this.store.get("media", id)?.status === "ready") return { cancelled: false };
      return { cancelled: await this.cleanup(session) };
    }, { waitMs: 30000, leaseMs: 90000 });
  }

  async eraseOwner(uid) {
    for (const session of this.store.list("media_upload", { ownerUid: uid, limit: null })) {
      await this.locks.withLock(`upload:${session.id}`, () => this.cleanup(session), { waitMs: 0, leaseMs: 90000 });
    }
  }

  async prune(activeRequests = new Map()) {
    const expired = this.store.list("media_upload", { limit: null }).filter(session => {
      if (activeRequests.has(session.ownerUid)) return false;
      if (session.status === "cancelled") return true;
      const deadline = session.status === "ready" ? session.completedAt + RECEIPT_TTL : session.status === "completing" ? session.completingAt + RECEIPT_TTL : session.expiresAt;
      return deadline <= this.clock();
    }).slice(0, 25);
    for (const session of expired) {
      try { await this.locks.withLock(`upload:${session.id}`, () => this.cleanup(session), { waitMs: 0, leaseMs: 90000 }); }
      catch (error) { if (error.code === "media_storage_unavailable") break; }
    }
  }
}
