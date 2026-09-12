import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { ProviderError } from "../src/bridge/core/errors.js";
import { ScheduleService } from "../src/bridge/services/ScheduleService.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";
import { YouTubeProvider } from "../src/bridge/platforms/GoogleProviders.js";

class FakeProvider extends PlatformProvider {
  constructor() { super("x"); this.calls = []; this.polls = []; this.behavior = null; this.allowance = { limits: [] }; }
  get configured() { return true; }
  async options() { return this.allowance; }
  async publish(ctx) { this.calls.push(ctx.delivery.id); return this.behavior ? this.behavior(ctx) : { status: "published", externalId: `published-${ctx.delivery.id}`, url: "https://example.com/post" }; }
  async poll(ctx) { this.polls.push(ctx.delivery.id); return { status: "published", externalId: "processed-video" }; }
  async metrics() { return { values: { likes: 7, comments: 2, views: 41 } }; }
}
function setup(t) {
  let now = Date.parse("2026-09-09T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-test-")), provider = new FakeProvider();
  const app = new BridgeApplication({ store: new SqliteStore(), registry: new ProviderRegistry([provider]), clock: () => now, env: { BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_PUBLIC_URL: "https://bridge.example", BRIDGE_APP_URL: "https://bridge.example" } });
  const project = app.projects.create("alice", { name: "Podcast", timeZone: "Africa/Douala" });
  function account(id, { projectId = project.id, ownerUid = "alice", remoteId = id } = {}) { return app.store.put("account", { id, ownerUid, projectId, platform: "x", remoteId, label: id, rateKey: `x:${remoteId}`, status: "connected", encryptedCredentials: app.vault.encrypt({ accessToken: "test-token" }, `account:${id}`) }); }
  account("one");
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const post = (caption = "Hello", accountIds = ["one"], extra = {}) => ({ caption, title: "", mediaIds: [], accountIds, format: "auto", schedule: { mode: "now", timeZone: "UTC" }, ...extra });
  const submit = (items, requestId = randomBytes(16).toString("hex"), uid = "alice", projectId = project.id) => app.posts.submit(uid, projectId, { items, requestId });
  return { app, provider, project, account, post, submit, now: () => now, advance: ms => { now += ms; } };
}

test("project ownership isolates accounts, media, posts, analytics, and queue writes", async t => {
  const h = setup(t), { app, project } = h, other = app.projects.create("bob", { name: "Other" });
  h.account("other", { projectId: other.id, ownerUid: "bob" }); const { posts: [post] } = await h.submit([h.post()]);
  for (const read of [() => app.posts.get("bob", project.id, post.id), () => app.accounts.list("bob", project.id), () => app.media.list("bob", project.id), () => app.analytics.report("bob", project.id)]) assert.throws(read, /not found/i);
  assert.throws(() => app.posts.reorder("bob", other.id, "one", post.deliveries.map(d => d.id)), /not found/i);
  await assert.rejects(h.submit([h.post("Cross project", ["other"])]), /not found/i);
  assert.equal(app.posts.list("bob", other.id).length, 0);
});

test("20 posts against a 10-post allowance spill into a second window; later posts join behind", async t => {
  const h = setup(t); h.provider.allowance = { limit: 10, remaining: 10, limits: [{ limit: 10, windowMs: 86400000 }] };
  const result = await h.submit(Array.from({ length: 20 }, (_, i) => h.post(`Post ${i + 1}`)));
  const deliveries = result.posts.flatMap(p => p.deliveries).sort((a, b) => a.order - b.order);
  assert.equal(deliveries.filter(d => d.dueAt === h.now()).length, 10);
  assert.equal(deliveries.filter(d => d.dueAt > h.now()).length, 10);
  assert.equal(deliveries[10].dueAt, h.now() + 86400001);
  h.advance(1000); const later = await h.submit([h.post("Post 21")]);
  assert.equal(later.posts[0].deliveries[0].dueAt, h.now() + 2 * 86400001);
});

test("remote account allowance is shared across separate project connections", async t => {
  const h = setup(t); h.provider.allowance = { limits: [{ limit: 1, windowMs: 3600000 }] };
  const other = h.app.projects.create("alice", { name: "Second" }); h.account("same", { projectId: other.id, remoteId: "one" });
  await h.submit([h.post()]); const second = await h.submit([h.post("Second", ["same"])], undefined, "alice", other.id);
  assert.equal(second.posts[0].deliveries[0].dueAt, h.now() + 3600001);
});

test("queue reorder and deletion recalculate slots and reject stale queue order", async t => {
  const h = setup(t); h.provider.allowance = { limits: [{ limit: 1, windowMs: 60000 }] };
  const { posts } = await h.submit([h.post("First"), h.post("Second"), h.post("Third")]); const ids = posts.map(post => post.deliveries[0].id);
  h.app.posts.reorder("alice", h.project.id, "one", [ids[2], ids[0], ids[1]]);
  assert.equal(h.app.posts.get("alice", h.project.id, posts[2].id).deliveries[0].dueAt, h.now());
  h.app.posts.remove("alice", h.project.id, posts[2].id);
  assert.equal(h.app.posts.get("alice", h.project.id, posts[0].id).deliveries[0].dueAt, h.now());
  assert.throws(() => h.app.posts.reorder("alice", h.project.id, "one", ids), /queue has changed/i);
});

test("submission idempotency rejects changed content and publishes each destination only once", async t => {
  const h = setup(t); h.account("two"); const items = [h.post("Same post", ["one", "two"])], key = "stable-submission-12345";
  const first = await h.submit(items, key), second = await h.submit(items, key);
  assert.equal(second.duplicate, true); assert.equal(second.posts[0].id, first.posts[0].id);
  await assert.rejects(h.submit([h.post("Changed")], key), /different content/i);
  await h.app.worker.tick(); await h.app.worker.tick();
  assert.equal(h.provider.calls.length, 2); assert.equal(h.app.posts.get("alice", h.project.id, first.posts[0].id).status, "published");
});

test("failure retry is independent and never resends a successful destination", async t => {
  const h = setup(t); h.account("two"); let failed = false;
  h.provider.behavior = ctx => { if (ctx.account.id === "two" && !failed) { failed = true; throw new ProviderError("Temporary", { retryable: true }); } return { status: "published", externalId: ctx.account.id }; };
  const { posts: [post] } = await h.submit([h.post("Two destinations", ["one", "two"])]); await h.app.worker.tick();
  let current = h.app.posts.get("alice", h.project.id, post.id);
  assert.equal(current.deliveries.filter(d => d.status === "published").length, 1); assert.equal(current.deliveries.filter(d => d.status === "retrying").length, 1);
  h.advance(60001); await h.app.worker.tick(); current = h.app.posts.get("alice", h.project.id, post.id);
  assert.equal(current.status, "published"); assert.equal(h.provider.calls.filter(id => id === post.deliveries.find(d => d.accountId === "one").id).length, 1); assert.equal(h.provider.calls.length, 3);
});

test("Pinterest app access failures stop a delivery without disconnecting a valid account", async t => {
  const h = setup(t);
  const http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ code: 3, message: "Apps with Trial access may not create Pins in production." }), { status: 403 }) });
  h.provider.behavior = () => http.request("https://api.pinterest.com/v5/pins", { method: "POST" });
  const { posts: [post] } = await h.submit([h.post()]);
  await h.app.worker.tick();
  const delivery = h.app.store.get("delivery", post.deliveries[0].id);
  assert.equal(delivery.status, "failed"); assert.match(delivery.error, /Standard access/);
  assert.equal(h.app.store.get("account", "one").status, "connected");
  await h.app.worker.tick(); assert.equal(h.provider.calls.length, 1);
});

test("account refresh and queued deliveries retain the actionable Pinterest authorization error", async t => {
  const h = setup(t);
  const { posts } = await h.submit([h.post("First"), h.post("Second")]);
  const http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ code: 2, message: "Authentication failed." }), { status: 401 }) });
  h.provider.options = () => http.request("https://api.pinterest.com/v5/boards");
  await assert.rejects(h.app.accounts.options("alice", h.project.id, "one", { force: true }), /Pinterest code 2/);
  const account = h.app.store.get("account", "one");
  assert.equal(account.status, "reconnect_required"); assert.match(account.lastError, /Pinterest code 2/);
  for (const post of posts) {
    await h.app.worker.deliver(post.deliveries[0].id);
    const delivery = h.app.store.get("delivery", post.deliveries[0].id);
    assert.equal(delivery.status, "needs_account"); assert.equal(delivery.error, account.lastError);
  }
  assert.equal(h.provider.calls.length, 0);
});

test("a Pinterest authorization failure during publication keeps its reason on the account and delivery", async t => {
  const h = setup(t);
  const http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ code: 29, message: "Your token does not have sufficient permissions to perform this operation." }), { status: 403 }) });
  h.provider.behavior = () => http.request("https://api.pinterest.com/v5/pins", { method: "POST" });
  const { posts: [post] } = await h.submit([h.post()]);
  await h.app.worker.tick();
  const delivery = h.app.store.get("delivery", post.deliveries[0].id), account = h.app.store.get("account", "one");
  assert.equal(delivery.status, "needs_account"); assert.equal(delivery.resumeStatus, "queued");
  assert.match(delivery.error, /Pinterest code 29/); assert.equal(account.lastError, delivery.error);
});

test("revoked Google authorization holds queued posts until reconnection and preserves completed deliveries", async t => {
  const h = setup(t); h.account("two");
  const { posts: [post] } = await h.submit([h.post("Two destinations", ["one", "two"])]);
  const completed = post.deliveries.find(delivery => delivery.accountId === "two");
  const pending = post.deliveries.find(delivery => delivery.accountId === "one");
  await h.app.worker.deliver(completed.id);
  const account = h.app.store.get("account", "one");
  h.app.store.put("account", { ...account, encryptedCredentials: h.app.vault.encrypt({ accessToken: "expired", refreshToken: "revoked", expiresAt: 1 }, "account:one") });
  const google = new YouTubeProvider({ transport: new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: 400 }) }) });
  h.provider.refresh = credentials => google.refresh(credentials);
  await h.app.worker.deliver(pending.id);
  const paused = h.app.store.get("delivery", pending.id), disconnected = h.app.store.get("account", "one");
  assert.equal(paused.status, "needs_account"); assert.equal(paused.resumeStatus, "queued");
  assert.equal(disconnected.status, "reconnect_required"); assert.equal(paused.error, disconnected.lastError);
  assert.match(paused.error, /Google rejected this account's authorization/);
  await h.app.worker.tick(); assert.equal(h.provider.calls.length, 1);
  const id = "google-reconnect-test";
  h.app.store.put("connection", { id, ownerUid: "alice", projectId: h.project.id, platform: "x", expiresAt: h.now() + 60000, encrypted: h.app.vault.encrypt([{ remoteId: "one", label: "one", credentials: { accessToken: "renewed" } }], `connection:${id}`) });
  h.app.accounts.attach("alice", h.project.id, id, ["one"]);
  await h.app.worker.tick();
  assert.equal(h.app.posts.get("alice", h.project.id, post.id).status, "published");
  assert.equal(h.provider.calls.filter(id => id === completed.id).length, 1);
  assert.equal(h.provider.calls.filter(id => id === pending.id).length, 1);
});

test("uncertain publication pauses for review and requires confirmation before a retry", async t => {
  const h = setup(t); h.provider.behavior = () => { throw new ProviderError("No confirmation", { uncertain: true }); };
  const { posts: [post] } = await h.submit([h.post()]); await h.app.worker.tick();
  const delivery = h.app.posts.get("alice", h.project.id, post.id).deliveries[0]; assert.equal(delivery.status, "needs_review");
  h.advance(86400000); await h.app.worker.tick(); assert.equal(h.provider.calls.length, 1);
  assert.throws(() => h.app.posts.retry("alice", h.project.id, delivery.id), /confirm/i);
  h.app.posts.retry("alice", h.project.id, delivery.id, { confirmedNotPublished: true }); assert.equal(h.app.store.get("delivery", delivery.id).status, "queued");
});

test("provider rate limit blocks future work until reset and does not exhaust retry attempts", async t => {
  const h = setup(t); h.provider.behavior = () => { throw new ProviderError("Quota", { retryable: true, code: "rate_limited", retryAt: h.now() + 3600000 }); };
  const { posts: [post] } = await h.submit([h.post()]); await h.app.worker.tick();
  const delivery = h.app.posts.get("alice", h.project.id, post.id).deliveries[0]; assert.equal(delivery.status, "retrying"); assert.equal(delivery.attempts, 0);
  const later = await h.submit([h.post("Queued behind")]); assert.equal(later.posts[0].deliveries[0].dueAt, h.now() + 3600000);
  await h.app.worker.tick(); assert.equal(h.provider.calls.length, 1);
});

test("processing media is polled without repeating the publish request", async t => {
  const h = setup(t); h.provider.behavior = ctx => { ctx.checkpoint({ containerId: "c1" }); return { status: "processing", progress: { containerId: "c1" }, pollAfterMs: 5000 }; };
  const { posts: [post] } = await h.submit([h.post()]); await h.app.worker.tick(); assert.equal(h.app.posts.get("alice", h.project.id, post.id).deliveries[0].status, "processing");
  h.advance(5001); await h.app.worker.tick(); assert.equal(h.provider.calls.length, 1); assert.equal(h.provider.polls.length, 1); assert.equal(h.app.posts.get("alice", h.project.id, post.id).status, "published");
});

test("editing requires a current revision and cannot modify published content", async t => {
  const h = setup(t), { posts: [post] } = await h.submit([h.post()]);
  const updated = await h.app.posts.update("alice", h.project.id, post.id, { ...h.post("Edited"), revision: post.revision }); assert.equal(updated.caption, "Edited");
  await assert.rejects(h.app.posts.update("alice", h.project.id, post.id, { ...h.post("Stale"), revision: post.revision }), /another window/i);
  await h.app.worker.tick(); await assert.rejects(h.app.posts.update("alice", h.project.id, post.id, { ...h.post("Late"), revision: updated.revision }), /editable queued deliveries/i);
});

test("analytics preserve unavailable metrics and expose coverage when aggregating posts/accounts", async t => {
  const h = setup(t); h.account("two"); const { posts: [post] } = await h.submit([h.post("Comparison", ["one", "two"])]); await h.app.worker.tick();
  const deliveries = h.app.posts.get("alice", h.project.id, post.id).deliveries;
  h.app.store.put("delivery", { ...h.app.store.get("delivery", deliveries[0].id), metrics: { views: 100, likes: 5, comments: 2, shares: null } });
  h.app.store.put("delivery", { ...h.app.store.get("delivery", deliveries[1].id), metrics: { likes: 3, comments: 0, shares: 1 } });
  const report = h.app.analytics.report("alice", h.project.id);
  assert.equal(report.totals.values.engagement, 11); assert.equal(report.totals.values.views, 100); assert.equal(report.totals.values.saves, null); assert.deepEqual(report.totals.coverage.views, { available: 1, total: 2 });
  assert.equal(report.accounts.length, 2); assert.equal(report.posts[0].totals.values.likes, 8);
  const normalized = h.app.analytics.normalize({ likes: "3", views: null, shares: -1, impressions: undefined }); assert.equal(normalized.likes, 3); assert.equal(normalized.views, null); assert.equal(normalized.shares, null);
});

test("schedules respect timezones, reject nonexistent DST times, and disambiguate repeated hours", () => {
  const service = new ScheduleService({ clock: () => Date.parse("2026-01-01") }), local = { localDateTime: "2026-11-01T01:30", timeZone: "America/New_York" };
  assert.throws(() => service.resolve(local), /occurs twice/i);
  const earlier = service.resolve({ ...local, disambiguation: "earlier" }), later = service.resolve({ ...local, disambiguation: "later" }); assert.equal(later.requestedAt - earlier.requestedAt, 3600000);
  assert.throws(() => service.resolve({ localDateTime: "2026-03-08T02:30", timeZone: "America/New_York", disambiguation: "later" }), /does not exist/i);
  assert.equal(service.resolve({ localDateTime: "2026-09-09T18:00", timeZone: "Africa/Douala" }).requestedAt, Date.parse("2026-09-09T17:00:00Z"));
  assert.throws(() => service.forPost({ mode: "scheduled", localDateTime: "2025-01-01T12:00", timeZone: "UTC" }), /future/i);
});

test("encrypted credentials are bound to the correct account context", () => {
  const vault = new SecretVault(randomBytes(32).toString("base64")), encrypted = vault.encrypt({ accessToken: "private" }, "account:one");
  assert.ok(!encrypted.includes("private")); assert.equal(vault.decrypt(encrypted, "account:one").accessToken, "private"); assert.throws(() => vault.decrypt(encrypted, "account:two"));
});

test("editing remaining deliveries preserves a successful destination and its published content", async t => {
  const h = setup(t); h.account("two");
  const { posts: [post] } = await h.submit([h.post("Original", ["one", "two"])]);
  const done = post.deliveries.find(delivery => delivery.accountId === "one");
  await h.app.worker.deliver(done.id);
  const current = h.app.posts.get("alice", h.project.id, post.id); assert.equal(current.editable, true);
  const edited = await h.app.posts.update("alice", h.project.id, post.id, { ...h.post("Updated for remaining account", ["one", "two"]), revision: current.revision });
  assert.equal(edited.deliveries.find(d => d.id === done.id).status, "published");
  assert.equal(edited.deliveries.find(d => d.id === done.id).contentSnapshot.caption, "Original");
  assert.equal(edited.overrides.one.caption, "Original");
  await h.app.worker.tick();
  assert.equal(h.provider.calls.filter(id => id === done.id).length, 1);
  const completed = h.app.posts.get("alice", h.project.id, post.id);
  assert.equal(completed.deliveries.find(d => d.accountId === "two").contentSnapshot.caption, "Updated for remaining account");
});

test("disconnecting during token refresh never restores the removed credentials", async t => {
  const h = setup(t), original = h.app.store.get("account", "one");
  h.app.store.put("account", { ...original, encryptedCredentials: h.app.vault.encrypt({ accessToken: "old", expiresAt: 1, refreshToken: "refresh" }, "account:one") });
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.provider.refresh = async () => { entered(); await new Promise(resolve => { release = resolve; }); return { accessToken: "new", expiresAt: h.now() + 3600000 }; };
  const refreshing = h.app.accounts.credentials(original);
  await started;
  h.app.accounts.disconnect("alice", h.project.id, "one"); release();
  await assert.rejects(refreshing, /disconnected/i);
  assert.equal(h.app.store.get("account", "one").encryptedCredentials, null);
  assert.equal(h.app.store.get("account", "one").status, "disconnected");
});

test("deleting partially published content is atomic and leaves pending deliveries intact", async t => {
  const h = setup(t); h.account("two");
  const { posts: [post] } = await h.submit([h.post("Partial", ["one", "two"])]);
  await h.app.worker.deliver(post.deliveries.find(d => d.accountId === "one").id);
  assert.throws(() => h.app.posts.remove("alice", h.project.id, post.id), /stay in your history/i);
  assert.equal(h.app.store.get("delivery", post.deliveries.find(d => d.accountId === "two").id).status, "queued");
});

test("reconnecting a processing delivery resumes polling without another upload", async t => {
  const h = setup(t);
  h.provider.behavior = () => ({ status: "processing", externalId: "remote-video", progress: { uploadId: "existing-upload" }, pollAfterMs: 5000 });
  const { posts: [post] } = await h.submit([h.post()]); await h.app.worker.tick();
  const account = h.app.store.get("account", "one");
  h.app.store.put("account", { ...account, encryptedCredentials: h.app.vault.encrypt({ accessToken: "expired", refreshToken: "revoked", expiresAt: 1 }, "account:one") });
  const google = new YouTubeProvider({ transport: new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }) }) });
  h.provider.refresh = credentials => google.refresh(credentials);
  h.advance(5001); await h.app.worker.tick();
  const paused = h.app.store.get("delivery", post.deliveries[0].id);
  assert.equal(paused.status, "needs_account"); assert.equal(paused.resumeStatus, "processing");
  const id = "reconnect-test";
  h.app.store.put("connection", { id, ownerUid: "alice", projectId: h.project.id, platform: "x", expiresAt: h.now() + 60000, encrypted: h.app.vault.encrypt([{ remoteId: "one", label: "one", credentials: { accessToken: "renewed" } }], `connection:${id}`) });
  h.app.accounts.attach("alice", h.project.id, id, ["one"]);
  assert.equal(h.app.store.get("delivery", paused.id).status, "processing");
  h.provider.poll = async ctx => { assert.equal(ctx.progress.uploadId, "existing-upload"); return { status: "published", externalId: "remote-video" }; };
  await h.app.worker.tick();
  assert.equal(h.provider.calls.length, 1);
  assert.equal(h.app.store.get("delivery", paused.id).status, "published");
});

test("a large completed history cannot starve an older due delivery", async t => {
  const h = setup(t);
  const { posts: [post] } = await h.submit([h.post("Older pending post")]);
  h.app.store.transaction(() => {
    for (let i = 0; i < 10010; i++) h.app.store.put("delivery", { id: `old-history-${i}`, rateKey: "x:unrelated", status: "published", dueAt: h.now() - 1, createdAt: h.now() + 1 });
  });
  await h.app.worker.tick();
  assert.equal(h.app.store.get("delivery", post.deliveries[0].id).status, "published");
});
