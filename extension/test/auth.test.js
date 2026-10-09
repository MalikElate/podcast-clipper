import test from "node:test";
import assert from "node:assert/strict";
import { AUTH_STORAGE_KEY, LOGIN_STORAGE_KEY, createExtensionAuth, fetchMeadowJson } from "../src/auth.js";

const testKey = `br_live_${"1".repeat(16)}_${"A".repeat(43)}`;
const keyId = "1".repeat(16);
const approved = { status: "approved", apiKey: testKey, keyId, keyName: "FindMeadow for Chrome" };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const tick = () => new Promise(resolve => setImmediate(resolve));

function fakeChrome() {
  const events = [], access = [];
  const local = {}, session = {};
  const store = (area, values) => ({
    async setAccessLevel(value) { access.push({ area, ...value }); },
    async get(key) { return { [key]: structuredClone(values[key]) }; },
    async set(data) {
      const changes = {};
      for (const [key, value] of Object.entries(data)) { changes[key] = { oldValue: values[key], newValue: structuredClone(value) }; values[key] = structuredClone(value); }
      for (const callback of events) callback(changes, area);
    },
    async remove(key) {
      const changes = { [key]: { oldValue: values[key] } }; delete values[key];
      for (const callback of events) callback(changes, area);
    },
  });
  let tail = Promise.resolve();
  const lockManager = { request(name, options, action) {
    const next = tail.catch(() => {}).then(() => { options.signal?.throwIfAborted(); return action(); });
    tail = next; return next;
  } };
  return { local, session, access, lockManager, chromeApi: { storage: { local: store("local", local), session: store("session", session), onChanged: { addListener(fn) { events.push(fn); } } } } };
}

function login(now) {
  return { deviceCode: `meadow_agent_login_${"B".repeat(43)}`, userCode: "BCDF-GHJK", verificationUrlComplete: "https://app.findmeadow.com/dashboard/connect-agent?code=BCDF-GHJK", expiresAt: now + 600000, interval: 5 };
}

test("sign-in stays local and disconnected until explicit website approval is collected", async () => {
  const stores = fakeChrome(), calls = [], updates = [];
  let clock = 1000;
  const auth = createExtensionAuth({ chromeApi: stores.chromeApi, lockManager: stores.lockManager, now: () => clock, fetcher: async (url, options) => {
    calls.push({ url, options });
    return response(calls.length === 1 ? login(clock) : calls.length === 2 ? { status: "pending" } : approved, calls.length === 2 ? 202 : 200);
  } });
  auth.subscribe(value => updates.push(value));
  assert.deepEqual(await auth.status(), { status: "disconnected" });
  assert.equal(calls.length, 0);
  assert.deepEqual(stores.access.map(item => item.accessLevel), ["TRUSTED_CONTEXTS", "TRUSTED_CONTEXTS"]);
  const started = await auth.start();
  assert.equal(started.userCode, "BCDF-GHJK");
  assert.equal(started.expiresAt, 601000);
  assert.equal("deviceCode" in started, false);
  assert.equal(stores.local[AUTH_STORAGE_KEY], undefined);
  assert.deepEqual(await auth.start(), started, "reuse this pending approval instead of creating another");
  assert.equal(calls.length, 1);
  assert.equal((await auth.poll()).status, "pending");
  assert.equal(calls.length, 1, "honor the minimum polling interval");
  clock += 5000; assert.equal((await auth.poll()).status, "pending");
  clock += 5000; assert.deepEqual(await auth.poll(), { status: "approved", keyName: approved.keyName, keyId });
  assert.deepEqual(await auth.status(), { status: "connected", keyName: approved.keyName, keyId });
  assert.equal(await auth.getKey(), testKey);
  assert.equal(stores.session[LOGIN_STORAGE_KEY], undefined);
  await tick();
  assert.ok(updates.some(item => item.status === "connected"));
  assert.ok(!JSON.stringify(updates).includes(testKey));
  assert.ok(!JSON.stringify(updates).includes(login(1000).deviceCode));
  assert.ok(calls.every(call => call.options.credentials === "omit" && call.options.redirect === "error"));
  assert.ok(calls.every(call => !call.options.headers.Authorization));
  assert.deepEqual(JSON.parse(calls[0].options.body), { agentName: "FindMeadow for Chrome" });
});

test("disconnect while an approval response is pending cannot restore the key", async () => {
  const stores = fakeChrome(); let clock = 1000, deliver, started;
  const arrived = new Promise(resolve => { started = resolve; });
  const auth = createExtensionAuth({ chromeApi: stores.chromeApi, lockManager: stores.lockManager, now: () => clock, fetcher: async (url, { signal }) => {
    if (!url.endsWith("/poll")) return response(login(clock));
    started(); return new Promise((resolve, reject) => { deliver = resolve; signal.addEventListener("abort", () => reject(signal.reason), { once: true }); });
  } });
  await auth.start(); clock += 5000;
  const collecting = auth.poll(); const cancelled = assert.rejects(collecting, { name: "AbortError" });
  await arrived; await auth.disconnect();
  deliver(response(approved));
  await cancelled;
  assert.deepEqual(await auth.status(), { status: "disconnected" });
  assert.equal(stores.local[AUTH_STORAGE_KEY], undefined);
});

test("expired and denied approvals clear their pending secret without reconnecting automatically", async () => {
  for (const status of [403, 410]) {
    const stores = fakeChrome(); let clock = 1000, requests = 0;
    const auth = createExtensionAuth({ chromeApi: stores.chromeApi, lockManager: stores.lockManager, now: () => clock, fetcher: async () => {
      requests++; return requests === 1 ? response(login(clock)) : response({ error: "Sign-in unavailable", code: status === 410 ? "expired_token" : "access_denied" }, status);
    } });
    await auth.start(); clock += 5000;
    await assert.rejects(auth.poll(), error => error.status === status);
    assert.deepEqual(await auth.status(), { status: "disconnected" });
    assert.equal(stores.session[LOGIN_STORAGE_KEY], undefined);
    assert.equal(requests, 2);
  }
});

test("reject unknown verification hosts and keep disconnected on aborted sign-in", async () => {
  const stores = fakeChrome();
  const auth = createExtensionAuth({ chromeApi: stores.chromeApi, lockManager: stores.lockManager, now: () => 1000, fetcher: async () => response({ ...login(1000), verificationUrlComplete: "https://attacker.example/dashboard/connect-agent?code=BCDF-GHJK" }) });
  await assert.rejects(auth.start(), /invalid sign-in/);
  assert.equal(stores.session[LOGIN_STORAGE_KEY], undefined);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(auth.start({ signal: controller.signal }), { name: "AbortError" });
  assert.equal(stores.local[AUTH_STORAGE_KEY], undefined);
});

test("an old failed key cannot disconnect a newly approved key", async () => {
  const stores = fakeChrome();
  stores.local[AUTH_STORAGE_KEY] = { key: testKey, keyId, keyName: "Chrome" };
  const auth = createExtensionAuth({ chromeApi: stores.chromeApi, lockManager: stores.lockManager });
  const replacement = { key: `br_live_${"2".repeat(16)}_${"C".repeat(43)}`, keyId: "2".repeat(16), keyName: "New connection" };
  await stores.chromeApi.storage.local.set({ [AUTH_STORAGE_KEY]: replacement });
  await auth.invalidateKey(testKey);
  assert.equal(await auth.getKey(), replacement.key);
  await auth.invalidateKey(replacement.key);
  assert.deepEqual(await auth.status(), { status: "disconnected" });
});

test("two extension editors serialize start and collect one approval without losing its key", async () => {
  const stores = fakeChrome(); let clock = 1000, starts = 0, polls = 0;
  const fetcher = async url => {
    if (!url.endsWith("/poll")) { starts++; await tick(); return response(login(clock)); }
    polls++; await tick(); return polls === 1 ? response(approved) : response({ error: "Already collected" }, 410);
  };
  const options = { chromeApi: stores.chromeApi, lockManager: stores.lockManager, now: () => clock, fetcher };
  const first = createExtensionAuth(options), second = createExtensionAuth(options);
  const [one, two] = await Promise.all([first.start(), second.start()]);
  assert.deepEqual(one, two); assert.equal(starts, 1);
  clock += 5000;
  const outcomes = await Promise.all([first.poll(), second.poll()]);
  assert.ok(outcomes.every(value => value.status === "approved"));
  assert.equal(polls, 1, "only one context consumes the approval");
  assert.equal(await first.getKey(), testKey); assert.equal(await second.getKey(), testKey);
  assert.equal(stores.session[LOGIN_STORAGE_KEY], undefined);
});

test("network timeouts and caller cancellation terminate a single request", async () => {
  let requests = 0;
  const fetcher = (_, { signal }) => {
    requests++;
    return new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(signal.reason), { once: true }); });
  };
  await assert.rejects(fetchMeadowJson("/api/agent-login", { method: "POST", body: {}, fetcher, timeoutMs: 5 }), error => error.code === "request_timeout");
  const controller = new AbortController();
  const request = fetchMeadowJson("/api/agent-login/poll", { method: "POST", body: {}, fetcher, signal: controller.signal });
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  assert.equal(requests, 2);
});
