import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { DurableState, snapshotHash } from "../../cloudflare/durableState.js";
import { createPublishingWake, currentPublishingWake, parseNextWakeHeader, publishingWakePlan } from "../../cloudflare/publishingWake.js";

const NOW = 1791504000000;
const metadata = (patch = {}) => ({ initialized: true, mode: "ready", generation: 3, sequence: 12, nextWakeAt: NOW, ...patch });
const payload = status => ({ generation: status.generation, sequence: status.sequence, nextWakeAt: status.nextWakeAt, retryCount: 0 });

function schedulerFixture(patch = {}) {
  const fixture = { status: metadata(), scheduled: [], events: [], now: NOW, health: async () => new Response("ok"), reads: 0, ...patch };
  fixture.scheduler = createPublishingWake({
    readStatus: async () => { fixture.reads++; await fixture.onRead?.(fixture); return { ...fixture.status }; },
    listSchedules: async name => { assert.equal(name, "wakePublishing"); await fixture.onList?.(fixture); return fixture.scheduled; },
    deleteSchedules: name => { assert.equal(name, "wakePublishing"); fixture.events.push("clear"); fixture.scheduled = []; },
    schedule: async (date, callback, entry) => {
      assert.ok(date instanceof Date); assert.equal(callback, "wakePublishing");
      fixture.events.push("schedule"); fixture.scheduled.push({ time: date.getTime() / 1000, payload: entry });
      await fixture.onSchedule?.(fixture);
    },
    health: async () => { fixture.events.push("health"); return fixture.health(fixture); },
    stopFailedRestore: async () => fixture.events.push("stop"),
    clock: () => fixture.now,
  });
  return fixture;
}

test("a deadline past the two-hour sleep window uses its exact durable future time", async () => {
  const fixture = schedulerFixture({ status: metadata({ nextWakeAt: NOW + 8 * 3600000 }) });
  await fixture.scheduler.reconcile();
  assert.equal(fixture.scheduled[0].time * 1000, NOW + 8 * 3600000);
  assert.equal(currentPublishingWake(fixture.status, fixture.scheduled[0].payload), true);
  assert.equal(fixture.events.includes("health"), false);
});

test("stopped, idle, legacy and migration state do not wake publishing or retain its schedule", async () => {
  for (const patch of [{ nextWakeAt: null }, { nextWakeAt: undefined }, { mode: "legacy" }, { mode: "migration" }, { mode: "resuming" }, { initialized: false }]) {
    const old = metadata();
    const fixture = schedulerFixture({ status: metadata(patch), scheduled: [{ time: NOW / 1000, payload: payload(old) }] });
    assert.equal((await fixture.scheduler.wake(payload(old))).woke, false);
    await fixture.scheduler.reconcile();
    assert.deepEqual(fixture.scheduled, []);
    assert.equal(fixture.events.includes("health"), false);
  }
});

test("a stale generation, newer sequence, or changed deadline makes an old callback harmless", async () => {
  const old = metadata();
  for (const patch of [{ generation: 4 }, { sequence: 13 }, { nextWakeAt: NOW - 1000 }, { nextWakeAt: NOW + 3600000 }]) {
    const fixture = schedulerFixture({ status: metadata(patch) });
    assert.deepEqual(await fixture.scheduler.wake(payload(old)), { woke: false, stale: true });
    assert.equal(fixture.events.includes("health"), false);
    assert.equal(currentPublishingWake(fixture.status, fixture.scheduled[0].payload), true);
  }
});

test("an early callback rearms the precise future time instead of waking or losing its one-shot schedule", async () => {
  const fixture = schedulerFixture({ status: metadata({ nextWakeAt: NOW + 20050 }) });
  const result = await fixture.scheduler.wake(payload(fixture.status));
  assert.equal(result.early, true);
  assert.equal(fixture.scheduled[0].time * 1000, NOW + 21000);
  assert.equal(fixture.events.includes("health"), false);
});

test("Stop committing during a status lookup prevents the callback from starting the container", async () => {
  const old = metadata();
  const fixture = schedulerFixture({ onRead(item) { if (item.reads === 2) item.status = metadata({ sequence: 13, nextWakeAt: null }); } });
  assert.equal((await fixture.scheduler.wake(payload(old))).stale, true);
  assert.equal(fixture.events.includes("health"), false);
});

test("failed health and still-due work retry with delay bounded between one and five minutes", async () => {
  const fixture = schedulerFixture({ health: async () => { throw new Error("start unavailable"); } });
  let current = payload(fixture.status);
  for (let attempt = 0; attempt < 7; attempt++) {
    fixture.scheduled = [];
    assert.equal((await fixture.scheduler.wake(current)).failed, true);
    const next = fixture.scheduled[0];
    const delay = next.time * 1000 - fixture.now;
    assert.ok(delay >= 60000 && delay <= 300000);
    current = next.payload; fixture.now = next.time * 1000;
  }
  const healthy = schedulerFixture();
  await healthy.scheduler.wake(payload(healthy.status));
  assert.equal(healthy.scheduled[0].time * 1000 - NOW, 60000);
});

test("a fresh snapshot during schedule replacement wins, including a committed Stop", async () => {
  for (const deadline of [NOW + 8 * 3600000, null]) {
    const fixture = schedulerFixture({ onSchedule(item) { if (item.status.sequence === 12) item.status = metadata({ sequence: 13, nextWakeAt: deadline }); } });
    await fixture.scheduler.reconcile();
    if (deadline === null) assert.deepEqual(fixture.scheduled, []);
    else { assert.equal(fixture.scheduled[0].time * 1000, deadline); assert.equal(fixture.scheduled[0].payload.sequence, 13); }
  }
});

test("the awaited schedule lookup cannot replace a newer committed deadline", async () => {
  const fixture = schedulerFixture({ onList(item) { if (item.status.sequence === 12) item.status = metadata({ sequence: 13, nextWakeAt: NOW + 200000 }); } });
  await fixture.scheduler.reconcile();
  assert.equal(fixture.scheduled[0].time * 1000, NOW + 200000);
  assert.equal(fixture.scheduled[0].payload.sequence, 13);
});

test("health-triggered restore and ready can reconcile without the health call holding the schedule lock", async () => {
  const fixture = schedulerFixture({ async health(item) {
    item.status = metadata({ generation: 4, sequence: 1, mode: "restoring" });
    await item.scheduler.reconcile();
    item.status = metadata({ generation: 4, sequence: 1, nextWakeAt: NOW + 8 * 3600000 });
    await item.scheduler.reconcile();
    return new Response("ok");
  } });
  await fixture.scheduler.wake(payload(fixture.status));
  assert.equal(fixture.scheduled[0].payload.generation, 4);
  assert.equal(fixture.scheduled[0].time * 1000, NOW + 8 * 3600000);
});

test("ordinary startup failing after restore claim replaces its old generation alarm without waking stale work", async () => {
  const old = metadata();
  const fixture = schedulerFixture({ status: metadata({ generation: 4, sequence: 0, mode: "restoring" }), health: async () => Response.json({ code: "startup_failed" }, { status: 503 }) });
  const result = await fixture.scheduler.wake(payload(old));
  assert.equal(result.stale, true);
  assert.equal(fixture.events.includes("health"), false);
  const replacement = fixture.scheduled[0];
  assert.equal(replacement.payload.generation, 4);
  fixture.now = replacement.time * 1000;
  await fixture.scheduler.wake(replacement.payload);
  assert.equal(fixture.events.includes("health"), true);
  assert.ok(fixture.events.lastIndexOf("schedule") < fixture.events.indexOf("stop"));
  assert.equal(fixture.scheduled[0].time * 1000 - fixture.now, 60000);
});

test("an unrelated snapshot updates the guard without shortening an already armed retry", () => {
  const old = metadata();
  const next = metadata({ sequence: 13 });
  const plan = publishingWakePlan(next, { time: (NOW + 120000) / 1000, payload: { ...payload(old), retryCount: 2 } }, NOW);
  assert.equal(plan.wakeAt, NOW + 120000);
  assert.equal(plan.payload.sequence, 13);
  assert.equal(plan.payload.retryCount, 2);
});

class MemoryStorage {
  constructor(map = new Map()) { this.map = map; this.tail = Promise.resolve(); }
  async get(key) { return structuredClone(this.map.get(key)); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { this.map.delete(key); }
  transaction(fn) {
    const result = this.tail.then(async () => { const tx = new MemoryStorage(structuredClone(this.map)); const result = await fn(tx); this.map = tx.map; return result; });
    this.tail = result.catch(() => {}); return result;
  }
}
const bytes = () => { const data = new Uint8Array(100); data.set(new TextEncoder().encode("SQLite format 3\0")); return data; };

async function stateFixture() {
  const state = new DurableState(new MemoryStorage());
  const data = bytes(), hash = await snapshotHash(data);
  await state.install(data); const claimed = await state.claim(); await state.ready(claimed.generation);
  return { state, data, hash, generation: claimed.generation };
}

test("snapshot deadline is committed with sequence and idempotent retries cannot change it", async () => {
  const { state, data, hash, generation } = await stateFixture();
  await state.commit(data, generation, 1, hash, { nextWakeAt: NOW });
  assert.equal((await state.status()).nextWakeAt, NOW);
  await state.commit(data, generation, 1, hash, { nextWakeAt: NOW });
  await assert.rejects(state.commit(data, generation, 1, hash, { nextWakeAt: null }), error => error.code === "durable_sequence_conflict");
  await assert.rejects(state.commit(data, generation - 1, 2, hash, { nextWakeAt: null }), error => error.code === "durable_generation_expired");
  assert.equal((await state.status()).sequence, 1);
  assert.equal((await state.status()).nextWakeAt, NOW);
  await state.commit(data, generation, 2, hash);
  assert.equal((await state.status()).nextWakeAt, NOW);
  await state.commit(data, generation, 3, hash, { nextWakeAt: null });
  assert.equal((await state.status()).nextWakeAt, null);
});

test("HTTP snapshot acknowledges its wake metadata and invalid headers never mutate the sequence", async () => {
  const { state, data, hash, generation } = await stateFixture();
  const request = (sequence, wake) => new Request("http://storage/snapshot", { method: "POST", headers: { "X-Meadow-Generation": String(generation), "X-Meadow-Sequence": String(sequence), "X-Meadow-Sha256": hash, ...(wake !== undefined ? { "X-Meadow-Next-Wake-At": wake } : {}) }, body: data });
  const response = await state.handle(request(1, String(NOW)));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).nextWakeAt, NOW);
  for (const invalid of ["", "0", "-1", "1.5", "1e12", "+1", "Infinity", "NaN", "9007199254740992"]) {
    assert.equal((await state.handle(request(2, invalid))).status, 400);
    assert.equal((await state.status()).sequence, 1);
  }
  assert.equal((await state.handle(request(2))).status, 200);
  assert.equal((await state.status()).nextWakeAt, NOW);
  assert.equal((await state.handle(request(3, "none"))).status, 200);
  assert.equal((await state.status()).nextWakeAt, null);
  assert.equal(parseNextWakeHeader(null), undefined);
});

test("restore preserves the pending wake metadata while fencing the old generation", async () => {
  const { state, data, hash, generation } = await stateFixture();
  await state.commit(data, generation, 1, hash, { nextWakeAt: NOW + 8 * 3600000 });
  await state.claim();
  const current = await state.status();
  assert.equal(current.mode, "restoring");
  assert.equal(current.nextWakeAt, NOW + 8 * 3600000);
  assert.equal(currentPublishingWake(current, { ...payload(current) }), true);
  assert.equal(currentPublishingWake(current, { ...payload(current), generation }), false);
});

test("actual Container adapter probes restoring startup failures through base fetch and arms before stopping", async () => {
  const worker = await readFile(new URL("../../cloudflare/worker.js", import.meta.url), "utf8");
  const classSource = worker.slice(worker.indexOf("export class PodcastClipperBackend"), worker.indexOf("\nPodcastClipperBackend.outboundByHost")).replace("export class", "class");
  class FakeContainer {
    constructor(status, healthStatus = 503, healthCode = "startup_failed") { this.ctx = { storage: { status }, container: { running: true } }; this.events = []; this.schedules = []; this.healthStatus = healthStatus; this.healthCode = healthCode; }
    async fetch() { this.events.push("base-health"); return Response.json({ code: this.healthCode }, { status: this.healthStatus }); }
    async listSchedules() { return this.schedules; }
    deleteSchedules() { this.schedules = []; }
    async schedule(date, callback, value) { assert.equal(callback, "wakePublishing"); this.events.push("schedule"); this.schedules = [{ time: date.getTime() / 1000, payload: value }]; }
    async stop() { this.events.push("stop"); }
  }
  class FakeState { constructor(storage) { this.storage = storage; } async status() { return { ...this.storage.status }; } }
  const Backend = vm.runInNewContext(`${classSource}\nPodcastClipperBackend`, { Container: FakeContainer, DurableState: FakeState, createPublishingWake, env: {}, definedEnv: value => value, Request, Response, Date, console });
  for (const [mode, healthStatus, healthCode, expectedHealth, expectedStop] of [["restoring", 503, "startup_failed", true, true], ["restoring", 200, "startup_failed", true, false], ["ready", 503, "startup_failed", true, true], ["ready", 503, "unavailable", true, false], ["ready", 200, "ok", true, false], ["migration", 503, "startup_failed", false, false], ["legacy", 503, "startup_failed", false, false], ["resuming", 503, "startup_failed", false, false]]) {
    const status = metadata({ mode, nextWakeAt: 1 });
    const backend = new Backend(status, healthStatus, healthCode);
    await backend.wakePublishing(payload(status));
    assert.equal(backend.events.includes("base-health"), expectedHealth, mode);
    assert.equal(backend.events.includes("stop"), expectedStop, mode);
    if (expectedStop) {
      assert.ok(backend.events.indexOf("schedule") < backend.events.indexOf("stop"));
      assert.ok(backend.schedules[0].time * 1000 >= Date.now() + 59000);
    }
  }
});
