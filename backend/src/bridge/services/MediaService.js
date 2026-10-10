import fs from "node:fs";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { fileTypeFromFile } from "file-type";
import { invariant, BridgeError } from "../core/errors.js";
import { ProcessRunner } from "../core/ProcessRunner.js";
import { LockService } from "../core/LockService.js";
import { acceptedMediaMimes, unsupportedMediaMessage } from "./mediaValidation.js";

export class MediaService {
  constructor({ store, projects, storage, publicUrl, signingKey, runner = new ProcessRunner(), clock = () => Date.now(), maxBytes = 1024 ** 3, locks = new LockService(store, { clock }) }) {
    Object.assign(this, { store, projects, storage, publicUrl, signingKey, runner, clock, maxBytes });
    this.locks = locks;
  }

  async ingest(uid, projectId, file, { source = "upload", metadata = {}, expectedMime } = {}) {
    this.projects.require(uid, projectId);
    const stat = await fs.promises.stat(file.path);
    invariant(stat.size > 0 && stat.size <= this.maxBytes, `Upload a file smaller than ${Math.round(this.maxBytes / 1024 ** 2)} MB.`);
    const type = await fileTypeFromFile(file.path);
    invariant(type && acceptedMediaMimes.has(type.mime) && (!expectedMime || type.mime === expectedMime), unsupportedMediaMessage, { status: 415, code: "unsupported_media" });
    const kind = type.mime.startsWith("image/") ? "image" : type.mime.startsWith("video/") ? "video" : "document";
    const id = randomUUID(), storageKey = `${id}.${type.ext}`;
    const filename = String(file.originalname || file.filename || `media.${type.ext}`).replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180);
    const record = { id, projectId, ownerUid: uid, filename, kind, mime: type.mime, bytes: stat.size, storageKey, status: "processing", source, metadata, variants: {}, createdAt: this.clock(), updatedAt: this.clock() };
    this.store.put("media", record);
    await this.store.flush?.();
    try {
      await this.storage.importFile(file.path, storageKey);
      await this.inspect(record);
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

  async inspect(record) {
    if (!["image", "video"].includes(record.kind)) return;
    const result = JSON.parse(await this.runner.run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", this.storage.path(record.storageKey)]));
    const visual = result.streams?.find(stream => stream.codec_type === "video");
    invariant(visual?.width && visual?.height && visual.width * visual.height <= 100000000, "The media dimensions could not be read or are too large.");
    Object.assign(record, { width: visual.width, height: visual.height, durationSec: Number(result.format?.duration) || null, videoCodec: visual.codec_name });
    if (record.kind === "video") invariant(record.durationSec > 0 && record.durationSec <= 43200, "This video is empty or exceeds 12 hours.");
    const thumbnailKey = `${record.id}-thumb.jpg`;
    await this.runner.run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", this.storage.path(record.storageKey), "-frames:v", "1", "-vf", "scale=480:480:force_original_aspect_ratio=decrease", this.storage.path(thumbnailKey)]);
    invariant(this.store.get("media", record.id)?.status === "processing" && !this.projects.privacy?.blocked(record.ownerUid), "The selected media was removed.");
    record.thumbnailKey = thumbnailKey;
    await this.storage.persist?.(thumbnailKey);
  }

  async createDirectUpload(uid, projectId, { bytes, filename, expectedMime } = {}) {
    this.projects.require(uid, projectId);
    invariant(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= this.maxBytes, `Choose a file of up to ${Math.round(this.maxBytes / 1024 ** 2)} MB.`, { code: "upload_size_invalid" });
    invariant(this.store.list("media", { ownerUid: uid, statuses: ["uploading", "processing"] }).length < 100, "Finish your existing uploads before adding more.", { status: 429 });
    const id = randomUUID(), storageKey = `${id}.upload`;
    const ticket = await this.storage.createDirectUpload(storageKey, { bytes });
    this.projects.require(uid, projectId);
    // The signature limits when PUT may start; a slow transfer can finish later.
    const record = { id, ownerUid: uid, projectId, storageKey, bytes, filename: String(filename || "media").replace(/[\x00-\x1f/\\]/g, "_").slice(0, 180), expectedMime, source: "direct_upload", status: "uploading", uploadExpiresAt: ticket.expiresAt + 2 * 3600000, variants: {}, metadata: {}, createdAt: this.clock(), updatedAt: this.clock() };
    this.store.put("media", record);
    await this.store.flush?.();
    return { directUpload: { ...ticket, mediaId: id } };
  }

  async completeDirectUpload(uid, projectId, id) {
    this.require(uid, projectId, id);
    return this.locks.withLock(`upload:${id}`, async () => {
      const record = this.require(uid, projectId, id);
      invariant(record.source === "direct_upload" && ["uploading", "processing", "ready"].includes(record.status), record.error || "This upload is unavailable. Select the file again.", { status: 409, code: "upload_unavailable" });
      if (record.status !== "uploading") return { media: this.toPublic(record) };
      invariant(record.uploadExpiresAt > this.clock(), "This upload authorization has expired. Select the file again.", { status: 410, code: "upload_expired" });
      await this.storage.completeDirectUpload(record.storageKey, { bytes: record.bytes });
      if (this.store.get("media", id)?.status !== "uploading" || this.projects.privacy?.blocked(uid)) await this.cleanDirectUpload(record);
      invariant(this.store.get("media", id)?.status === "uploading" && !this.projects.privacy?.blocked(uid), "The selected media was removed.", { status: 410 });
      const saved = this.store.put("media", { ...record, status: "processing", updatedAt: this.clock() });
      await this.store.flush?.();
      return { media: this.toPublic(saved) };
    }, { waitMs: 150000, leaseMs: 90000 });
  }

  directKeys(record) { return [record.storageKey, `${record.id}-thumb.jpg`]; }
  async cleanDirectUpload(record) {
    await Promise.all(this.directKeys(record).map(key => this.storage.remove(key)));
    if (this.store.get("media", record.id)?.status === "failed") this.store.put("media", { ...this.store.get("media", record.id), cleanupPending: false });
    await this.store.flush?.();
  }

  async processDirectRecord(record) {
    try {
      await this.storage.ensure(record.storageKey);
      const stat = await fs.promises.stat(this.storage.path(record.storageKey));
      invariant(stat.size === record.bytes, "The uploaded file size did not match. Select the file again.");
      const type = await fileTypeFromFile(this.storage.path(record.storageKey));
      invariant(type && acceptedMediaMimes.has(type.mime) && (!record.expectedMime || type.mime === record.expectedMime), unsupportedMediaMessage, { status: 415, code: "unsupported_media" });
      Object.assign(record, { mime: type.mime, kind: type.mime.startsWith("image/") ? "image" : type.mime.startsWith("video/") ? "video" : "document" });
      await this.inspect(record);
      invariant(this.store.get("media", record.id)?.status === "processing" && !this.projects.privacy?.blocked(record.ownerUid), "The selected media was removed.");
      // Large originals stay in R2, rather than filling the container's working disk.
      await this.storage.evict?.(record.storageKey);
      invariant(this.store.get("media", record.id)?.status === "processing" && !this.projects.privacy?.blocked(record.ownerUid), "The selected media was removed.");
      this.store.put("media", { ...record, status: "ready", updatedAt: this.clock(), error: undefined });
      await this.store.flush?.();
    } catch (error) {
      const current = this.store.get("media", record.id);
      if (current?.status === "ready") throw error;
      if (current?.status === "processing" && !this.projects.privacy?.blocked(record.ownerUid)) {
        if (error.code === "media_storage_unavailable" && (current.processingAttempts || 0) < 5) {
          this.store.put("media", { ...current, processingAttempts: (current.processingAttempts || 0) + 1, retryAt: this.clock() + 30000 });
          await this.store.flush?.();
          return;
        }
        this.store.put("media", { ...current, status: "failed", error: error.code === "unsupported_media" ? error.message : "The uploaded file could not be prepared. Please check the file and try again.", cleanupPending: true, updatedAt: this.clock() });
        await this.store.flush?.();
      }
      await this.cleanDirectUpload(record);
    }
  }

  processDirectUploads() {
    if (this.directProcessing || this.directStopped) return this.directProcessing;
    this.directProcessing = (async () => {
      for (const item of this.store.list("media", { statuses: ["uploading", "processing", "failed"], limit: null }).filter(record => record.source === "direct_upload")) {
        if (this.directStopped) break;
        // Another upload may finish while an earlier large file is being prepared.
        const record = this.store.get("media", item.id);
        if (!record || !["uploading", "processing", "failed"].includes(record.status)) continue;
        if (record.status === "uploading" && record.uploadExpiresAt <= this.clock()) {
          Object.assign(record, { status: "failed", error: "This upload authorization has expired. Select the file again.", cleanupPending: true, updatedAt: this.clock() });
          this.store.put("media", record); await this.store.flush?.();
        }
        if (record.status === "failed") {
          if (record.cleanupPending) await this.cleanDirectUpload(record);
          else if (record.updatedAt < this.clock() - 86400000) { this.store.remove("media", record.id); await this.store.flush?.(); }
        } else if (record.status === "processing" && (!record.retryAt || record.retryAt <= this.clock())) {
          await this.locks.withLock(`upload-processing:${record.id}`, async () => {
            const current = this.store.get("media", record.id);
            if (current?.status === "processing") await this.processDirectRecord(current);
          }, { waitMs: 0, leaseMs: 90000 });
        }
      }
    })().catch(error => console.error("Direct upload preparation:", error.code || error.name)).finally(() => { this.directProcessing = null; });
    return this.directProcessing;
  }
  start() { this.directStopped = false; this.processDirectUploads(); this.directTimer = setInterval(() => this.processDirectUploads(), 10000); this.directTimer.unref?.(); }
  stop() { this.directStopped = true; clearInterval(this.directTimer); }

  list(uid, projectId) { this.projects.require(uid, projectId); return this.store.list("media", { projectId }).filter(item => !["uploading", "failed", "deleting"].includes(item.status) && (item.source !== "direct_upload" || item.status === "ready")).map(item => this.toPublic(item)); }
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
    const { storageKey, thumbnailKey, variants, uploadExpiresAt, processingAttempts, retryAt, cleanupPending, expectedMime, ...visible } = record;
    return { ...visible, url: record.status === "ready" ? this.url(record) : null, thumbnailUrl: record.status === "ready" && thumbnailKey ? this.url(record, { variant: "thumbnail" }) : null, downloadUrl: record.status === "ready" ? this.url(record, { download: true }) : null };
  }

  async prepare(record, variant = "original") {
    return this.locks.withLock(`media:${record.id}:${variant}`, () => this.prepareVariant(record, variant), { waitMs: 31 * 60000, leaseMs: 90000 });
  }

  async prepareVideoCover(record, timestampMs) {
    invariant(record?.kind === "video" && Number.isSafeInteger(timestampMs) && timestampMs >= 0
      && Number.isFinite(record.durationSec) && timestampMs < record.durationSec * 1000, "Choose a cover frame within the video’s duration.");
    return this.prepare(record, `cover-${timestampMs}`);
  }

  async prepareTikTokCover(video, image) {
    invariant(video?.kind === "video" && image?.kind === "image" && video.projectId === image.projectId
      && video.ownerUid === image.ownerUid && /^[\w-]{1,200}$/.test(image.id), "Choose a cover image from this project.");
    const variant = `tiktok-cover-${image.id}`;
    return this.locks.withLock(`media:${video.id}:${variant}`, async () => {
      let record = this.store.get("media", video.id);
      invariant(record?.status === "ready" && this.store.get("media", image.id)?.status === "ready", "The selected video or cover is unavailable.");
      if (!record.variants?.[variant]) {
        const source = await this.prepare(record, "mp4"), cover = await this.prepare(image, "video-thumbnail");
        const probe = JSON.parse(await this.runner.run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", this.storage.path(source.key)]));
        const visual = probe.streams?.find(stream => stream.codec_type === "video");
        invariant(visual?.width && visual?.height, "The video dimensions could not be read.");
        const rotation = Number(visual.side_data_list?.find(item => item.rotation !== undefined)?.rotation ?? visual.tags?.rotate ?? 0);
        const rotated = Math.abs(rotation) % 180 === 90;
        const width = Math.floor((rotated ? visual.height : visual.width) / 2) * 2, height = Math.floor((rotated ? visual.width : visual.height) / 2) * 2;
        const key = `${video.id}-${variant}.mp4`;
        // TikTok's native API accepts only a video frame. Replace the first frame
        // in a separate version, keeping the duration, audio timing, and original.
        const filter = `[0:v]scale=${width}:${height},setsar=1[base];[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[cover];[base][cover]overlay=0:0:enable='eq(n,0)'[out]`;
        try {
          await this.runner.run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", this.storage.path(source.key), "-i", this.storage.path(cover.key), "-filter_complex", filter, "-map", "[out]", "-map", "0:a?", "-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", this.storage.path(key)], { timeoutMs: 30 * 60000 });
          record = this.store.get("media", video.id);
          invariant(record?.status === "ready" && this.store.get("media", image.id)?.status === "ready", "The selected video or cover was removed.");
          await this.storage.persist?.(key);
          const bytes = await this.storage.size(key);
          record = this.store.get("media", video.id);
          invariant(bytes > 0 && record?.status === "ready" && this.store.get("media", image.id)?.status === "ready", "The selected video or cover is unavailable.");
          record.variants = { ...record.variants, [variant]: { key, mime: "video/mp4", bytes } };
          this.store.put("media", record); await this.store.flush?.();
        } catch (error) {
          if (!this.store.get("media", video.id)?.variants?.[variant]) await this.storage.remove(key);
          throw error;
        }
      }
      await this.storage.ensure?.(record.variants[variant].key);
      return { ...record, ...record.variants[variant], variant };
    }, { waitMs: 31 * 60000, leaseMs: 90000 });
  }

  async prepareVariant(record, variant) {
    record = this.store.get("media", record.id);
    invariant(record?.status === "ready", "The selected media is unavailable.");
    const coverMatch = /^cover-(\d+)$/.exec(variant), coverTimestamp = coverMatch ? Number(coverMatch[1]) : null;
    const isCover = coverTimestamp !== null, isThumbnail = variant === "video-thumbnail", isJpeg = variant === "jpeg" || isThumbnail || isCover;
    invariant(["original", "jpeg", "mp4"].includes(variant) || isThumbnail && record.kind === "image" || isCover && record.kind === "video"
      && Number.isSafeInteger(coverTimestamp) && coverTimestamp < record.durationSec * 1000, "Unsupported media conversion.");
    if (variant === "original" || variant === "jpeg" && record.mime === "image/jpeg" || variant === "mp4" && record.mime === "video/mp4" && record.videoCodec === "h264") {
      await this.storage.ensure?.(record.storageKey);
      return { ...record, key: record.storageKey, variant: "original" };
    }
    if (!record.variants?.[variant]) {
      const key = `${record.id}-${variant}.${isJpeg ? "jpg" : "mp4"}`;
      const args = isCover ? ["-frames:v", "1", "-q:v", "4", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,setsar=1"] : isThumbnail ? ["-frames:v", "1", "-q:v", "3", "-vf", "scale=1280:1280:force_original_aspect_ratio=decrease,setsar=1"] : variant === "jpeg" ? ["-frames:v", "1", "-q:v", "3", "-vf", "scale='min(4096,iw)':-2"] : ["-c:v", "libx264", "-preset", "fast", "-crf", "22", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:a", "aac", "-movflags", "+faststart"];
      await this.storage.ensure?.(record.storageKey);
      await this.runner.run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...(isCover ? ["-ss", String(coverTimestamp / 1000)] : []), "-i", this.storage.path(record.storageKey), ...args, this.storage.path(key)], { timeoutMs: 30 * 60000 });
      record = this.store.get("media", record.id);
      if (record?.status !== "ready") { await this.storage.remove(key); throw new BridgeError("The selected media was removed."); }
      await this.storage.persist?.(key);
      const bytes = await this.storage.size(key);
      record = this.store.get("media", record.id);
      if (record?.status !== "ready") { await this.storage.remove(key); throw new BridgeError("The selected media was removed."); }
      invariant(bytes > 0, "The cover frame could not be read. Choose an earlier frame.");
      record.variants = { ...record.variants, [variant]: { key, mime: isJpeg ? "image/jpeg" : "video/mp4", bytes } };
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
      const deliveries = projectDeliveries.filter(delivery => delivery.postId === post.id);
      const referenced = post.mediaIds?.includes(id) || Object.values(post.overrides || {}).some(override => override.settings?.thumbnailMediaId === id);
      if (!referenced) return deliveries.some(delivery => !["published", "awaiting_publish", "cancelled"].includes(delivery.status) && delivery.contentSnapshot?.thumbnailMediaId === id);
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
