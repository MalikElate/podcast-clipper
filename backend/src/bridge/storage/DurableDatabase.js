import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { BridgeError } from "../core/errors.js";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const failure = code => new BridgeError("Meadow could not save your changes. Please try again shortly.", { status: 503, code });

export class DurableDatabase {
  constructor({ url, generation, fetchImpl = fetch }) {
    this.url = url.replace(/\/$/, ""); this.generation = generation; this.fetch = fetchImpl;
  }
  async request(endpoint, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetch(`${this.url}${endpoint}`, { ...options, signal: AbortSignal.timeout(15000) });
        if (response.ok) return response;
        const data = await response.json().catch(() => ({}));
        const error = failure(data.code || "durable_storage_unavailable");
        if (response.status >= 400 && response.status < 500) { error.permanent = true; throw error; }
        throw error;
      } catch (error) {
        if (error.permanent) throw error;
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError?.code?.startsWith("durable_") ? lastError : failure("durable_storage_unavailable");
  }
  async persist(bytes, sequence) {
    const sha256 = hash(bytes);
    const response = await this.request("/snapshot", { method: "POST", headers: { "Content-Type": "application/vnd.sqlite3", "X-Meadow-Generation": String(this.generation), "X-Meadow-Sequence": String(sequence), "X-Meadow-Sha256": sha256 }, body: bytes });
    const committed = await response.json();
    if (committed.generation !== this.generation || committed.sequence !== sequence || committed.sha256 !== sha256) throw failure("durable_snapshot_unconfirmed");
  }
  async ready() { await this.request("/ready", { method: "POST", headers: { "X-Meadow-Generation": String(this.generation) } }); }
}

/** Restore before opening the application's database or starting any workers. */
export async function restoreDurableDatabase({ filename, url, fetchImpl = fetch }) {
  const client = new DurableDatabase({ url, fetchImpl });
  // Claim is deliberately not retried: an ambiguous successful claim must not
  // accidentally fence a second startup that has already begun serving.
  let response;
  try { response = await fetchImpl(`${client.url}/restore`, { method: "POST", signal: AbortSignal.timeout(30000) }); }
  catch { throw failure("durable_restore_unavailable"); }
  if (!response.ok) throw failure("durable_restore_unavailable");
  const generation = Number(response.headers.get("X-Meadow-Generation"));
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!Number.isSafeInteger(generation) || generation < 1 || hash(bytes) !== response.headers.get("X-Meadow-Sha256")) throw failure("durable_restore_checksum");
  if (bytes.length < 100 || bytes.subarray(0, 16).toString() !== "SQLite format 3\0") throw failure("durable_restore_invalid");
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.restore-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    const restored = new Database(temporary, { readonly: true, fileMustExist: true });
    try {
      const result = restored.pragma("integrity_check", { simple: true });
      if (result !== "ok") throw failure("durable_restore_integrity");
    } finally { restored.close(); }
    await fs.rm(`${filename}-wal`, { force: true });
    await fs.rm(`${filename}-shm`, { force: true });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }); }
  client.generation = generation;
  return client;
}

/** Delay even redirects until their associated SQLite changes are durable. */
export function durableResponseBarrier(store) {
  return (req, res, next) => {
    const end = res.end.bind(res);
    let ending = false;
    res.end = (...args) => {
      if (ending) return res;
      ending = true;
      Promise.resolve().then(() => store.flush()).then(() => end(...args), () => {
        if (res.headersSent) { res.destroy(); return; }
        res.statusCode = 503;
        res.removeHeader("Location"); res.removeHeader("Content-Length"); res.removeHeader("ETag");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        end(JSON.stringify({ error: "Meadow could not save your changes. Please try again shortly.", code: "durable_storage_unavailable" }));
      });
      return res;
    };
    next();
  };
}
