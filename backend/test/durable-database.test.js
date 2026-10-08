import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import express from "express";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { DurableDatabase, restoreDurableDatabase, durableResponseBarrier } from "../src/bridge/storage/DurableDatabase.js";
import { DurableState } from "../../cloudflare/durableState.js";

class MemoryStorage {
  constructor(map = new Map()) { this.map = map; this.tail = Promise.resolve(); }
  async get(key) { return structuredClone(this.map.get(key)); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async transaction(fn) {
    const result = this.tail.then(async () => {
      const tx = new MemoryStorage(structuredClone(this.map));
      const value = await fn(tx); this.map = tx.map; return value;
    });
    this.tail = result.catch(() => {}); return result;
  }
}
const openSnapshot = bytes => new Database(Buffer.from(bytes));

test("connections and rotated credentials survive replacement; stale instances cannot resurrect a disconnect", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "meadow-durable-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const state = new DurableState(new MemoryStorage());
  const legacy = new SqliteStore();
  legacy.put("project", { id: "project", ownerUid: "owner" });
  legacy.put("account", { id: "account", projectId: "project", ownerUid: "owner", encryptedCredentials: "old-ciphertext", status: "connected" });
  await state.install(legacy.db.serialize()); legacy.close();
  const fetchImpl = (url, init) => state.handle(new Request(url, init));
  const firstClient = await restoreDurableDatabase({ filename: path.join(directory, "first.sqlite"), url: "http://meadow.storage", fetchImpl });
  const first = new SqliteStore(path.join(directory, "first.sqlite"), { durability: firstClient });
  t.after(() => first.close());
  await firstClient.ready();
  first.put("account", { ...first.get("account", "account"), encryptedCredentials: "rotated-ciphertext" });
  await first.flush();
  const secondClient = await restoreDurableDatabase({ filename: path.join(directory, "second.sqlite"), url: "http://meadow.storage", fetchImpl });
  const second = new SqliteStore(path.join(directory, "second.sqlite"), { durability: secondClient });
  t.after(() => second.close());
  assert.equal(second.get("account", "account").encryptedCredentials, "rotated-ciphertext");
  assert.equal(second.get("project", "project").ownerUid, "owner");
  await secondClient.ready();
  second.remove("account", "account"); await second.flush();
  first.put("account", { ...first.get("account", "account"), encryptedCredentials: "stale-ciphertext" });
  await assert.rejects(first.flush(), error => error.code === "durable_generation_expired");
  const thirdFilename = path.join(directory, "third.sqlite");
  await restoreDurableDatabase({ filename: thirdFilename, url: "http://meadow.storage", fetchImpl });
  const checked = new Database(thirdFilename);
  assert.equal(checked.prepare("SELECT count(*) AS count FROM entities WHERE kind='account'").get().count, 0);
  checked.close();
});

test("a flush includes concurrent writes before either caller is acknowledged", async t => {
  let release, started;
  const wait = new Promise(resolve => { release = resolve; });
  const began = new Promise(resolve => { started = resolve; });
  const commits = [];
  const store = new SqliteStore(":memory:", { durability: { async persist(bytes, sequence) { commits.push({ bytes, sequence }); if (sequence === 1) { started(); await wait; } } } });
  t.after(() => store.close());
  store.put("account", { id: "first", status: "connected" });
  const first = store.flush(); await began;
  store.put("account", { id: "second", status: "connected" });
  const second = store.flush(); release();
  await Promise.all([first, second]);
  const db = openSnapshot(commits.at(-1).bytes);
  assert.equal(db.prepare("SELECT count(*) AS count FROM entities WHERE kind='account'").get().count, 2);
  assert.equal(commits.length, 2); db.close();
});

test("failed snapshot writes remain dirty and are retried at the next barrier", async t => {
  let calls = 0;
  const store = new SqliteStore(":memory:", { durability: { async persist() { if (++calls === 1) throw new Error("offline"); } } });
  t.after(() => store.close());
  store.put("account", { id: "account" });
  await assert.rejects(store.flush(), /offline/);
  await store.flush(); assert.equal(calls, 2);
});

test("restore rejects corruption without replacing an existing database", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "meadow-corrupt-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "bridge.sqlite");
  await fs.writeFile(filename, "existing");
  await assert.rejects(restoreDurableDatabase({ filename, url: "http://meadow.storage", fetchImpl: async () => new Response("corrupt", { headers: { "X-Meadow-Generation": "1", "X-Meadow-Sha256": "wrong" } }) }), error => error.code === "durable_restore_checksum");
  assert.equal(await fs.readFile(filename, "utf8"), "existing");
});

test("an abandoned migration cannot overwrite state after resume or a newer capture", async t => {
  const state = new DurableState(new MemoryStorage());
  const source = new SqliteStore(); t.after(() => source.close());
  source.put("account", { id: "account", status: "connected" });
  const originalGeneration = await state.setMaintenance();
  await state.resumeLegacy();
  const currentGeneration = await state.setMaintenance();
  await assert.rejects(state.install(source.db.serialize(), {}, originalGeneration), error => error.code === "durable_migration_generation_expired");
  await state.install(source.db.serialize(), {}, currentGeneration);
  assert.equal((await state.status()).initialized, true);
});

test("HTTP redirects wait for persistence and failures never acknowledge success", async t => {
  let release;
  let fail = false;
  const wait = new Promise(resolve => { release = resolve; });
  const app = express();
  app.use(durableResponseBarrier({ async flush() { await wait; if (fail) throw new Error("offline"); } }));
  app.get("/connect", (req, res) => res.redirect("/connected"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  let resolved = false;
  const first = fetch(`http://127.0.0.1:${server.address().port}/connect`, { redirect: "manual" }).then(response => { resolved = true; return response; });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(resolved, false); release();
  assert.equal((await first).status, 302);
  fail = true;
  const failed = await fetch(`http://127.0.0.1:${server.address().port}/connect`, { redirect: "manual" });
  assert.equal(failed.status, 503); assert.equal(failed.headers.get("Location"), null);
  assert.equal((await failed.json()).code, "durable_storage_unavailable");
});

test("snapshot bytes and wake metadata represent the same state before asynchronous persistence", async t => {
  let release, began;
  const wait = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { began = resolve; });
  const snapshots = [];
  const store = new SqliteStore(":memory:", { durability: { async persist(bytes, sequence, metadata) { snapshots.push({ bytes, metadata }); if (sequence === 1) { began(); await wait; } } } });
  t.after(() => store.close());
  store.nextBackgroundWakeAt = () => {
    const items = store.list("dropperItem", { status: "queued" });
    return items.length ? Math.min(...items.map(item => item.slotAt)) : null;
  };
  store.put("dropperItem", { id: "later", status: "queued", slotAt: 2000 });
  const first = store.flush(); await started;
  store.put("dropperItem", { id: "earlier", status: "queued", slotAt: 1000 });
  const second = store.flush(); release();
  await Promise.all([first, second]);
  assert.deepEqual(snapshots.map(item => item.metadata.nextWakeAt), [2000, 1000]);
  for (const snapshot of snapshots) {
    const database = openSnapshot(snapshot.bytes);
    const minimum = database.prepare("SELECT MIN(json_extract(data,'$.slotAt')) AS deadline FROM entities WHERE kind='dropperItem'").get().deadline;
    assert.equal(snapshot.metadata.nextWakeAt, minimum);
    database.close();
  }
  store.remove("dropperItem", "earlier");
  store.remove("dropperItem", "later");
  await store.flush();
  assert.equal(snapshots.at(-1).metadata.nextWakeAt, null);
});

test("durable wake headers distinguish a deadline, an idle queue, and a legacy caller", async () => {
  const calls = [];
  const database = new DurableDatabase({ url: "http://meadow.storage", generation: 3, fetchImpl: async (url, init) => {
    calls.push(init);
    const wake = init.headers["X-Meadow-Next-Wake-At"];
    return Response.json({ generation: 3, sequence: Number(init.headers["X-Meadow-Sequence"]), sha256: init.headers["X-Meadow-Sha256"], ...(wake !== undefined ? { nextWakeAt: wake === "none" ? null : Number(wake) } : {}) });
  } });
  await database.persist(Buffer.from("fixture"), 1, { nextWakeAt: 1791504000000 });
  await database.persist(Buffer.from("fixture"), 2, { nextWakeAt: null });
  await database.persist(Buffer.from("fixture"), 3);
  assert.equal(calls[0].headers["X-Meadow-Next-Wake-At"], "1791504000000");
  assert.equal(calls[1].headers["X-Meadow-Next-Wake-At"], "none");
  assert.equal(Object.hasOwn(calls[2].headers, "X-Meadow-Next-Wake-At"), false);
  await assert.rejects(database.persist(Buffer.from("fixture"), 4, { nextWakeAt: "tomorrow" }), error => error.code === "durable_wake_invalid");
  assert.equal(calls.length, 3);
});

test("explicit wake deadlines are not acknowledged unless durable storage confirms them", async () => {
  const database = new DurableDatabase({ url: "http://meadow.storage", generation: 1, fetchImpl: async (url, init) => Response.json({ generation: 1, sequence: 1, sha256: init.headers["X-Meadow-Sha256"] }) });
  await assert.rejects(database.persist(Buffer.from("fixture"), 1, { nextWakeAt: 1791504000000 }), error => error.code === "durable_wake_unconfirmed");
  await assert.rejects(database.persist(Buffer.from("fixture"), 1, { nextWakeAt: null }), error => error.code === "durable_wake_unconfirmed");
});
