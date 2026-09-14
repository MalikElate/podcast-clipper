import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { LocalMediaStorage } from "./LocalMediaStorage.js";
import { BridgeError, invariant } from "../core/errors.js";

/** R2 keeps originals and derivatives; local files are an FFmpeg/download cache. */
export class DurableMediaStorage extends LocalMediaStorage {
  constructor(root, { baseUrl = "http://meadow.storage", fetcher = fetch, timeoutMs = 30 * 60000 } = {}) {
    super(root);
    Object.assign(this, { baseUrl, fetcher, timeoutMs });
    this.operations = new Map();
  }

  path(key) {
    invariant(key !== "." && key !== "..", "Invalid media key.");
    return super.path(key);
  }
  url(key) { this.path(key); return new URL(`/media/${encodeURIComponent(key)}`, this.baseUrl).href; }
  async request(key, options = {}) {
    try {
      const timeoutMs = options.method === "DELETE" ? Math.min(this.timeoutMs, 30000) : this.timeoutMs;
      return await this.fetcher(this.url(key), { redirect: "error", signal: AbortSignal.timeout(timeoutMs), ...options });
    } catch {
      throw new BridgeError("Media storage is temporarily unavailable. Please try again.", { status: 503, code: "media_storage_unavailable" });
    }
  }
  exclusive(key, operation) {
    this.path(key);
    const pending = (this.operations.get(key) || Promise.resolve()).catch(() => {}).then(operation);
    this.operations.set(key, pending);
    return pending.finally(() => { if (this.operations.get(key) === pending) this.operations.delete(key); });
  }

  async importFile(source, key) {
    await super.importFile(source, key);
    await this.persist(key);
    return key;
  }
  persist(key) {
    return this.exclusive(key, async () => {
      const filename = this.path(key), { size } = await fs.promises.stat(filename);
      const body = fs.createReadStream(filename);
      try {
        const response = await this.request(key, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "Content-Length": String(size) }, body, duplex: "half" });
        invariant(response.ok, "The file could not be saved to media storage. Please try again.", { status: 503, code: "media_storage_unavailable" });
        await response.body?.cancel();
        return key;
      } finally { body.destroy(); }
    });
  }
  ensure(key) {
    return this.exclusive(key, async () => {
      const filename = this.path(key);
      try { if ((await fs.promises.stat(filename)).isFile()) return filename; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      const response = await this.request(key);
      invariant(response.status !== 404, "This media file is unavailable.", { status: 404, code: "media_not_found" });
      invariant(response.ok && response.body, "Media storage is temporarily unavailable. Please try again.", { status: 503, code: "media_storage_unavailable" });
      const temporary = `${filename}.${randomUUID()}.part`;
      try {
        await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
        const expected = response.headers.get("content-length");
        invariant(expected === null || Number(expected) === (await fs.promises.stat(temporary)).size, "The media download was interrupted. Please try again.", { status: 503, code: "media_storage_unavailable" });
        await fs.promises.rename(temporary, filename);
        return filename;
      } catch (error) {
        if (error instanceof BridgeError) throw error;
        throw new BridgeError("The media download was interrupted. Please try again.", { status: 503, code: "media_storage_unavailable" });
      } finally { await fs.promises.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; }); }
    });
  }
  stream(key, options) {
    this.path(key);
    const storage = this;
    return Readable.from((async function* () { await storage.ensure(key); yield* fs.createReadStream(storage.path(key), options); })());
  }
  async size(key) { await this.ensure(key); return super.size(key); }
  async blob(key, type) { await this.ensure(key); return super.blob(key, type); }
  remove(key) {
    return this.exclusive(key, async () => {
      const response = await this.request(key, { method: "DELETE" });
      invariant(response.ok || response.status === 404, "The media file could not be removed yet. Please try again.", { status: 503, code: "media_storage_unavailable" });
      await response.body?.cancel();
      await super.remove(key);
    });
  }
}
