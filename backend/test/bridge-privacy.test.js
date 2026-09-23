import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, createHmac } from "node:crypto";
import Database from "better-sqlite3";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { PinterestProvider } from "../src/bridge/platforms/PinterestProvider.js";
import { YouTubeProvider } from "../src/bridge/platforms/GoogleProviders.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { BlueskyProvider } from "../src/bridge/platforms/BlueskyProvider.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { CONNECTION_PRIVACY_VERSION } from "../src/bridge/platforms/connectionPrivacy.js";
import { ProviderError } from "../src/bridge/core/errors.js";
import { LockService } from "../src/bridge/core/LockService.js";
import { AnalyticsErasureService } from "../src/bridge/services/AnalyticsErasureService.js";

const DAY = 86400000;
class Provider extends PlatformProvider {
  constructor(id) { super(id); this.revoked = []; }
  get configured() { return true; }
  async options() { return { limits: [] }; }
  async revoke(credentials) { this.revoked.push(credentials.accessToken); return { remoteRevocation: true }; }
  async publish() { return { status: "published", externalId: "new-post" }; }
  async metrics() { return { values: { likes: 8, views: 20 } }; }
}
function fixture(t, { persistent = false } = {}) {
  let now = Date.parse("2026-09-12T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-privacy-test-"));
  const env = { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "media-test", BRIDGE_APP_URL: "https://meadow.example", BRIDGE_PUBLIC_URL: "https://meadow.example", TIKTOK_CLIENT_KEY: "test-client", TIKTOK_CLIENT_SECRET: "test-secret", BRIDGE_POSTHOG_LEGACY_DATA: "false" };
  const providers = Object.fromEntries(["x", "youtube", "tiktok", "pinterest"].map(id => [id, new Provider(id)]));
  const options = { env, clock: () => now, registry: new ProviderRegistry(Object.values(providers)), deleteIdentity: async () => {}, deleteAnalytics: async () => true };
  let app = new BridgeApplication({ ...options, ...(persistent ? {} : { store: new SqliteStore() }) });
  const project = app.projects.create("alice", { name: "Alice" });
  const account = (id = "one", platform = "x", overrides = {}) => app.store.put("account", { id, ownerUid: "alice", projectId: project.id, platform, remoteId: id, label: `Profile ${id}`, avatar: "https://example.com/avatar", options: null, status: "connected", rateKey: `${platform}:${overrides.remoteId || id}`, authorizationId: id, authorizationGrantedAt: now, profileUpdatedAt: now, profileAttemptedAt: now, createdAt: now, encryptedCredentials: app.vault.encrypt({ accessToken: `token-${id}`, refreshToken: `refresh-${id}` }, `account:${id}`), ...overrides });
  const post = (id, accounts, extra = {}) => {
    app.store.put("post", { id, ownerUid: "alice", projectId: project.id, caption: "My original caption", title: "", format: "auto", accountIds: accounts.map(item => item.id), mediaIds: [], overrides: Object.fromEntries(accounts.map(item => [item.id, { settings: {} }])), createdAt: now, ...extra });
    for (const item of accounts) app.store.put("delivery", { id: `${id}:${item.id}`, ownerUid: item.ownerUid, projectId: item.projectId, postId: id, accountId: item.id, platform: item.platform, rateKey: item.rateKey, status: "queued", requestedAt: now, dueAt: now, order: now, attempts: 0, createdAt: now });
  };
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { get app() { return app; }, project, account, post, providers, now: () => now, advance: ms => { now += ms; }, restart: () => { app.close(); app = new BridgeApplication(options); }, dir };
}

test("durable locks use opaque names, stop renewing when cancelled, and prune expired rows", async () => {
  const store = new SqliteStore(), locks = new LockService(store);
  const name = "publishing:youtube:sensitive-channel-id";
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const running = locks.withLock(name, async () => { entered(); await held; }, { leaseMs: 30 });
  await started;
  try {
    const [lease] = store.db.prepare("SELECT name FROM leases").all();
    assert.match(lease.name, /^lease:[a-f0-9]{64}$/);
    assert.ok(!lease.name.includes("sensitive-channel-id"));
    locks.cancel(name);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(store.db.prepare("SELECT name FROM leases").all(), []);
  } finally {
    release();
    await running;
  }
  store.acquireLease("publishing:youtube:expired-channel", "abandoned", 0, 10);
  assert.equal(store.pruneLeases(11), 1);
  assert.deepEqual(store.db.prepare("SELECT name FROM leases").all(), []);
  store.close();
});

test("legacy lock identifiers and orphaned rate keys are removed from the SQLite file", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-legacy-privacy-")), filename = path.join(dir, "bridge.sqlite");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  new SqliteStore(filename).close();
  const legacy = new Database(filename);
  legacy.pragma("journal_mode = WAL");
  legacy.prepare("DELETE FROM schema_migrations WHERE version=2").run();
  legacy.exec("DROP TABLE rate_events; CREATE TABLE rate_events (id TEXT PRIMARY KEY, rate_key TEXT NOT NULL, occurred_at INTEGER NOT NULL); CREATE INDEX idx_rate_events_key_time ON rate_events(rate_key,occurred_at)");
  legacy.prepare("INSERT INTO rate_events VALUES (?,?,?)").run("missing-delivery", "youtube:orphaned-channel-id", 1);
  legacy.prepare("INSERT INTO leases VALUES (?,?,?)").run("publishing:youtube:legacy-channel-id", "legacy-holder", Date.now() + DAY);
  legacy.pragma("wal_checkpoint(TRUNCATE)");
  legacy.close();
  assert.ok(fs.readFileSync(filename).includes(Buffer.from("legacy-channel-id")));
  assert.ok(fs.readFileSync(filename).includes(Buffer.from("orphaned-channel-id")));

  const migrated = new SqliteStore(filename);
  assert.deepEqual(migrated.db.prepare("SELECT * FROM rate_events").all(), []);
  const [lease] = migrated.db.prepare("SELECT name FROM leases").all();
  assert.match(lease.name, /^lease:[a-f0-9]{64}$/);
  migrated.checkpointDeletedData();
  migrated.close();
  const persisted = [filename, `${filename}-wal`].filter(file => fs.existsSync(file)).map(file => fs.readFileSync(file));
  for (const bytes of persisted) {
    assert.ok(!bytes.includes(Buffer.from("legacy-channel-id")));
    assert.ok(!bytes.includes(Buffer.from("orphaned-channel-id")));
  }
});

test("connection erasure removes shared owner connections and all API history without touching another owner or original content", async t => {
  const h = fixture(t), app = h.app, one = h.account(), other = h.account("other");
  const secondProject = app.projects.create("alice", { name: "Second" });
  const duplicate = h.account("duplicate", "x", { remoteId: "one", projectId: secondProject.id });
  const bobProject = app.projects.create("bob", { name: "Bob" });
  const bob = h.account("bob", "x", { remoteId: "one", ownerUid: "bob", projectId: bobProject.id });
  h.post("mixed", [one, other]); h.post("only", [one]); h.post("duplicate", [duplicate]);
  const delivery = app.store.get("delivery", "mixed:one");
  app.store.put("delivery", { ...delivery, status: "published", metrics: { likes: 10 }, externalId: "secret-api-id", progress: { uploadUrl: "secret-session" } });
  app.store.recordRateEvent(delivery.id, one.rateKey, h.now());
  assert.throws(() => app.privacy.requestConnection("bob", h.project.id, one.id), /not found/i);
  const result = app.privacy.requestConnection("alice", h.project.id, one.id);
  assert.equal(result.affectedConnections, 2);
  await app.privacy.tick();
  assert.equal(app.store.get("account", one.id), null); assert.equal(app.store.get("account", duplicate.id), null);
  assert.ok(app.store.get("account", other.id)); assert.ok(app.store.get("account", bob.id));
  assert.equal(app.store.get("delivery", delivery.id), null);
  assert.deepEqual(app.store.rateEvents(one.rateKey, 0), []);
  assert.deepEqual(app.store.get("post", "mixed").accountIds, [other.id]);
  assert.equal(app.store.get("post", "mixed").caption, "My original caption");
  assert.equal(app.posts.get("alice", h.project.id, "only").status, "draft");
});

test("failed revocation drops credentials at the six-day fallback before the seven-day deadline", async t => {
  const h = fixture(t), account = h.account("youtube", "youtube");
  h.post("posted", [account]);
  h.providers.youtube.revoke = async () => { throw new Error("provider unavailable"); };
  h.app.privacy.requestConnection("alice", h.project.id, account.id);
  await h.app.privacy.tick(); await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id), null);
  const [job] = h.app.store.list("revocation");
  assert.ok(job.encrypted); assert.equal(job.status, "pending");
  assert.ok(!JSON.stringify(job).includes("token-youtube"));
  h.advance(6 * DAY - 1); await h.app.privacy.tick();
  assert.ok(h.app.store.get("revocation", job.id).encrypted);
  h.advance(1); await h.app.privacy.tick();
  const receipt = h.app.store.get("revocation", job.id);
  assert.equal(receipt.status, "manual_revocation_required");
  assert.equal(receipt.encrypted, undefined); assert.equal(receipt.ownerUid, undefined); assert.equal(receipt.aad, undefined);
});

test("the six-day fallback purges a connection before the seven-day deadline when its normal erasure lock stays busy", async t => {
  const h = fixture(t), account = h.account("youtube", "youtube");
  h.post("posted", [account]);
  const delivery = h.app.store.get("delivery", "posted:youtube");
  h.app.store.put("delivery", { ...delivery, status: "published", externalId: "youtube-video", metrics: { views: 12 }, progress: { videoId: "youtube-video", uploadUrl: "secret-upload-session" } });
  h.app.store.recordRateEvent(delivery.id, account.rateKey, h.now());
  let startPublishing, finishPublishing;
  const publishingStarted = new Promise(resolve => { startPublishing = resolve; });
  const publishingFinished = new Promise(resolve => { finishPublishing = resolve; });
  h.providers.youtube.validate = () => [];
  h.providers.youtube.publish = async () => { startPublishing(); await publishingFinished; return { status: "published", externalId: "late-video" }; };
  h.app.store.put("delivery", { ...h.app.store.get("delivery", delivery.id), status: "queued" });
  const publishing = h.app.worker.deliver(delivery.id);
  await publishingStarted;

  h.app.privacy.requestConnection("alice", h.project.id, account.id);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id).status, "deleting");
  assert.equal(h.app.store.list("revocation").length, 0);

  h.advance(6 * DAY - 1);
  h.app.store.acquireLease(`publishing:${account.rateKey}`, "stuck-worker", h.now(), 2 * DAY);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id).status, "deleting");
  assert.equal(h.app.store.list("revocation").length, 0);

  h.advance(1);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id), null);
  assert.equal(h.app.store.get("delivery", delivery.id), null);
  assert.deepEqual(h.app.store.db.prepare("SELECT name FROM leases").all(), []);
  assert.deepEqual(h.app.store.rateEvents(account.rateKey, 0), []);
  assert.deepEqual(h.app.store.get("post", "posted").accountIds, []);
  const [receipt] = h.app.store.list("revocation");
  assert.equal(receipt.status, "manual_revocation_required");
  assert.equal(receipt.platform, "youtube");
  assert.equal(receipt.encrypted, undefined);
  assert.equal(receipt.ownerUid, undefined);
  assert.equal(receipt.aad, undefined);
  assert.ok(!JSON.stringify(receipt).includes("token-youtube"));
  assert.deepEqual(h.providers.youtube.revoked, []);
  finishPublishing(); await publishing;
  assert.equal(h.app.store.get("account", account.id), null);
  assert.equal(h.app.store.get("delivery", delivery.id), null);
});

test("the hard fallback does not create a manual receipt for an authorization already revoked", async t => {
  const h = fixture(t), account = h.account("youtube", "youtube");
  h.app.store.acquireLease(`publishing:${account.rateKey}`, "stuck-worker", h.now(), 8 * DAY);
  h.app.privacy.requestConnection("alice", h.project.id, account.id, { alreadyRevoked: true });

  h.advance(6 * DAY);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id), null);
  assert.deepEqual(h.app.store.list("revocation"), []);
});

test("a revoked Google grant deletes every connection that shares it", async t => {
  const h = fixture(t), app = h.app;
  const credentials = { accessToken: "shared-google-access", refreshToken: "shared-google-refresh", expiresAt: h.now() - 1 };
  const youtube = h.account("youtube", "youtube", {
    authorizationId: "youtube-authorization",
    encryptedCredentials: app.vault.encrypt(credentials, "account:youtube"),
  });
  const business = h.account("business", "google_business", {
    authorizationId: "business-authorization",
    encryptedCredentials: app.vault.encrypt(credentials, "account:business"),
  });
  const secondProject = app.projects.create("alice", { name: "Valid duplicate" });
  const validDuplicate = h.account("valid-duplicate", "youtube", {
    projectId: secondProject.id,
    remoteId: youtube.remoteId,
    authorizationId: "replacement-authorization",
    encryptedCredentials: app.vault.encrypt({ accessToken: "valid-access", refreshToken: "valid-refresh", expiresAt: h.now() + DAY }, "account:valid-duplicate"),
  });
  h.post("shared-google-post", [youtube, business]);
  const delivery = app.store.get("delivery", "shared-google-post:youtube");
  app.store.put("delivery", { ...delivery, status: "published", externalId: "youtube-video", metrics: { views: 12 }, progress: { videoId: "youtube-video" } });
  const revoked = Object.assign(new ProviderError("Google rejected this account's authorization.", { reconnect: true, code: "reconnect_required" }), { authFailure: "grant" });
  h.providers.youtube.refresh = async () => { throw revoked; };

  await assert.rejects(app.accounts.credentials(youtube), /rejected this account's authorization/i);
  const [job] = app.store.list("erasure", { ownerUid: "alice", limit: null });
  assert.deepEqual([...job.accountIds].sort(), [business.id, youtube.id]);
  assert.equal(job.alreadyRevoked, true);
  assert.equal(app.store.get("account", youtube.id).status, "deleting");
  assert.equal(app.store.get("account", business.id).status, "deleting");
  assert.equal(app.store.get("account", validDuplicate.id).status, "connected");

  await app.privacy.tick();
  assert.equal(app.store.get("account", youtube.id), null);
  assert.equal(app.store.get("account", business.id), null);
  assert.equal(app.store.get("account", validDuplicate.id).status, "connected");
  assert.equal(app.store.get("delivery", delivery.id), null);
  assert.deepEqual(app.store.get("post", "shared-google-post").accountIds, []);
  assert.deepEqual(h.providers.youtube.revoked, []);
  assert.deepEqual(app.store.list("revocation"), []);
});

test("full erasure deletes originals and partial variants, revokes keys and states, and resumes failed external cleanup after restart", async t => {
  const h = fixture(t, { persistent: true }), account = h.account();
  h.post("post", [account]);
  const app = h.app, source = { id: "media", ownerUid: "alice", projectId: h.project.id, status: "ready", storageKey: "media.png", thumbnailKey: "media-thumb.jpg", variants: { mp4: { key: "media-mp4.mp4" } }, createdAt: h.now() };
  app.store.put("media", source);
  for (const key of ["media.png", "media-thumb.jpg", "media-jpeg.jpg", "media-mp4.mp4"]) fs.writeFileSync(app.storage.path(key), "test bytes");
  const key = app.apiKeys.create("alice", { name: "Agent" }).key;
  app.store.saveState("oauth-state", { uid: "alice", projectId: h.project.id }, h.now() + DAY);
  app.store.put("billing", { id: "alice", ownerUid: "alice", subscriptionId: "sub-test" });
  let cancelled = 0, identities = 0;
  app.billing.cancelForDeletion = async () => { cancelled++; throw new Error("temporary billing failure"); };
  app.privacy.deleteIdentity = async () => { identities++; throw new Error("temporary Clerk failure"); };
  const signed = new URL(app.media.url(source), app.publicUrl);
  app.privacy.requestAccount("alice", { confirmation: "DELETE" });
  assert.throws(() => app.apiKeys.authenticate(key), /invalid|revoked/i);
  assert.throws(() => app.projects.ensureDefault("alice"), /deletion|closed/i);
  assert.throws(() => app.media.verify(source.id, "original", signed.searchParams.get("expires"), signed.searchParams.get("signature"), false), /not found/i);
  await app.privacy.tick();
  assert.equal(cancelled, 1); assert.equal(identities, 1);
  assert.deepEqual(fs.readdirSync(app.storage.root), []);
  assert.equal(app.store.get("project", h.project.id), null);
  assert.equal(app.store.consumeState("oauth-state", h.now()), null);
  assert.deepEqual(app.privacy.status("alice").deletion.pending.sort(), ["billing", "sign_in"]);
  h.restart();
  h.app.billing.cancelForDeletion = async () => { cancelled++; };
  h.app.privacy.deleteIdentity = async () => { identities++; };
  h.advance(60001); await h.app.privacy.tick();
  assert.equal(cancelled, 2); assert.equal(identities, 2);
  assert.equal(h.app.privacy.status("alice").deletion.status, "complete");
  assert.equal(h.app.store.get("billing", "alice"), null);
  assert.equal(h.app.billing.syncSubscription({ id: "late", metadata: { meadowUserId: "alice" }, items: { data: [] } }), null);
});

test("an in-flight publication finishes under its lease before erasure, and the deleted delivery is never recreated", async t => {
  const h = fixture(t), account = h.account(); h.post("race", [account]);
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  h.providers.x.publish = async () => { started(); await new Promise(resolve => { release = resolve; }); return { status: "published", externalId: "already-sent" }; };
  const publishing = h.app.worker.deliver("race:one"); await entered;
  h.app.privacy.requestConnection("alice", h.project.id, account.id);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id).status, "deleting");
  release(); await publishing;
  h.advance(60001); await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id), null);
  assert.equal(h.app.store.get("delivery", "race:one"), null);
  await h.app.worker.tick(); assert.equal(h.app.store.get("delivery", "race:one"), null);
});

test("late analytics and options responses cannot recreate erased account data", async t => {
  const h = fixture(t), account = h.account(); h.post("race", [account]);
  const delivery = h.app.store.get("delivery", "race:one");
  h.app.store.put("delivery", { ...delivery, status: "published", externalId: "remote" });
  let releaseMetrics, releaseOptions, startMetrics, startOptions;
  const enteredMetrics = new Promise(resolve => { startMetrics = resolve; }), enteredOptions = new Promise(resolve => { startOptions = resolve; });
  h.providers.x.metrics = async () => { startMetrics(); await new Promise(resolve => { releaseMetrics = resolve; }); return { values: { likes: 999 } }; };
  h.providers.x.options = async () => { startOptions(); await new Promise(resolve => { releaseOptions = resolve; }); return { secretProfile: "must not persist" }; };
  const metrics = h.app.analytics.syncDelivery(h.app.store.get("delivery", delivery.id));
  const options = h.app.accounts.options("alice", h.project.id, account.id);
  await Promise.all([enteredMetrics, enteredOptions]);
  h.app.privacy.requestConnection("alice", h.project.id, account.id); await h.app.privacy.tick();
  releaseMetrics(); releaseOptions(); await metrics; await assert.rejects(options, /connection changed/i);
  assert.equal(h.app.store.get("account", account.id), null); assert.equal(h.app.store.get("delivery", delivery.id), null);
});

test("signed TikTok removal events reject tampering and replay and do not erase a newer authorization", async t => {
  const h = fixture(t); h.account("open-id", "tiktok");
  const seconds = Math.floor(h.now() / 1000);
  const body = Buffer.from(JSON.stringify({ client_key: "test-client", event: "authorization.removed", user_openid: "open-id", create_time: seconds }));
  const signature = timestamp => `t=${timestamp},s=${createHmac("sha256", "test-secret").update(`${timestamp}.`).update(body).digest("hex")}`;
  assert.throws(() => h.app.privacy.tiktokWebhook(body, signature(seconds - 301)), /signature/i);
  assert.throws(() => h.app.privacy.tiktokWebhook(Buffer.from("{}"), signature(seconds)), /signature/i);
  assert.equal(h.app.privacy.tiktokWebhook(body, signature(seconds)).received, true);
  await h.app.privacy.tick(); assert.equal(h.app.store.get("account", "open-id"), null);
  assert.deepEqual(h.providers.tiktok.revoked, []);
  h.advance(2000); h.account("open-id", "tiktok");
  h.app.privacy.tiktokWebhook(body, signature(seconds));
  assert.equal(h.app.store.get("account", "open-id").status, "connected");
});

test("Pinterest board validation and metrics work without persisting API profile, board or metrics caches", async t => {
  const h = fixture(t), account = h.account("pin", "pinterest");
  const provider = new PinterestProvider({ env: { PINTEREST_CLIENT_ID: "test", PINTEREST_CLIENT_SECRET: "test" } });
  provider.options = async () => ({ boards: [{ id: "board", name: "Fresh board" }], limits: [] });
  provider.accounts = async () => [{ remoteId: "pin", label: "Fresh profile", avatar: "https://example.com/fresh" }];
  provider.metrics = async () => ({ values: { saves: 12, impressions: 24 } });
  h.app.registry.providers.set("pinterest", provider);
  h.app.store.put("account", { ...account, options: { boards: [{ id: "old", name: "Old board" }] } });
  h.post("pin-post", [account]);
  h.app.store.put("delivery", { ...h.app.store.get("delivery", "pin-post:pin"), status: "published", externalId: "pin-id", metrics: { saves: 99 }, metricsHistory: [{ at: h.now(), values: { saves: 99 } }], metricsUpdatedAt: h.now() });
  h.app.privacy.prune();
  assert.equal(h.app.store.get("account", "pin").label, "Pinterest account");
  assert.equal(h.app.store.get("account", "pin").options, null);
  assert.equal((await h.app.accounts.listFresh("alice", h.project.id))[0].label, "Fresh profile");
  const options = await h.app.accounts.options("alice", h.project.id, "pin");
  assert.equal(options.boards[0].name, "Fresh board");
  assert.equal(h.app.store.get("account", "pin").options, null);
  const content = { caption: "Caption", title: "Pin title", format: "image", settings: { boardId: "board" }, media: [{ kind: "image", mime: "image/jpeg", bytes: 100, width: 500, height: 500 }] };
  assert.ok(!provider.validate({ ...content, accountOptions: options }).some(error => /board/i.test(error)));
  const result = await h.app.analytics.refresh("alice", h.project.id);
  assert.equal(result.posts[0].deliveries[0].metrics.saves, 12);
  assert.equal(h.app.store.get("delivery", "pin-post:pin").metrics, null);
  assert.deepEqual(h.app.store.get("delivery", "pin-post:pin").metricsHistory, []);
  assert.equal(h.app.analytics.report("alice", h.project.id).posts[0].deliveries[0].metrics, null);
});

test("YouTube data expires after thirty days and a missing video removes its stored API identifiers and metrics", async t => {
  const h = fixture(t), account = h.account("yt", "youtube"); h.post("yt-post", [account]);
  let delivery = h.app.store.get("delivery", "yt-post:yt");
  h.app.store.put("delivery", { ...delivery, status: "published", externalId: "removed-video", metrics: { views: 100 }, metricsHistory: [{ at: h.now(), values: { views: 100 } }], metricsUpdatedAt: h.now(), progress: { videoId: "removed-video" } });
  h.providers.youtube.metrics = async () => ({ values: {}, removed: true });
  await h.app.analytics.syncDelivery(h.app.store.get("delivery", delivery.id));
  delivery = h.app.store.get("delivery", delivery.id);
  assert.equal(delivery.externalId, null); assert.equal(delivery.metrics, null); assert.deepEqual(delivery.metricsHistory, []); assert.deepEqual(delivery.progress, {});
  h.advance(30 * DAY + 1); await h.app.privacy.tick(); await h.app.privacy.tick();
  const retained = h.app.store.get("account", "yt");
  assert.equal(retained.status, "connected"); assert.ok(retained.encryptedCredentials);
  assert.equal(retained.label, "YouTube channel"); assert.equal(retained.avatar, null); assert.equal(retained.options, null);
});

test("existing publication and analytics work without a workspace-wide policy agreement", async t => {
  const h = fixture(t), account = h.account(); h.post("hold", [account]);
  assert.deepEqual(h.app.store.list("privacyConsent"), []);
  let calls = 0; h.providers.x.publish = async () => { calls++; return { status: "published", externalId: "post" }; };
  await h.app.worker.tick(); assert.equal(calls, 1);
  await h.app.analytics.syncDelivery(h.app.store.get("delivery", "hold:one"));
  assert.equal(h.app.store.get("delivery", "hold:one").metrics.likes, 8);
});

test("legacy PostHog deletion persists its person lookup and waits for verified external completion", async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  const uuid = "12345678-1234-1234-1234-123456789abc", uid = "user_alice";
  let completed = false, deletes = 0, lookups = 0;
  const service = new AnalyticsErasureService({ store, env: { POSTHOG_PROJECT_ID: "123", POSTHOG_PERSONAL_API_KEY: "test-key" }, fetcher: async (url, options) => {
    if (url.includes("distinct_id=")) { lookups++; return Response.json({ results: [{ uuid, distinct_ids: [uid, "anonymous-id"] }] }); }
    if (url.includes("bulk_delete")) { deletes++; assert.deepEqual(JSON.parse(options.body).distinct_ids, [uid]); return Response.json({ events_queued_for_deletion: true, recordings_queued_for_deletion: false, deletion_errors: [] }); }
    assert.match(url, /deletion_status.*person_uuid=/);
    return Response.json({ results: [{ person_uuid: uuid, status: completed ? "completed" : "pending", delete_verified_at: completed ? "2026-09-12T12:01:00Z" : null }] });
  } });
  assert.equal(await service.deleteForOwner(uid), false);
  assert.equal(await service.deleteForOwner(uid), false);
  completed = true; assert.equal(await service.deleteForOwner(uid), true);
  assert.equal(deletes, 1); assert.equal(lookups, 1); assert.equal(store.get("processor_erasure", uid), null);
});

test("account erasure waits for an authenticated request to finish before removing its workspace", async t => {
  const h = fixture(t);
  const response = { once() {} }, release = h.app.privacy.track("alice", response);
  h.app.privacy.requestAccount("alice", { confirmation: "DELETE" });
  await h.app.privacy.tick(); assert.ok(h.app.store.get("project", h.project.id));
  release(); await h.app.privacy.tick();
  assert.equal(h.app.store.get("project", h.project.id), null);
  assert.equal(h.app.privacy.status("alice").deletion.status, "complete");
});

test("an OAuth response started before disconnect cannot save a new connection after removal", async t => {
  const h = fixture(t), account = h.account();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.providers.x.exchange = async () => { entered(); await new Promise(resolve => { release = resolve; }); return { accessToken: "late-token" }; };
  h.providers.x.accounts = async () => [{ remoteId: "one", label: "Late profile" }];
  h.app.store.saveState(SecretVault.hash("state"), { uid: "alice", projectId: h.project.id, platform: "x", verifier: "verifier", createdAt: h.now() }, h.now() + DAY);
  const callback = h.app.accounts.callback("x", new URLSearchParams({ state: "state", code: "code" }));
  await started; h.advance(1);
  h.app.privacy.requestConnection("alice", h.project.id, account.id); await h.app.privacy.tick();
  release(); await assert.rejects(callback, /predates connection removal/i);
  await h.app.privacy.tick();
  assert.deepEqual(h.app.store.list("connection"), []);
  assert.deepEqual(h.app.store.list("account"), []);
});

test("a callback stalled past lost-channel cleanup cannot recreate the purged YouTube account", async t => {
  const h = fixture(t), account = h.account("channel", "youtube");
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.providers.youtube.exchange = async () => { entered(); await new Promise(resolve => { release = resolve; }); return { accessToken: "late-token" }; };
  h.providers.youtube.accounts = async () => [{ remoteId: account.remoteId, label: "Late channel" }];
  h.app.store.saveState(SecretVault.hash("youtube-state"), { uid: "alice", projectId: h.project.id, platform: "youtube", verifier: "verifier", privacyConsent: { accepted: true, platform: "youtube", version: CONNECTION_PRIVACY_VERSION }, createdAt: h.now() }, h.now() + 10 * 60000);
  const callback = h.app.accounts.callback("youtube", new URLSearchParams({ state: "youtube-state", code: "code" }));
  await started;
  h.app.privacy.requestLostAccess(account);
  h.advance(6 * DAY);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id), null);

  release();
  await assert.rejects(callback, /expired/i);
  assert.deepEqual(h.app.store.list("connection"), []);
  assert.deepEqual(h.app.store.list("account"), []);
});

test("Bluesky erasure preserves another owner's pending session and prunes it when that connection expires", async t => {
  const h = fixture(t), did = "did:plc:shared", account = h.account("blue", "bluesky", { remoteId: did });
  const provider = new BlueskyProvider({ store: h.app.store, vault: h.app.vault });
  await provider.encryptedStore("blueskySession").set(did, { refreshToken: "bluesky-session-token" });
  h.app.store.put("connection", { id: "bob-pending", ownerUid: "bob", platform: "bluesky", expiresAt: h.now() + DAY, encrypted: h.app.vault.encrypt([{ remoteId: did, credentials: { did } }], "connection:bob-pending") });
  h.app.privacy.requestConnection("alice", h.project.id, account.id);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id), null);
  assert.ok(h.app.store.get("blueskySession", SecretVault.hash(did)));
  h.advance(DAY + 1); await h.app.privacy.tick();
  assert.equal(h.app.store.get("blueskySession", SecretVault.hash(did)), null);
});

test("Bluesky state belongs to its owner and a deleted owner's callback cannot create an SDK session", async t => {
  const h = fixture(t), provider = new BlueskyProvider({ store: h.app.store, vault: h.app.vault });
  h.app.registry.providers.set("bluesky", provider);
  h.app.store.saveState(SecretVault.hash("app-state"), { uid: "alice", projectId: h.project.id, platform: "bluesky", createdAt: h.now() }, Date.now() + DAY);
  await provider.encryptedStore("blueskyState").set("sdk-state", { appState: "app-state", verifier: "sdk-verifier" });
  assert.equal(h.app.store.get("blueskyState", SecretVault.hash("sdk-state")).ownerUid, "alice");
  assert.equal(await provider.authorizationState(new URLSearchParams({ state: "sdk-state" })), "app-state");
  let sdkCalls = 0;
  Object.defineProperty(provider, "configured", { get: () => true });
  provider.finishAuthorization = async () => { sdkCalls++; throw new Error("SDK should not run"); };
  h.app.privacy.requestAccount("alice", { confirmation: "DELETE" }); await h.app.privacy.tick();
  assert.deepEqual(h.app.store.list("blueskyState"), []);
  await assert.rejects(h.app.accounts.callback("bluesky", new URLSearchParams({ state: "sdk-state" })), /expired/i);
  assert.equal(sdkCalls, 0);
});

test("missing encryption keys do not prevent local account erasure", async t => {
  const h = fixture(t), account = h.account("yt", "youtube");
  h.app.vault.key = null;
  h.app.privacy.requestConnection("alice", h.project.id, account.id);
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", "yt"), null);
  const [job] = h.app.store.list("revocation"); assert.ok(job.encrypted);
  h.advance(7 * DAY + 1); await h.app.privacy.tick();
  assert.equal(h.app.store.get("revocation", job.id).encrypted, undefined);
});

test("Pinterest queue validation and delivery receive fresh boards even though the saved account has no options", async t => {
  const h = fixture(t); h.account("pin", "pinterest");
  const provider = new PinterestProvider({ env: { PINTEREST_CLIENT_ID: "test", PINTEREST_CLIENT_SECRET: "test" } });
  let reads = 0, published = 0;
  provider.options = async () => { reads++; return { boards: [{ id: "board", name: "Current board" }], limits: [] }; };
  provider.publish = async ctx => { assert.equal(ctx.content.accountOptions.boards[0].id, "board"); published++; return { status: "published", externalId: "new-pin" }; };
  h.app.registry.providers.set("pinterest", provider);
  h.app.store.put("media", { id: "image", ownerUid: "alice", projectId: h.project.id, status: "ready", kind: "image", mime: "image/jpeg", storageKey: "image.jpg", filename: "image.jpg", width: 800, height: 800, bytes: 1024, variants: {} });
  const result = await h.app.posts.submit("alice", h.project.id, { requestId: "pinterest-fresh-boards-test", items: [{ caption: "My Pin", title: "Pin", accountIds: ["pin"], mediaIds: ["image"], format: "image", overrides: { pin: { settings: { boardId: "board" } } }, schedule: { mode: "now", timeZone: "UTC" } }] });
  await h.app.worker.tick();
  assert.equal(published, 1); assert.ok(reads >= 2);
  assert.equal(h.app.store.get("account", "pin").options, null);
  assert.equal(h.app.store.get("delivery", result.posts[0].deliveries[0].id).status, "published");
});

test("maintenance removes legacy disconnected profiles and abandoned files while preserving owned media", async t => {
  const h = fixture(t);
  h.account("legacy", "x", { status: "disconnected", encryptedCredentials: null });
  const id = "12345678-1234-1234-1234-123456789abc", keptId = "22345678-1234-1234-1234-123456789abc";
  const abandoned = h.app.storage.path(`${id}.jpg`), kept = h.app.storage.path(`${keptId}.jpg`), incoming = path.join(h.app.privacy.incomingDirectory, "a".repeat(32));
  for (const file of [abandoned, kept, incoming]) { fs.writeFileSync(file, "old bytes"); fs.utimesSync(file, new Date(h.now() - 2 * DAY), new Date(h.now() - 2 * DAY)); }
  h.app.store.put("media", { id: keptId, ownerUid: "alice", projectId: h.project.id, storageKey: `${keptId}.jpg` });
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", "legacy"), null);
  assert.equal(fs.existsSync(abandoned), false); assert.equal(fs.existsSync(incoming), false); assert.equal(fs.existsSync(kept), true);
});

test("deletion expires outstanding checkouts, cancels each subscription, and handles duplicate late billing webhooks", async t => {
  const h = fixture(t), app = h.app, cancelled = [], expired = [];
  const subscriptions = { first: { id: "first", status: "active" }, second: { id: "second", status: "trialing" } };
  app.store.put("checkout_session", { id: "open", ownerUid: "alice" });
  app.store.put("checkout_session", { id: "paid", ownerUid: "alice" });
  app.store.put("billing", { id: "alice", ownerUid: "alice", subscriptionId: "first" });
  app.billing.env.STRIPE_WEBHOOK_SECRET = "test-webhook";
  app.billing.stripe = {
    checkout: { sessions: { retrieve: async id => ({ id, status: id === "open" ? "open" : "complete", subscription: id === "paid" ? "second" : null }), expire: async id => expired.push(id) } },
    subscriptions: { retrieve: async id => subscriptions[id], cancel: async id => { assert.notEqual(subscriptions[id].status, "canceled"); subscriptions[id].status = "canceled"; cancelled.push(id); } },
    webhooks: { constructEvent: () => ({ type: "customer.subscription.updated", data: { object: { id: "first", status: "active", metadata: { meadowUserId: "alice" } } } }) },
  };
  app.privacy.requestAccount("alice", { confirmation: "DELETE" }); await app.privacy.tick();
  assert.deepEqual(expired, ["open"]); assert.deepEqual(cancelled.sort(), ["first", "second"]);
  assert.deepEqual(app.store.list("checkout_session"), []);
  await app.billing.webhook(Buffer.from("{}"), "signature"); await app.billing.webhook(Buffer.from("{}"), "signature");
  assert.equal(cancelled.length, 2); assert.equal(app.store.get("billing", "alice"), null);
});

test("Google and TikTok revocation use the documented token endpoints and reject unconfirmed responses", async () => {
  const google = new YouTubeProvider({ transport: new HttpTransport({ fetcher: async (url, options) => {
    assert.equal(url, "https://oauth2.googleapis.com/revoke"); assert.equal(options.method, "POST"); assert.equal(options.body.get("token"), "refresh-token");
    return Response.json({ error: "invalid_token" }, { status: 400 });
  } }) });
  assert.equal((await google.revoke({ accessToken: "access-token", refreshToken: "refresh-token" })).remoteRevocation, true);
  google.http = new HttpTransport({ fetcher: async () => Response.json({ error: "invalid_request" }, { status: 400 }) });
  await assert.rejects(google.revoke({ accessToken: "token" }), /could not revoke/i);
  const tiktok = new TikTokProvider({ env: { TIKTOK_CLIENT_KEY: "client", TIKTOK_CLIENT_SECRET: "secret" }, transport: new HttpTransport({ fetcher: async (url, options) => {
    assert.equal(url, "https://open.tiktokapis.com/v2/oauth/revoke/"); assert.equal(options.method, "POST");
    assert.deepEqual(Object.fromEntries(options.body), { client_key: "client", client_secret: "secret", token: "access-token" });
    return Response.json({ error: { code: "ok" } });
  } }) });
  assert.equal((await tiktok.revoke({ accessToken: "access-token" })).remoteRevocation, true);
});

test("turning off a platform does not prevent its pending token revocation", async t => {
  const h = fixture(t), account = h.account("yt", "youtube");
  h.app.registry.disabled.add("youtube");
  h.app.privacy.requestConnection("alice", h.project.id, account.id);
  await h.app.privacy.tick(); await h.app.privacy.tick();
  assert.deepEqual(h.providers.youtube.revoked, ["token-yt"]);
  assert.deepEqual(h.app.store.list("revocation"), []);
});

test("completed PostHog event deletion alone does not confirm queued recording deletion", async t => {
  const store = new SqliteStore(); t.after(() => store.close());
  const uuid = "12345678-1234-1234-1234-123456789abc";
  store.put("processor_erasure", { id: "user_alice", ownerUid: "user_alice", uuids: [uuid], status: "waiting", queued: true, recordingsQueued: true });
  const service = new AnalyticsErasureService({ store, env: { POSTHOG_PROJECT_ID: "123", POSTHOG_PERSONAL_API_KEY: "test" }, fetcher: async () => Response.json({ results: [{ person_uuid: uuid, status: "completed", delete_verified_at: "2026-09-12T12:00:00Z" }] }) });
  assert.equal(await service.deleteForOwner("user_alice"), false);
  assert.ok(store.get("processor_erasure", "user_alice"));
});
