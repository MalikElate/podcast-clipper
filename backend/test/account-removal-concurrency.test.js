import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { connectionDisclosure } from "../src/bridge/platforms/connectionPrivacy.js";

const DAY = 86400000;
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}

function fixture(t, { persistent = false } = {}) {
  let now = Date.parse("2026-09-23T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-removal-concurrency-"));
  const providers = Object.fromEntries(["x", "pinterest", "youtube", "google_business", "tiktok", "twitch", "kick"].map(platform => {
    const provider = new PlatformProvider(platform, { env: {}, clock: () => now });
    provider.authorizationUrl = async ({ state }) => `https://social.example/authorize?state=${state}`;
    provider.exchange = async ({ code }) => ({ accessToken: `new-${code}`, expiresAt: now + 30 * DAY });
    provider.accounts = async credentials => [{ remoteId: credentials.accessToken.slice(4), label: "Fresh account" }];
    provider.revoke = async () => ({ remoteRevocation: true });
    return [platform, provider];
  }));
  const options = {
    registry: new ProviderRegistry(Object.values(providers)), clock: () => now,
    deleteIdentity: async () => {}, deleteAnalytics: async () => true,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "removal-test", BRIDGE_APP_URL: "https://meadow.example", BRIDGE_PUBLIC_URL: "https://meadow.example", TIKTOK_CLIENT_KEY: "test-client", TIKTOK_CLIENT_SECRET: "test-secret" },
  };
  const createApp = () => new BridgeApplication({ ...options, store: new SqliteStore(persistent ? path.join(dir, "bridge.sqlite") : undefined) });
  let app = createApp();
  const project = app.projects.create("alice", { name: "Alice" });
  const account = (id, platform = "x", overrides = {}) => app.store.put("account", {
    id, ownerUid: "alice", projectId: project.id, platform, remoteId: id, label: `Old ${id}`, status: "connected", rateKey: `${platform}:${id}`,
    authorizationId: `old-${id}`, authorizationGrantedAt: now, createdAt: now, profileUpdatedAt: now, profileAttemptedAt: now,
    encryptedCredentials: app.vault.encrypt({ accessToken: `old-${id}`, expiresAt: now + 30 * DAY }, `account:${id}`), ...overrides,
  });
  const start = async (platform = "x", remoteId = "new-account") => {
    const disclosure = connectionDisclosure(platform);
    const consent = disclosure && { accepted: true, platform, version: disclosure.version };
    const { url } = await app.accounts.start("alice", project.id, platform, { consent });
    const state = new URL(url).searchParams.get("state");
    return () => app.accounts.callback(platform, new URLSearchParams({ state, code: remoteId }));
  };
  const post = (id, account) => {
    app.store.put("post", { id, ownerUid: "alice", projectId: project.id, caption: id, accountIds: [account.id], mediaIds: [], overrides: { [account.id]: {} }, status: "published", createdAt: now });
    app.store.put("delivery", { id: `${id}-delivery`, ownerUid: "alice", projectId: project.id, accountId: account.id, postId: id, status: "published", metrics: { views: 12 }, createdAt: now });
  };
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { get app() { return app; }, providers, project, account, start, post, now: () => now, advance: ms => { now += ms; }, restart: () => { assert.ok(persistent); app.close(); app = createApp(); } };
}

function tiktokEvent(h, createTime, reason = 1) {
  const raw = Buffer.from(JSON.stringify({ client_key: "test-client", event: "authorization.removed", user_openid: "old", create_time: createTime, content: JSON.stringify({ reason }) }));
  const timestamp = Math.floor(h.now() / 1000);
  const signature = `t=${timestamp},s=${createHmac("sha256", "test-secret").update(`${timestamp}.`).update(raw).digest("hex")}`;
  return { raw, signature };
}

test("account lists immediately hide explicit removals and retain reconnect-required accounts", async t => {
  const h = fixture(t);
  h.account("connected");
  h.account("needs-login", "x", { status: "reconnect_required" });
  h.account("legacy-removed", "x", { status: "disconnected" });
  const removed = h.account("being-removed", "pinterest");
  h.app.accounts.disconnect("alice", h.project.id, removed.id);
  const expected = ["connected", "needs-login"];
  assert.deepEqual(h.app.accounts.list("alice", h.project.id).map(account => account.id).sort(), expected);
  assert.deepEqual((await h.app.accounts.listFresh("alice", h.project.id)).map(account => account.id).sort(), expected);
  assert.equal(h.app.store.get("account", removed.id).status, "deleting", "cleanup retains its private record until erasure completes");
});

for (const remoteId of ["old-account", "another-account"]) test(`local cleanup allows a fresh same-platform authorization for ${remoteId}`, async t => {
  const h = fixture(t), old = h.account("old-account"), entered = deferred(), release = deferred();
  h.post("old-post", old);
  const held = h.app.locks.withLock(`publishing:${old.rateKey}`, async () => { entered.resolve(); await release.promise; });
  await entered.promise;
  let fresh;
  try {
    h.app.accounts.disconnect("alice", h.project.id, old.id);
    await h.app.privacy.tick();
    const complete = await h.start("x", remoteId);
    [fresh] = (await complete()).accounts;
    assert.notEqual(fresh.id, old.id, "the removal job must continue to own the old ID");
    assert.equal(h.app.store.get("account", old.id).status, "deleting");
    h.post("fresh-post", fresh);
  } finally { release.resolve(); await held; }

  h.advance(60001);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", old.id), null);
  assert.equal(h.app.store.get("delivery", "old-post-delivery"), null);
  assert.deepEqual(h.app.store.get("post", "old-post").accountIds, []);
  assert.equal(h.app.store.get("post", "old-post").caption, "old-post");
  assert.equal(h.app.store.get("account", fresh.id).status, "connected");
  assert.ok(h.app.store.get("delivery", "fresh-post-delivery"));
  assert.deepEqual(h.app.store.get("post", "fresh-post").accountIds, [fresh.id]);
  assert.equal((await h.app.accounts.credentials(fresh)).accessToken, `new-${remoteId}`);
  assert.deepEqual(h.app.store.list("revocation"), []);
});

test("a second disconnect rejects an in-flight callback even in the same clock millisecond", async t => {
  const h = fixture(t), old = h.account("old"), other = h.account("other");
  h.app.accounts.disconnect("alice", h.project.id, old.id);
  const complete = await h.start("x", "old"), entered = deferred(), release = deferred();
  h.providers.x.exchange = async () => { entered.resolve(); await release.promise; return { accessToken: "new-old" }; };
  const callback = complete();
  await entered.promise;
  h.app.accounts.disconnect("alice", h.project.id, other.id);
  release.resolve();
  await assert.rejects(callback, /predates connection removal/);
  assert.deepEqual(h.app.store.list("connection"), []);
  assert.deepEqual(h.app.accounts.list("alice", h.project.id), []);
});

for (const platform of ["youtube", "google_business", "tiktok", "twitch", "kick"]) test(`${platform} blocks new grants until old remote revocation finishes, without blocking other platforms`, async t => {
  const h = fixture(t), old = h.account("old", platform);
  h.app.accounts.disconnect("alice", h.project.id, old.id);
  await assert.rejects(h.start(platform), error => error.code === "connection_removal_pending");
  if (platform === "youtube") await assert.rejects(h.start("google_business"), error => error.code === "connection_removal_pending");
  if (platform === "google_business") await assert.rejects(h.start("youtube"), error => error.code === "connection_removal_pending");
  const unrelated = (await (await h.start("x"))()).accounts[0];
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", old.id), null);
  await assert.rejects(h.start(platform), error => error.code === "authorization_removal_pending");

  const entered = deferred(), release = deferred();
  h.providers[platform].revoke = async credentials => { assert.equal(credentials.accessToken, "old-old"); entered.resolve(); await release.promise; };
  const revoking = h.app.privacy.tick();
  await entered.promise;
  try { await assert.rejects(h.start(platform), error => error.code === "authorization_removal_pending"); }
  finally { release.resolve(); await revoking; }
  const fresh = (await (await h.start(platform, "old"))()).accounts[0];
  assert.notEqual(fresh.id, old.id);
  assert.equal((await h.app.accounts.credentials(fresh)).accessToken, "new-old");
  assert.equal(h.app.store.get("account", unrelated.id).status, "connected");
});

for (const platform of ["youtube", "tiktok"]) test(`${platform} can reconnect during local cleanup after its old grant is already revoked`, async t => {
  const h = fixture(t), old = h.account("old", platform);
  h.post("old-post", old);
  h.app.privacy.requestConnection("alice", h.project.id, old.id, { alreadyRevoked: true });
  const fresh = (await (await h.start(platform, "old"))()).accounts[0];
  assert.notEqual(fresh.id, old.id);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", old.id), null);
  assert.equal(h.app.store.get("delivery", "old-post-delivery"), null);
  assert.equal(h.app.store.get("account", fresh.id).status, "connected");
  assert.deepEqual(h.app.store.list("revocation"), []);
});

test("attachment independently rejects a remote revocation that began after account selection was offered", async t => {
  const h = fixture(t);
  h.providers.tiktok.accounts = async () => [{ remoteId: "one", label: "One" }, { remoteId: "two", label: "Two" }];
  const pending = await (await h.start("tiktok"))();
  h.app.store.put("revocation", { id: "old-revocation", ownerUid: "alice", platform: "tiktok", status: "pending" });
  assert.throws(() => h.app.accounts.attach("alice", h.project.id, pending.connectionId, ["one"]), error => error.code === "authorization_removal_pending");
  assert.deepEqual(h.app.store.list("account"), []);
});

test("deleting the entire Meadow account still blocks every new authorization", async t => {
  const h = fixture(t);
  h.account("old");
  h.app.privacy.requestAccount("alice", { confirmation: "DELETE" });
  await assert.rejects(h.start("x"), error => error.code === "account_deleting");
});

test("TikTok removal retries cannot erase a same-second reconnect before cleanup, after cleanup, or after restart", async t => {
  const h = fixture(t, { persistent: true }), old = h.account("old", "tiktok"), seconds = Math.floor(h.now() / 1000);
  const original = tiktokEvent(h, seconds);
  h.app.privacy.tiktokWebhook(original.raw, original.signature);
  h.advance(300);
  const fresh = (await (await h.start("tiktok", "old"))()).accounts[0];
  h.app.privacy.tiktokWebhook(original.raw, original.signature);
  assert.equal(h.app.store.get("account", old.id).status, "deleting");
  assert.equal(h.app.store.get("account", fresh.id).status, "connected");
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", old.id), null);
  h.app.privacy.tiktokWebhook(original.raw, original.signature);
  assert.equal(h.app.store.get("account", fresh.id).status, "connected");
  h.restart();
  h.advance(1000);
  const retry = tiktokEvent(h, seconds);
  assert.notEqual(retry.signature, original.signature, "a new delivery signature must not bypass event deduplication");
  h.app.privacy.tiktokWebhook(retry.raw, retry.signature);
  assert.equal(h.app.store.get("account", fresh.id).status, "connected");
  const [receipt] = h.app.store.list("tiktokRemovalEvent");
  assert.match(receipt.id, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(receipt).sort(), ["createdAt", "expiresAt", "id", "revision"]);

  const genuinelyRemoved = tiktokEvent(h, Math.floor(h.now() / 1000));
  h.app.privacy.tiktokWebhook(genuinelyRemoved.raw, genuinelyRemoved.signature);
  assert.equal(h.app.store.get("account", fresh.id).status, "deleting", "a subsequent removal still revokes the fresh grant");
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", fresh.id), null);
  h.advance(3 * DAY + 5 * 60000);
  h.app.privacy.prune();
  assert.deepEqual(h.app.store.list("tiktokRemovalEvent"), [], "opaque receipts expire after TikTok's retry window");
});

test("a distinct same-second TikTok removal reason is still processed", async t => {
  const h = fixture(t), seconds = Math.floor(h.now() / 1000);
  h.account("old", "tiktok");
  const first = tiktokEvent(h, seconds, 1);
  h.app.privacy.tiktokWebhook(first.raw, first.signature);
  h.advance(300);
  const fresh = (await (await h.start("tiktok", "old"))()).accounts[0];
  const next = tiktokEvent(h, seconds, 4);
  h.app.privacy.tiktokWebhook(next.raw, next.signature);
  assert.equal(h.app.store.get("account", fresh.id).status, "deleting");
});

test("TikTok webhook acknowledgement waits until removal jobs and duplicate receipts are durable", { timeout: 5000 }, async t => {
  const h = fixture(t), old = h.account("old", "tiktok"), entered = deferred(), release = deferred();
  const event = tiktokEvent(h, Math.floor(h.now() / 1000));
  const server = h.app.app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const originalFlush = h.app.store.flush;
  h.app.store.flush = async () => { entered.resolve(); await release.promise; };
  let acknowledged = false;
  const response = fetch(`http://127.0.0.1:${server.address().port}/api/tiktok/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "tiktok-signature": event.signature }, body: event.raw }).then(value => { acknowledged = true; return value; });
  try {
    await entered.promise;
    assert.equal(acknowledged, false);
    assert.equal(h.app.store.get("account", old.id).status, "deleting");
    assert.equal(h.app.store.list("tiktokRemovalEvent").length, 1);
    release.resolve();
    assert.equal((await response).status, 200);
  } finally {
    release.resolve();
    h.app.store.flush = originalFlush;
    await new Promise(resolve => server.close(resolve));
  }
});
