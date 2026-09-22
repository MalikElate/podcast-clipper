import fs from "node:fs";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { fileTypeFromFile } from "file-type";
import { invariant, BridgeError } from "../core/errors.js";
import { ProcessRunner } from "../core/ProcessRunner.js";
import { LockService } from "../core/LockService.js";

const accepted = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime", "video/webm", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/msword", "application/vnd.ms-powerpoint"]);

export class MediaService {
  constructor({ store, projects, storage, publicUrl, signingKey, runner = new ProcessRunner(), clock = () => Date.now(), maxBytes = 1024 ** 3, locks = new LockService(store, { clock }) }) {
    Object.assign(this, { store, projects, storage, publicUrl, signingKey, runner, clock, maxBytes });
    this.locks = locks;
  }

  async ingest(uid, projectId, file, { source = "upload", metadata = {} } = {}) {
    this.projects.require(uid, projectId);
    const stat = await fs.promises.stat(file.path);
    invariant(stat.size > 0 && stat.size <= this.maxBytes, `Upload a file smaller than ${Math.round(this.maxBytes / 1024 ** 2)} MB.`);
    const type = await fileTypeFromFile(file.path);
    invariant(type && accepted.has(type.mime), "This file type cannot be posted. Upload an image, video, PDF, Word document, or PowerPoint file.", { status: 415, code: "unsupported_media" });
    const kind = type.mime.startsWith("image/") ? "image" : type.mime.startsWith("video/") ? "video" : "document";
    const id = randomUUID(), storageKey = `${id}.${type.ext}`;
    const filename = String(file.originalname || file.filename || `media.${type.ext}`).replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180);
    const record = { id, projectId, ownerUid: uid, filename, kind, mime: type.mime, bytes: stat.size, storageKey, status: "processing", source, metadata, variants: {}, createdAt: this.clock(), updatedAt: this.clock() };
    this.store.put("media", record);
    await this.store.flush?.();
    try {
      await this.storage.importFile(file.path, storageKey);
      if (kind === "image" || kind === "video") {
        const result = JSON.parse(await this.runner.run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", this.storage.path(storageKey)]));
        const visual = result.streams?.find(stream => stream.codec_type === "video");
        invariant(visual?.width && visual?.height && visual.width * visual.height <= 100000000, "The media dimensions could not be read or are too large.");
        Object.assign(record, { width: visual.width, height: visual.height, durationSec: Number(result.format?.duration) || null, videoCodec: visual.codec_name });
        if (kind === "video") invariant(record.durationSec > 0 && record.durationSec <= 43200, "This video is empty or exceeds 12 hours.");
        const thumbnailKey = `${id}-thumb.jpg`;
        await this.runner.run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", this.storage.path(storageKey), "-frames:v", "1", "-vf", "scale=480:480:force_original_aspect_ratio=decrease", this.storage.path(thumbnailKey)]);
        record.thumbnailKey = thumbnailKey;
        await this.storage.persist?.(thumbnailKey);
      }
      invariant(this.store.get("media", id)?.status === "processing", "The selected media was removed.");
      record.status = "ready";
      const saved = this.store.put("media", record);
      await this.store.flush?.();
      return saved;
    } catch (error) {
      // A failed database acknowledgement must not remove an already-ready file.
      if (this.store.get("media", id)?.status === "ready") throw error;
      if (this.store.get("media", id)?.status === "processing") this.store.put("media", { ...record, status: "deleting", error: error.message });
      try {
        await this.store.flush?.();
        await Promise.all([storageKey, record.thumbnailKey].filter(Boolean).map(key => this.storage.remove(key)));
        if (this.store.get("media", id)?.status === "deleting") this.store.remove("media", id);
        await this.store.flush?.();
      } catch { /* Retain the deletion record so maintenance can retry durable cleanup. */ }
      throw error;
    }
  }

  list(uid, projectId) { this.projects.require(uid, projectId); return this.store.list("media", { projectId }).filter(item => !["failed", "deleting"].includes(item.status)).map(item => this.toPublic(item)); }
  require(uid, projectId, id) { return this.projects.requireRecord(uid, projectId, "media", id); }

  signature(id, variant, expires, download = false) {
    invariant(this.signingKey, "Media access has not been configured.", { status: 503 });
    return createHmac("sha256", this.signingKey).update(`${id}:${variant}:${expires}:${download ? 1 : 0}`).digest("hex");
  }
  url(record, { variant = "original", external = false, download = false } = {}) {
    const expires = this.clock() + (external ? 24 * 3600000 : 30 * 60000);
    const signature = this.signature(record.id, variant, expires, download);
    const relative = `/media/${record.id}/${variant}?expires=${expires}&signature=${signature}${download ? "&download=1" : ""}`;
    if (external) invariant(this.publicUrl?.startsWith("https://"), "A public HTTPS media address must be configured before this platform can publish.", { status: 503, code: "media_url_unconfigured" });
    return external ? `${this.publicUrl}${relative}` : relative;
  }
  verify(id, variant, expires, signature, download) {
    invariant(/^\d+$/.test(String(expires)) && Number(expires) > this.clock() && Number(expires) <= this.clock() + 25 * 3600000, "This media link has expired.", { status: 403 });
    const expected = Buffer.from(this.signature(id, variant, expires, download));
    const actual = Buffer.from(String(signature || ""));
    invariant(actual.length === expected.length && timingSafeEqual(actual, expected), "Invalid media link.", { status: 403 });
    const record = this.store.get("media", id);
    invariant(record?.status === "ready" && !this.projects.privacy?.blocked(record.ownerUid), "Media not found.", { status: 404 });
    const key = variant === "original" ? record.storageKey : variant === "thumbnail" ? record.thumbnailKey : record.variants?.[variant]?.key;
    invariant(key, "Media version not found.", { status: 404 });
    return { record, key, mime: variant === "original" ? record.mime : variant === "thumbnail" ? "image/jpeg" : record.variants[variant].mime };
  }
  toPublic(record) {
    const { storageKey, thumbnailKey, variants, ...visible } = record;
    return { ...visible, url: this.url(record), thumbnailUrl: thumbnailKey ? this.url(record, { variant: "thumbnail" }) : null, downloadUrl: this.url(record, { download: true }) };
  }

  async prepare(record, variant = "original") {
    return this.locks.withLock(`media:${record.id}:${variant}`, () => this.prepareVariant(record, variant), { waitMs: 31 * 60000, leaseMs: 90000 });
  }

  async prepareVariant(record, variant) {
    record = this.store.get("media", record.id);
    invariant(record?.status === "ready", "The selected media is unavailable.");
    if (variant === "original" || variant === "jpeg" && record.mime === "image/jpeg" || variant === "mp4" && record.mime === "video/mp4" && record.videoCodec === "h264") {
      await this.storage.ensure?.(record.storageKey);
      return { ...record, key: record.storageKey, variant: "original" };
    }
    if (!record.variants?.[variant]) {
      const key = `${record.id}-${variant}.${variant === "jpeg" ? "jpg" : "mp4"}`;
      const args = variant === "jpeg" ? ["-frames:v", "1", "-q:v", "3", "-vf", "scale='min(4096,iw)':-2"] : ["-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:a", "aac", "-movflags", "+faststart"];
      invariant(["jpeg", "mp4"].includes(variant), "Unsupported media conversion.");
      await this.storage.ensure?.(record.storageKey);
      await this.runner.run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", this.storage.path(record.storageKey), ...args, this.storage.path(key)], { timeoutMs: 30 * 60000 });
      record = this.store.get("media", record.id);
      if (record?.status !== "ready") { await this.storage.remove(key); throw new BridgeError("The selected media was removed."); }
      await this.storage.persist?.(key);
      const bytes = await this.storage.size(key);
      record = this.store.get("media", record.id);
      if (record?.status !== "ready") { await this.storage.remove(key); throw new BridgeError("The selected media was removed."); }
      record.variants = { ...record.variants, [variant]: { key, mime: variant === "jpeg" ? "image/jpeg" : "video/mp4", bytes } };
      this.store.put("media", record);
      await this.store.flush?.();
    }
    await this.storage.ensure?.(record.variants[variant].key);
    return { ...record, ...record.variants[variant], variant };
  }

  async remove(uid, projectId, id) {
    const record = this.require(uid, projectId, id);
    const projectDeliveries = this.store.list("delivery", { projectId });
    const used = this.store.list("post", { projectId }).some(post => {
      if (!post.mediaIds?.includes(id)) return false;
      const deliveries = projectDeliveries.filter(delivery => delivery.postId === post.id);
      return !deliveries.length || deliveries.some(delivery => !["published", "awaiting_publish", "cancelled"].includes(delivery.status));
    });
    invariant(!used, "This file is used by an active post. Remove it from that post or cancel the post first.", { status: 409 });
    this.store.put("media", { ...record, status: "deleting" });
    await this.store.flush?.();
    const keys = [record.storageKey, record.thumbnailKey, `${id}-thumb.jpg`, `${id}-jpeg.jpg`, `${id}-mp4.mp4`, ...Object.values(record.variants || {}).map(item => item.key)];
    await Promise.all([...new Set(keys.filter(Boolean))].map(key => this.storage.remove(key)));
    this.store.remove("media", id);
    await this.store.flush?.();
    return { deleted: true };
  }

  async retryRemovals() {
    for (const record of this.store.list("media", { status: "deleting", limit: 25 })) {
      try { await this.remove(record.ownerUid, record.projectId, record.id); }
      catch (error) {
        // Keep the manifest for retry, and do not let a storage outage hold up
        // the rest of the privacy maintenance pass for every queued deletion.
        if (error.code === "media_storage_unavailable") break;
      }
    }
  }
}
