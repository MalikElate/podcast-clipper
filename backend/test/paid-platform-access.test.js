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
import { PAID_PLATFORMS } from "../src/bridge/services/PlatformAccess.js";

const paidError = error => error.code === "paid_plan_required" && error.status === 403;
class Provider extends PlatformProvider {
  constructor(id) { super(id); this.calls = []; }
  get configured() { return true; }
  async authorizationUrl({ state }) { this.calls.push("authorize"); return `https://authorize.example/?state=${state}`; }
  async exchange({ code }) { this.calls.push("exchange"); return { accessToken: code }; }
  async accounts({ accessToken }) { this.calls.push("accounts"); return accessToken.split(",").map(remoteId => ({ remoteId, label: remoteId })); }
  async options() { this.calls.push("options"); return {}; }
  validate() { return []; }
  async publish() { this.calls.push("publish"); return { status: "published", externalId: "published" }; }
  async revoke() { this.calls.push("revoke"); }
}

function fixture(t, { uid = "alice", env = {} } = {}) {
  const now = Date.parse("2026-10-21T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paid-platform-access-"));
  const providers = Object.fromEntries([...PAID_PLATFORMS, "x"].map(id => [id, new Provider(id)]));
  const app = new BridgeApplication({ store: new SqliteStore(), registry: new ProviderRegistry(Object.values(providers)), clock: () => now,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test", BRIDGE_APP_URL: "https://meadow.example", ...env },
    authMiddleware: (req, res, next) => { req.uid = uid; next(); } });
  const project = app.projects.create(uid, { name: "Main", timeZone: "UTC" });
  const billing = (status = "active", planId = "starter") => app.store.put("billing", { id: uid, ownerUid: uid, subscriptionId: `sub_${uid}`, status, planId });
  const start = async platform => new URL((await app.accounts.start(uid, project.id, platform)).url).searchParams.get("state");
  const callback = (platform, state, ids = "one") => app.accounts.callback(platform, new URLSearchParams({ state, code: ids }));
  const item = accountId => ({ caption: "Test", accountIds: [accountId], mediaIds: [], schedule: { mode: "now", timeZone: "UTC" } });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, uid, project, providers, billing, start, callback, item };
}

test("only active paid plans or exact complimentary Pro grants can begin paid-platform connections", async t => {
  const h = fixture(t);
  for (const status of [null, "free", "canceled", "incomplete", "incomplete_expired", "unpaid", "paused", "past_due", "unknown"]) {
    h.billing(status);
    assert.equal(h.app.billing.publicRecord(h.uid).platformAccess.hasPaidAccess, false, String(status));
    for (const platform of PAID_PLATFORMS) await assert.rejects(h.start(platform), paidError);
  }
  for (const planId of [null, "free", "invented"]) {
    h.billing("active", planId);
    await assert.rejects(h.start("facebook"), paidError);
  }
  for (const provider of Object.values(h.providers)) assert.equal(provider.calls.length, 0, "denied starts never reach a provider");
  await h.start("x");
  for (const planId of ["starter", "creator", "growth", "pro"]) for (const status of ["active", "trialing"]) {
    h.billing(status, planId);
    assert.equal(h.app.billing.publicRecord(h.uid).platformAccess.hasPaidAccess, true);
    for (const platform of PAID_PLATFORMS) await h.start(platform);
  }
  const grant = fixture(t, { uid: "user_Grantee", env: { BRIDGE_COMPLIMENTARY_PRO_UIDS: "user_Grantee" } });
  grant.billing("past_due");
  assert.equal(grant.app.billing.publicRecord(grant.uid).status, "past_due", "financial state remains accurate");
  assert.equal(grant.app.billing.publicRecord(grant.uid).platformAccess.hasPaidAccess, true);
  for (const platform of PAID_PLATFORMS) await grant.start(platform);
  const other = fixture(t, { uid: "user_GranteeExtra", env: { BRIDGE_COMPLIMENTARY_PRO_UIDS: "user_Grantee" } });
  await assert.rejects(other.start("facebook"), paidError);
});

test("callbacks recheck entitlement before exchange and after provider calls, including Zernio-style callbacks", async t => {
  for (const platform of PAID_PLATFORMS) for (const external of [false, true]) {
    const h = fixture(t), provider = h.providers[platform];
    if (external) {
      provider.authorizationState = params => params.get("state");
      provider.finishAuthorization = async params => {
        provider.calls.push("finish");
        return { credentials: { accessToken: "token" }, candidates: [{ remoteId: "one", label: "One" }] };
      };
    }
    h.billing();
    const state = await h.start(platform);
    h.billing("canceled");
    await assert.rejects(h.callback(platform, state), paidError);
    assert.deepEqual(provider.calls, ["authorize"]);
    h.billing();
    const next = await h.start(platform);
    if (external) provider.finishAuthorization = async () => {
      h.billing("canceled");
      return { candidates: [{ remoteId: "one", label: "One" }] };
    };
    else provider.accounts = async () => { h.billing("canceled"); return [{ remoteId: "one", label: "One" }]; };
    await assert.rejects(h.callback(platform, next), paidError);
    assert.equal(h.app.store.list("connection").length, 0);
    assert.equal(h.app.store.list("account").length, 0);
  }
});

test("a pending multi-account selection cannot bypass a downgrade and can resume after upgrading", async t => {
  const h = fixture(t); h.billing();
  const result = await h.callback("facebook", await h.start("facebook"), "one,two");
  h.billing("canceled");
  await assert.rejects(h.app.accounts.pending(h.uid, h.project.id, result.connectionId), paidError);
  assert.throws(() => h.app.accounts.attach(h.uid, h.project.id, result.connectionId, ["one", "two"]), paidError);
  assert.equal(h.app.store.list("account").length, 0);
  h.billing();
  assert.equal(h.app.accounts.attach(h.uid, h.project.id, result.connectionId, ["one", "two"]).length, 2);
});

test("a downgrade blocks cached credentials, queue submission, and already queued publishing while retaining disconnect", async t => {
  const h = fixture(t); h.billing();
  const { accounts: [account] } = await h.callback("threads", await h.start("threads"));
  const body = { requestId: "paid-platform-queue-123", items: [h.item(account.id)] };
  await h.app.accounts.options(h.uid, h.project.id, account.id);
  const { posts: [post] } = await h.app.posts.submit(h.uid, h.project.id, body);
  h.billing("canceled");
  await assert.rejects(h.app.accounts.credentials(account), paidError);
  await assert.rejects(h.app.accounts.options(h.uid, h.project.id, account.id), paidError);
  await assert.rejects(h.app.posts.submit(h.uid, h.project.id, { ...body, requestId: "paid-platform-denied-123" }), paidError);
  await h.app.worker.tick();
  assert.equal(h.providers.threads.calls.includes("publish"), false);
  const delivery = h.app.posts.get(h.uid, h.project.id, post.id).deliveries[0];
  assert.equal(delivery.status, "failed");
  assert.match(delivery.error, /paid Meadow plan/);
  assert.equal(h.app.accounts.list(h.uid, h.project.id).length, 1);
  assert.doesNotThrow(() => h.app.accounts.disconnect(h.uid, h.project.id, account.id));
  await h.app.privacy.tick();
  assert.equal(h.app.store.get("account", account.id), null);
});

test("callback redirects return the paid-plan code for an upgrade action", async t => {
  const h = fixture(t); h.billing();
  const state = await h.start("instagram"); h.billing("canceled");
  const server = await new Promise(resolve => { const listening = h.app.app.listen(0, "127.0.0.1", () => resolve(listening)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/oauth/instagram/callback?state=${state}&code=one`, { redirect: "manual" });
    assert.equal(response.status, 303);
    const target = new URL(response.headers.get("location"));
    assert.equal(target.searchParams.get("connectionErrorCode"), "paid_plan_required");
    assert.match(target.searchParams.get("connectionError"), /paid Meadow plan/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("an in-flight downgrade is rechecked at queue commit and immediately before publishing", async t => {
  const h = fixture(t); h.billing();
  const { accounts: [account] } = await h.callback("facebook", await h.start("facebook"));
  const body = { requestId: "paid-race-submission-123", items: [h.item(account.id)] };
  await assert.rejects(h.app.posts.submit(h.uid, h.project.id, body, { beforeCommit: () => h.billing("canceled") }), paidError);
  assert.equal(h.app.store.list("post").length, 0);
  assert.equal(h.app.store.list("delivery").length, 0);
  h.billing();
  const { posts: [post] } = await h.app.posts.submit(h.uid, h.project.id, body);
  const flush = h.app.store.flush?.bind(h.app.store);
  h.app.store.flush = async () => {
    if (h.app.store.get("delivery", post.deliveries[0].id)?.status === "publishing") h.billing("canceled");
    await flush?.();
  };
  await h.app.worker.tick();
  assert.equal(h.providers.facebook.calls.includes("publish"), false);
  assert.equal(h.app.posts.get(h.uid, h.project.id, post.id).deliveries[0].status, "failed");
});

test("a downgrade preserves an accepted post's polling checkpoint so upgrading cannot publish it twice", async t => {
  const h = fixture(t); h.billing();
  const provider = h.providers.instagram;
  provider.publish = async () => { provider.calls.push("publish"); return { status: "processing", externalId: "accepted", progress: { publishId: "accepted" } }; };
  provider.poll = async context => {
    provider.calls.push("poll");
    assert.equal(context.progress.publishId, "accepted");
    return { status: "published", externalId: "accepted" };
  };
  const { accounts: [account] } = await h.callback("instagram", await h.start("instagram"));
  const { posts: [post] } = await h.app.posts.submit(h.uid, h.project.id, { requestId: "paid-poll-submission-123", items: [h.item(account.id)] });
  await h.app.worker.tick();
  const delivery = h.app.store.get("delivery", post.deliveries[0].id);
  h.app.store.put("delivery", { ...delivery, dueAt: 0 });
  h.billing("canceled");
  await h.app.worker.tick();
  assert.equal(h.app.store.get("delivery", delivery.id).resumeStatus, "processing");
  assert.equal(provider.calls.includes("poll"), false);
  assert.throws(() => h.app.posts.retry(h.uid, h.project.id, delivery.id), paidError);
  h.billing();
  h.app.posts.retry(h.uid, h.project.id, delivery.id);
  await h.app.worker.tick();
  assert.equal(provider.calls.filter(call => call === "publish").length, 1);
  assert.equal(provider.calls.filter(call => call === "poll").length, 1);
  assert.equal(h.app.store.get("delivery", delivery.id).status, "published");
});
