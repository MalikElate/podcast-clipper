import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { FacebookProvider, InstagramProvider, ThreadsProvider } from "../src/bridge/platforms/MetaProviders.js";

const DAY = 86400000;
class Provider extends PlatformProvider {
  get configured() { return true; }
  async exchange() { return { accessToken: "fixture-token" }; }
}
function fixture(t, { persistent = false } = {}) {
  let now = Date.parse("2026-09-15T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-meta-privacy-"));
  const env = { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test-media", BRIDGE_PUBLIC_URL: "https://meadow.example", FACEBOOK_CLIENT_SECRET: "facebook-fixture", INSTAGRAM_CLIENT_SECRET: "instagram-fixture", THREADS_CLIENT_SECRET: "threads-fixture" };
  const providers = Object.fromEntries(["facebook", "instagram", "threads"].map(id => [id, new Provider(id)]));
  const options = { env, clock: () => now, registry: new ProviderRegistry(Object.values(providers)), authMiddleware: (req, res) => res.sendStatus(401) };
  let app = new BridgeApplication({ ...options, ...(persistent ? {} : { store: new SqliteStore() }) });
  const project = app.projects.create("alice", { name: "Alice" });
  const account = (id, platform, subject, overrides = {}) => {
    const record = { id, ownerUid: "alice", projectId: project.id, platform, remoteId: id, label: "Fixture account", status: "connected", rateKey: `${platform}:${id}`, authorizationId: id, authorizationStartedAt: now - 10000, authorizationGrantedAt: now - 5000, createdAt: now - 10000, ...overrides };
    return app.store.put("account", { ...record, encryptedCredentials: app.vault.encrypt({ accessToken: `fixture-${id}`, metaUserIds: [subject] }, `account:${id}`) });
  };
  const signed = (platform, subject = "123456789123", extra = {}) => {
    const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: subject, issued_at: Math.floor(now / 1000), ...extra })).toString("base64url");
    return `${createHmac("sha256", env[`${platform.toUpperCase()}_CLIENT_SECRET`]).update(payload).digest("base64url")}.${payload}`;
  };
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { get app() { return app; }, project, account, signed, providers, env, now: () => now, advance: ms => { now += ms; }, restart: () => { app.close(); app = new BridgeApplication(options); } };
}

test("Meta callbacks authenticate product-specific signatures and reject malformed or unsafe payloads without mutations", t => {
  const h = fixture(t); h.account("page", "facebook", "123456789123");
  const valid = h.signed("facebook");
  for (const value of [undefined, [valid], "", "bad.payload", `${valid}x`, h.signed("instagram"), h.signed("facebook", "123456789123", { algorithm: "none" }), h.signed("facebook", "<script>"), h.signed("facebook", "123456789123", { issued_at: 0 }), h.signed("facebook", "123456789123", { issued_at: Math.floor(h.now() / 1000) + 301 })]) {
    assert.throws(() => h.app.metaPrivacy.receive("facebook", value), /Invalid Meta signed request/);
  }
  assert.throws(() => h.app.metaPrivacy.receive("__proto__", valid), /Unknown Meta/);
  delete h.env.THREADS_CLIENT_SECRET;
  assert.throws(() => h.app.metaPrivacy.receive("threads", valid), /not configured/);
  assert.equal(h.app.store.list("erasure").length, 0);
  assert.equal(h.app.store.get("account", "page").status, "connected");
});

test("signed deletion removes only the authorizing Meta user's connections, including shared workspaces, and preserves originals", async t => {
  const h = fixture(t), app = h.app;
  const bobProject = app.projects.create("bob", { name: "Bob" });
  const page = h.account("page-a", "facebook", "123456789123");
  h.account("page-b", "facebook", "123456789123", { ownerUid: "bob", projectId: bobProject.id });
  h.account("unrelated-grant", "facebook", "999", { remoteId: page.remoteId });
  h.account("123456789123", "facebook", "999"); // A Page ID must never be mistaken for a user ID.
  h.account("ig", "instagram", "123456789123");
  app.store.put("post", { id: "draft", ownerUid: "alice", projectId: h.project.id, caption: "Original caption", accountIds: [page.id, "ig"], overrides: { [page.id]: { settings: {} } } });
  app.store.put("delivery", { id: "delivery", ownerUid: "alice", projectId: h.project.id, postId: "draft", accountId: page.id, platform: "facebook", status: "queued", rateKey: page.rateKey });
  const result = app.metaPrivacy.receive("facebook", h.signed("facebook"));
  assert.equal(app.store.get("delivery", "delivery").status, "cancelled");
  assert.equal(app.metaPrivacy.status(result.confirmation_code).status, "pending");
  await app.privacy.tick();
  assert.equal(app.metaPrivacy.status(result.confirmation_code).status, "complete");
  for (const id of ["page-a", "page-b"]) assert.equal(app.store.get("account", id), null);
  for (const id of ["unrelated-grant", "123456789123", "ig"]) assert.equal(app.store.get("account", id).status, "connected");
  assert.equal(app.store.get("delivery", "delivery"), null);
  assert.equal(app.store.get("post", "draft").caption, "Original caption");
  assert.deepEqual(app.store.get("post", "draft").accountIds, ["ig"]);
  const receipt = JSON.stringify(app.store.get("metaRemovalReceipt", result.confirmation_code));
  for (const sensitive of ["123456789123", "alice", "bob", "fixture-token", "Fixture account"]) assert.ok(!receipt.includes(sensitive));
});

test("removal receipts survive restart and retries cannot delete a newly authorized connection", async t => {
  const h = fixture(t, { persistent: true }); h.account("threads", "threads", "123456789123");
  const signed = h.signed("threads"), result = h.app.metaPrivacy.receive("threads", signed);
  h.restart();
  assert.deepEqual(h.app.metaPrivacy.receive("threads", signed), result);
  await h.app.privacy.tick();
  h.advance(2000);
  h.account("threads-new", "threads", "123456789123", { authorizationStartedAt: h.now(), authorizationGrantedAt: h.now() });
  assert.deepEqual(h.app.metaPrivacy.receive("threads", signed), result);
  assert.equal(h.app.metaPrivacy.status(result.confirmation_code).status, "complete");
  assert.equal(h.app.store.get("account", "threads-new").status, "connected");
  // A delayed, distinct request from before the new authorization also preserves it.
  h.app.metaPrivacy.receive("threads", h.signed("threads", "123456789123", { issued_at: Math.floor(h.now() / 1000) - 1 }));
  assert.equal(h.app.store.get("account", "threads-new").status, "connected");
});

test("Meta removal clears pending selections and blocks an OAuth callback already in flight", async t => {
  const h = fixture(t), app = h.app;
  const candidates = [{ remoteId: "page", label: "Page", credentials: { accessToken: "token", metaUserIds: ["123456789123"] } }];
  app.store.put("connection", { id: "selection", ownerUid: "alice", projectId: h.project.id, platform: "facebook", createdAt: h.now() - 1000, expiresAt: h.now() + DAY, encrypted: app.vault.encrypt(candidates, "connection:selection") });
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  h.providers.facebook.accounts = async () => { started(); return new Promise(resolve => { release = () => resolve(candidates); }); };
  app.store.saveState(SecretVault.hash("state"), { uid: "alice", projectId: h.project.id, platform: "facebook", createdAt: h.now() - 1000 }, h.now() + DAY);
  const connecting = app.accounts.callback("facebook", new URLSearchParams({ state: "state", code: "test" }));
  await entered;
  app.metaPrivacy.receive("facebook", h.signed("facebook"));
  assert.equal(app.store.get("connection", "selection"), null);
  release(); await assert.rejects(connecting, /predates a removal/);
  assert.equal(app.store.list("account").length, 0);
  h.advance(2000);
  assert.doesNotThrow(() => app.metaPrivacy.assertAuthorization("facebook", candidates, h.now()));
});

test("unreadable matching-platform credentials fail atomically and do not return a false completion receipt", t => {
  const h = fixture(t); h.account("one", "instagram", "123456789123");
  h.app.store.put("account", { ...h.app.store.get("account", "one"), encryptedCredentials: "corrupted" });
  assert.throws(() => h.app.metaPrivacy.receive("instagram", h.signed("instagram")));
  assert.equal(h.app.store.list("metaRemovalReceipt").length, 0);
  assert.equal(h.app.store.list("metaRemovalBarrier").length, 0);
  h.account("legacy", "facebook", "123456789123");
  h.app.store.put("account", { ...h.app.store.get("account", "legacy"), encryptedCredentials: h.app.vault.encrypt({ accessToken: "old-token" }, "account:legacy") });
  assert.throws(() => h.app.metaPrivacy.receive("facebook", h.signed("facebook")), /legacy Facebook connection/);
  assert.equal(h.app.store.list("metaRemovalReceipt").length, 0);
});

test("public Meta endpoints require a signature, return a private human-readable status page, and wait for durable storage", async t => {
  const h = fixture(t), app = h.app;
  const server = app.app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${origin}/api/meta/facebook/data-deletion`, { method: "POST", body: new URLSearchParams() })).status, 400);
  let release, entered;
  const flushing = new Promise(resolve => { entered = resolve; });
  app.store.flush = async () => { entered(); await new Promise(resolve => { release = resolve; }); };
  let responded = false;
  const request = fetch(`${origin}/api/meta/facebook/data-deletion`, { method: "POST", body: new URLSearchParams({ signed_request: h.signed("facebook") }) }).then(response => { responded = true; return response; });
  await flushing;
  assert.equal(responded, false);
  release(); const response = await request;
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.confirmation_code, /^[a-f0-9]{48}$/);
  const status = await fetch(`${origin}${new URL(result.url).pathname}`);
  assert.equal(status.status, 200); assert.equal(status.headers.get("cache-control"), "no-store");
  assert.equal(status.headers.get("referrer-policy"), "no-referrer");
  const html = await status.text(); assert.match(html, /Meadow data deletion/); assert.match(html, /no matching data/);
  assert.ok(!html.includes("123456789123"));
  assert.equal((await fetch(`${origin}/api/meta/deletion-status/invalid`)).status, 404);
  app.store.flush = async () => {};
  const deauthorized = await fetch(`${origin}/api/meta/instagram/deauthorize`, { method: "POST", body: new URLSearchParams({ signed_request: h.signed("instagram") }) });
  assert.equal(deauthorized.status, 200);
});

test("Meta account discovery retains the right signed-callback identity inside credentials", async () => {
  const facebook = new FacebookProvider({ transport: { request: async url => url.includes("me?fields=id") ? { id: "user-asid" } : { data: [{ id: "page-id", name: "Page", access_token: "page-token" }] } } });
  const [page] = await facebook.accounts({ accessToken: "user-token" });
  assert.deepEqual(page.credentials.metaUserIds, ["user-asid"]); assert.equal(page.remoteId, "page-id"); assert.equal(page.credentials.accessToken, "page-token");
  const instagram = new InstagramProvider({ transport: { request: async () => ({ id: "app-scoped-id", user_id: "ig-id", username: "meadow" }) } });
  assert.deepEqual((await instagram.accounts({}))[0].credentials.metaUserIds, ["app-scoped-id", "ig-id"]);
  const threads = new ThreadsProvider({ transport: { request: async () => ({ id: "threads-id", username: "meadow" }) } });
  assert.deepEqual((await threads.accounts({}))[0].credentials.metaUserIds, ["threads-id"]);
});
