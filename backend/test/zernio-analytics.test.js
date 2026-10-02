import test from "node:test";
import assert from "node:assert/strict";
import { AnalyticsService } from "../src/bridge/services/AnalyticsService.js";

function fixture(start = "2026-10-02T12:00:00Z") {
  let now = Date.parse(start), reads = 0;
  const data = new Map(), store = {
    get: (kind, id) => data.get(`${kind}:${id}`) || null,
    put: (kind, record) => { data.set(`${kind}:${record.id}`, record); return record; },
    list: (kind, filters = {}) => [...data.entries()].filter(([key, value]) => key.startsWith(`${kind}:`) && Object.entries(filters).every(([field, match]) => value[field] === match)).map(([, value]) => value),
  };
  const account = store.put("account", { id: "acct", projectId: "project", ownerUid: "alice", platform: "tiktok", remoteId: "zernio:remote", label: "Creator", status: "connected", authorizationId: "grant1", encryptedCredentials: "encrypted-grant1" });
  const networkPost = { id: "native", externalId: "native", zernioPostId: "zernio-post", title: "External post", publishedAt: now - 86400000, values: { views: 42, likes: 0 } };
  const provider = {
    accountPostAnalytics: async () => { reads++; return { posts: [networkPost], note: "Includes connected-account posts from the last 90 days." }; },
    metrics: async () => ({ values: { views: 42, likes: 0 } }),
  };
  const accounts = { list: (uid, projectId) => store.list("account", { projectId }).filter(account => !["disconnected", "deleting"].includes(account.status)).map(({ encryptedCredentials, authorizationId, ...publicAccount }) => publicAccount), withCredentials: async (account, operation) => operation({ zernioAccountId: "remote", zernioProfileId: "profile" }), privacy: { blocked: () => false } };
  const projects = { require: uid => assert.equal(uid, "alice") };
  const posts = { list: (uid, projectId) => store.list("post", { projectId }).map(post => ({ ...post, deliveries: store.list("delivery", { projectId }).filter(delivery => delivery.postId === post.id) })) };
  const service = new AnalyticsService({ store, accounts, projects, posts, registry: { get: () => provider }, clock: () => now });
  const meadowPost = () => {
    store.put("post", { id: "meadow", projectId: "project", title: "Meadow post", media: [], createdAt: now });
    return store.put("delivery", { id: "delivery", postId: "meadow", projectId: "project", accountId: "acct", platform: "tiktok", status: "published", externalId: "native", progress: { zernioPostId: "zernio-post" } });
  };
  return { service, store, account, accounts, provider, networkPost, meadowPost, advance: ms => { now += ms; }, now: () => now, reads: () => reads };
}

test("Zernio analytics show native posts on an account with no Meadow deliveries", async () => {
  const h = fixture(), report = await h.service.refresh("alice", "project");
  assert.equal(report.accounts[0].totals.values.views, 42); assert.equal(report.accounts[0].totals.values.likes, 0);
  assert.equal(report.accounts[0].totals.values.comments, null);
  assert.equal(report.posts[0].source, "connected_account"); assert.equal(report.publishedCount, 1);
  assert.equal(report.accounts[0].posts[0].delivery.metricsHistory.length, 1);
  assert.match(report.sourceLabel, /connected-account posts/);
  assert.equal(h.store.list("post").length, 0); assert.equal(h.store.list("delivery").length, 0);
  assert.doesNotMatch(JSON.stringify(report), /encrypted-grant1|zernioAccountId|zernioProfileId|authorizationId/);
  assert.throws(() => h.service.report("bob", "project"));
});

test("Zernio analytics do not count a Meadow delivery twice under either identifier", async () => {
  for (const externalId of ["native", "different-id"]) {
    const h = fixture(), delivery = h.meadowPost();
    h.store.put("delivery", { ...delivery, externalId });
    const report = await h.service.refresh("alice", "project");
    assert.equal(report.posts.length, 1); assert.equal(report.publishedCount, 1);
    assert.equal(report.totals.values.views, 42); assert.equal(report.accounts[0].posts.length, 1);
  }
});

test("Zernio account refreshes are coalesced, cooled down, and expire after 30 minutes", async () => {
  const h = fixture();
  await Promise.all([h.service.refresh("alice", "project"), h.service.refresh("alice", "project")]);
  assert.equal(h.reads(), 1);
  await h.service.refresh("alice", "project"); assert.equal(h.reads(), 1);
  h.advance(61000); await h.service.refresh("alice", "project"); assert.equal(h.reads(), 2);
  h.advance(30 * 60000 + 1); assert.equal(h.service.report("alice", "project").posts.length, 0);
  assert.equal(h.service.networkSnapshots.size, 0);
});

test("Failed and pending Zernio reads retain measured values and daily history", async () => {
  const h = fixture("2026-10-02T23:58:00Z");
  await h.service.refresh("alice", "project");
  h.advance(61000); h.provider.accountPostAnalytics = async () => { throw new Error("Analytics access is not enabled."); };
  let report = await h.service.refresh("alice", "project");
  assert.equal(report.accounts[0].totals.values.views, 42); assert.match(report.accounts[0].metricsError, /access is not enabled/);
  assert.equal(h.store.get("account", "acct").status, "connected");
  h.advance(61000); h.provider.accountPostAnalytics = async () => ({ posts: [{ ...h.networkPost, values: {}, pending: true, note: "Still syncing." }] });
  report = await h.service.refresh("alice", "project");
  assert.equal(report.accounts[0].totals.values.views, 42); assert.equal(report.accounts[0].posts[0].delivery.metricsNote, "Still syncing.");
  assert.equal(report.accounts[0].posts[0].delivery.metricsHistory.length, 1);
  assert.equal(report.accounts[0].metricsError, null);
});

test("Pending Zernio Meadow metrics preserve the last measured timestamp", async () => {
  const h = fixture(), delivery = h.meadowPost();
  h.store.put("delivery", { ...delivery, metrics: { views: 42 }, metricsUpdatedAt: h.now(), metricsHistory: [{ at: h.now(), values: { views: 42 } }] });
  h.advance(61000); h.provider.metrics = async () => ({ values: {}, pending: true, note: "Still syncing." });
  await h.service.syncDelivery(h.store.get("delivery", "delivery"));
  const result = h.store.get("delivery", "delivery");
  assert.equal(result.metrics.views, 42); assert.equal(result.metricsUpdatedAt, h.now() - 61000);
  assert.equal(result.metricsHistory.length, 1); assert.equal(result.metricsNote, "Still syncing.");
});

test("Zernio caches disappear after disconnection, grant replacement, or blocked privacy", async () => {
  for (const change of [account => ({ ...account, status: "disconnected" }), account => ({ ...account, authorizationId: "grant2" }), account => ({ ...account, encryptedCredentials: "encrypted-grant2" }), account => account]) {
    const h = fixture();
    await h.service.refresh("alice", "project");
    const changed = change(h.account); h.store.put("account", changed);
    if (changed === h.account) h.accounts.privacy.blocked = () => true;
    assert.equal(h.service.report("alice", "project").posts.length, 0);
  }
});

test("A Zernio read finishing after reconnect is discarded", async () => {
  const h = fixture();
  h.provider.accountPostAnalytics = async () => { h.store.put("account", { ...h.account, authorizationId: "grant2" }); return { posts: [h.networkPost] }; };
  const report = await h.service.refresh("alice", "project");
  assert.equal(report.posts.length, 0); assert.equal(h.service.networkSnapshots.size, 0);
});

test("Pinterest connected-account metrics are transient and never fetched by the background worker", async () => {
  const h = fixture(); h.store.put("account", { ...h.account, platform: "pinterest" });
  const report = await h.service.refresh("alice", "project");
  assert.equal(report.accounts[0].totals.values.views, 42); assert.equal(h.service.networkSnapshots.size, 0);
  assert.equal(h.service.report("alice", "project").posts.length, 0);
  await h.service.tick(); assert.equal(h.reads(), 1);
});

test("The analytics worker fetches Zernio accounts even before their first Meadow post", async () => {
  const h = fixture();
  await h.service.tick(); assert.equal(h.reads(), 1);
  assert.equal(h.service.report("alice", "project").accounts[0].totals.values.views, 42);
  await h.service.tick(); assert.equal(h.reads(), 1);
  h.advance(15 * 60000 + 1); await h.service.tick(); assert.equal(h.reads(), 2);
});
