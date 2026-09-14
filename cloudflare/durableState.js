// The Container filesystem is temporary. This repository lives in its existing
// Durable Object and atomically replaces the committed SQLite snapshot.
const CHUNK_BYTES = 64 * 1024;
export const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024;
const META_KEY = "meadow:database:metadata";
const chunkKey = index => `meadow:database:chunk:${index}`;

export class DurableStateError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

export async function snapshotHash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
}

export class DurableState {
  constructor(storage) { this.storage = storage; }
  async status() {
    const meta = await this.storage.get(META_KEY);
    return meta ? { initialized: Boolean(meta.sha256), mode: meta.mode, generation: meta.generation, sequence: meta.sequence, bytes: meta.bytes, sha256: meta.sha256, updatedAt: meta.updatedAt, migration: meta.migration || null } : { initialized: false, mode: "legacy" };
  }
  async setMaintenance() {
    return this.storage.transaction(async tx => {
      const meta = await tx.get(META_KEY);
      if (meta && !["legacy", "migration"].includes(meta.mode)) throw new DurableStateError("durable_migration_already_complete", 409);
      const next = { ...(meta || {}), mode: "migration", generation: (meta?.generation || 0) + 1 };
      await tx.put(META_KEY, next);
      return next.generation;
    });
  }
  async resumeLegacy() {
    await this.storage.transaction(async tx => {
      const meta = await tx.get(META_KEY);
      if (!["migration", "resuming"].includes(meta?.mode)) throw new DurableStateError("durable_migration_not_paused", 409);
      await tx.put(META_KEY, { ...meta, mode: "legacy", generation: meta.generation + 1 });
    });
  }
  async beginResume() {
    await this.storage.transaction(async tx => {
      const meta = await tx.get(META_KEY);
      if (!["migration", "resuming"].includes(meta?.mode)) throw new DurableStateError("durable_migration_not_paused", 409);
      if (meta.mode !== "resuming") await tx.put(META_KEY, { ...meta, mode: "resuming", generation: meta.generation + 1 });
    });
  }
  async readSnapshot(tx, meta) {
    if (!meta?.sha256 || !Number.isSafeInteger(meta.chunks)) throw new DurableStateError("durable_state_uninitialized");
    const bytes = new Uint8Array(meta.bytes);
    for (let index = 0; index < meta.chunks; index++) {
      const chunk = await tx.get(chunkKey(index));
      if (!chunk) throw new DurableStateError("durable_snapshot_incomplete");
      bytes.set(new Uint8Array(chunk), index * CHUNK_BYTES);
    }
    return bytes;
  }
  async claim() {
    return this.storage.transaction(async tx => {
      const meta = await tx.get(META_KEY);
      const bytes = await this.readSnapshot(tx, meta);
      const next = { ...meta, generation: meta.generation + 1, sequence: 0, mode: "restoring" };
      await tx.put(META_KEY, next);
      return { ...next, bytes };
    });
  }
  async writeSnapshot(tx, old, bytes, fields) {
    const chunks = Math.ceil(bytes.byteLength / CHUNK_BYTES);
    for (let index = 0; index < chunks; index++) await tx.put(chunkKey(index), bytes.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES));
    for (let index = chunks; index < (old?.chunks || 0); index++) await tx.delete(chunkKey(index));
    const meta = { ...old, ...fields, chunks, bytes: bytes.byteLength, updatedAt: Date.now() };
    await tx.put(META_KEY, meta);
    return meta;
  }
  async install(bytes, migration = null, expectedGeneration) {
    this.validateSize(bytes);
    const sha256 = await snapshotHash(bytes);
    return this.storage.transaction(async tx => {
      const old = await tx.get(META_KEY);
      if (old?.sha256 && old.mode !== "migration") throw new DurableStateError("durable_migration_already_complete", 409);
      if (expectedGeneration !== undefined && (old?.mode !== "migration" || old.generation !== expectedGeneration)) throw new DurableStateError("durable_migration_generation_expired", 409);
      return this.writeSnapshot(tx, old, bytes, { generation: (old?.generation || 0) + 1, sequence: 0, mode: "migration", sha256, migration });
    });
  }
  validateSize(bytes) {
    if (bytes.byteLength < 100 || bytes.byteLength > MAX_SNAPSHOT_BYTES) throw new DurableStateError("durable_snapshot_size", 413);
    if (new TextDecoder().decode(bytes.slice(0, 16)) !== "SQLite format 3\0") throw new DurableStateError("durable_snapshot_invalid", 400);
  }
  async commit(bytes, generation, sequence, expectedHash) {
    this.validateSize(bytes);
    const sha256 = await snapshotHash(bytes);
    if (sha256 !== expectedHash) throw new DurableStateError("durable_snapshot_checksum", 400);
    return this.storage.transaction(async tx => {
      const old = await tx.get(META_KEY);
      if (!old || generation !== old.generation || !["ready", "restoring"].includes(old.mode)) throw new DurableStateError("durable_generation_expired", 409);
      if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence < old.sequence || (sequence === old.sequence && old.sha256 !== sha256)) throw new DurableStateError("durable_sequence_conflict", 409);
      if (sequence === old.sequence) return old;
      return this.writeSnapshot(tx, old, bytes, { sequence, sha256 });
    });
  }
  async ready(generation) {
    await this.storage.transaction(async tx => {
      const meta = await tx.get(META_KEY);
      if (!meta?.sha256 || generation !== meta.generation) throw new DurableStateError("durable_generation_expired", 409);
      if (meta.migration?.mediaPending) throw new DurableStateError("durable_media_migration_pending");
      await tx.put(META_KEY, { ...meta, mode: "ready" });
    });
  }
  async handle(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/restore") {
        const snapshot = await this.claim();
        return new Response(snapshot.bytes, { headers: { "Content-Type": "application/vnd.sqlite3", "X-Meadow-Generation": String(snapshot.generation), "X-Meadow-Sha256": snapshot.sha256, "Cache-Control": "no-store" } });
      }
      if (request.method === "POST" && url.pathname === "/snapshot") {
        const length = Number(request.headers.get("Content-Length"));
        if (length > MAX_SNAPSHOT_BYTES) throw new DurableStateError("durable_snapshot_size", 413);
        const meta = await this.commit(new Uint8Array(await request.arrayBuffer()), Number(request.headers.get("X-Meadow-Generation")), Number(request.headers.get("X-Meadow-Sequence")), request.headers.get("X-Meadow-Sha256"));
        return Response.json({ generation: meta.generation, sequence: meta.sequence, sha256: meta.sha256 });
      }
      if (request.method === "POST" && url.pathname === "/migration/snapshot") {
        if ((await this.status()).mode !== "migration") throw new DurableStateError("durable_migration_not_paused", 409);
        if (Number(request.headers.get("Content-Length")) > MAX_SNAPSHOT_BYTES) throw new DurableStateError("durable_snapshot_size", 413);
        const metadata = JSON.parse(request.headers.get("X-Meadow-Migration") || "{}");
        if (metadata.mediaPending || metadata.missingActiveMediaFiles) throw new DurableStateError("durable_media_migration_pending");
        const saved = await this.install(new Uint8Array(await request.arrayBuffer()), metadata, Number(request.headers.get("X-Meadow-Migration-Generation")));
        return Response.json({ sha256: saved.sha256, bytes: saved.bytes, durable: true });
      }
      if (request.method === "POST" && url.pathname === "/ready") {
        await this.ready(Number(request.headers.get("X-Meadow-Generation")));
        return Response.json({ ready: true });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return Response.json({ code: error.code || "durable_storage_unavailable" }, { status: error.status || 503 });
    }
  }
}
