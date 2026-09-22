import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";

function setup(t) {
  let now = Date.parse("2026-09-22T12:00:00Z"), nextId = 0;
  const calls = [], modes = new Map();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-delivery-"));
  const env = { BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test", BRIDGE_PUBLIC_URL: "https://meadow.example", BRIDGE_APP_URL: "https://meadow.example", TIKTOK_CLIENT_KEY: "test", TIKTOK_CLIENT_SECRET: "test" };
  const provider = new TikTokProvider({ env, clock: () => now, transport: { request: async (url, options) => {
    calls.push({ url, options });
    if (url.includes("creator_info/query")) return { data: { creator_nickname: "Demo", creator_username: "demo", privacy_level_options: ["SELF_ONLY"], max_video_post_duration_sec: 600 } };
    if (url.includes("/init/")) {
      const id = `transfer-${++nextId}`;
      modes.set(id, url.includes("/inbox/") || options.json.post_mode === "MEDIA_UPLOAD" ? "inbox" : "direct");
      return { data: { publish_id: id } };
    }
    if (url.includes("status/fetch")) return { data: modes.get(options.json.publish_id) === "inbox" ? { status: "SEND_TO_USER_INBOX" } : { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["123456789"] } };
    if (url.includes("video/query")) return { data: { videos: [{ id: "123456789", view_count: 10 }] } };
    assert.fail(`Unexpected TikTok request: ${url}`);
  } } });
  const app = new BridgeApplication({ store: new SqliteStore(), registry: new ProviderRegistry([provider]), env, clock: () => now });
  const project = app.projects.create("alice", { name: "TikTok test", timeZone: "UTC" });
  const account = (id = "tiktok", scope = "user.info.basic,video.publish,video.upload,video.list") => app.store.put("account", {
    id, ownerUid: "alice", projectId: project.id, platform: "tiktok", remoteId: id, label: id, rateKey: `tiktok:${id}`, status: "connected", authorizationId: `grant-${id}`,
    encryptedCredentials: app.vault.encrypt({ accessToken: `token-${id}`, scope }, `account:${id}`),
  });
  account();
  const video = app.store.put("media", { id: "video", ownerUid: "alice", projectId: project.id, filename: "demo.mp4", kind: "video", mime: "video/mp4", videoCodec: "h264", bytes: 10, durationSec: 12, width: 1080, height: 1920, status: "ready", storageKey: "test-video.mp4", variants: {} });
  app.media.prepare = async item => ({ ...item, variant: "original" });
  const item = (extra = {}) => ({ caption: "Finish this in TikTok", title: "", mediaIds: [video.id], accountIds: ["tiktok"], format: "auto", schedule: { mode: "now", timeZone: "UTC" }, overrides: { tiktok: { settings: { deliveryMode: "inbox", uploadConsent: true } } }, ...extra });
  const submit = input => app.posts.submit("alice", project.id, { requestId: randomBytes(16).toString("hex"), items: [input || item()] });
  const finish = async () => { await app.worker.tick(); now += 31000; await app.worker.tick(); };
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, project, calls, account, item, submit, finish, advance: ms => { now += ms; }, now: () => now };
}

test("TikTok inbox handoff is durable, terminal, and never counted as a published post", async t => {
  const h = setup(t), { posts: [post] } = await h.submit();
  await h.app.worker.tick();
  assert.equal(h.app.posts.get("alice", h.project.id, post.id).status, "publishing");
  h.advance(31000); await h.app.worker.tick();
  const result = h.app.posts.get("alice", h.project.id, post.id), delivery = result.deliveries[0];
  assert.equal(result.status, "awaiting_publish");
  assert.equal(result.editable, false); assert.equal(result.deletable, false);
  assert.equal(delivery.status, "awaiting_publish"); assert.equal(delivery.deliveryMode, "inbox");
  assert.equal(delivery.deliveredAt, h.now()); assert.equal(delivery.publishedAt, undefined); assert.equal(delivery.url, null);
  assert.equal((await h.app.analytics.refresh("alice", h.project.id)).publishedCount, 0);
  assert.ok(!h.calls.some(call => call.url.includes("video/query")));
  assert.equal(h.app.posts.cancel("alice", h.project.id, post.id).status, "awaiting_publish");
  assert.throws(() => h.app.posts.retry("alice", h.project.id, delivery.id), /cannot be retried/);
  assert.throws(() => h.app.posts.remove("alice", h.project.id, post.id), /stay in your history/);
  await h.app.worker.deliver(delivery.id); h.advance(86400000); await h.app.worker.tick();
  assert.equal(h.calls.filter(call => call.url.includes("/init/")).length, 1);
});

test("scheduled TikTok inbox delivery waits until the selected transfer time", async t => {
  const h = setup(t), { posts: [post] } = await h.submit(h.item({ schedule: { mode: "scheduled", timeZone: "UTC", localDateTime: "2026-09-22T13:00" } }));
  await h.app.worker.tick();
  assert.ok(!h.calls.some(call => call.url.includes("/init/")));
  h.advance(3600000); await h.finish();
  assert.equal(h.app.posts.get("alice", h.project.id, post.id).status, "awaiting_publish");
});

test("accepted TikTok uploads can finish polling after cached permissions change", async t => {
  const h = setup(t), { posts: [post] } = await h.submit();
  await h.app.worker.tick();
  const account = h.app.store.get("account", "tiktok");
  h.app.store.put("account", { ...account, options: { ...account.options, tiktokPermissions: { canPublish: true, canUpload: false } } });
  h.advance(31000); await h.app.worker.tick();
  assert.equal(h.app.posts.get("alice", h.project.id, post.id).status, "awaiting_publish");
  assert.equal(h.calls.filter(call => call.url.includes("/init/")).length, 1);
});

test("mixed Direct Post and TikTok inbox destinations keep separate outcomes and analytics", async t => {
  const h = setup(t); h.account("direct");
  const { posts: [post] } = await h.submit(h.item({ accountIds: ["tiktok", "direct"], overrides: {
    ...h.item().overrides, direct: { settings: { privacy: "SELF_ONLY", consent: true } },
  } }));
  await h.finish();
  const result = h.app.posts.get("alice", h.project.id, post.id);
  assert.equal(result.status, "awaiting_publish");
  assert.equal(result.deliveries.find(item => item.accountId === "direct").status, "published");
  assert.equal(result.deliveries.find(item => item.accountId === "tiktok").status, "awaiting_publish");
  const report = await h.app.analytics.refresh("alice", h.project.id);
  assert.equal(report.publishedCount, 1); assert.equal(report.totals.values.views, 10);
  assert.equal(h.calls.filter(call => call.url.includes("video/query")).length, 1);
});

test("existing TikTok grants require reconnection only for the new inbox option", async t => {
  const h = setup(t); h.account("tiktok", "user.info.basic,video.publish,video.list");
  const preview = await h.app.posts.preview("alice", h.project.id, { items: [h.item()] });
  assert.equal(preview.valid, false); assert.match(preview.rows[0].destinations[0].errors.join(" "), /reconnect/i);
  await assert.rejects(h.submit(), error => error.code === "invalid_content");
  const direct = await h.app.posts.preview("alice", h.project.id, { items: [h.item({ overrides: { tiktok: { settings: { privacy: "SELF_ONLY", consent: true } } } })] });
  assert.equal(direct.valid, true);
  assert.ok(!h.calls.some(call => call.url.includes("/init/")));
});

test("editing a queued destination preserves an already delivered TikTok inbox transfer", async t => {
  const h = setup(t); h.account("later");
  const initial = h.item({ accountIds: ["tiktok", "later"], schedule: { mode: "scheduled", timeZone: "UTC", localDateTime: "2026-09-22T13:00" }, overrides: {
    tiktok: { ...h.item().overrides.tiktok, localDateTime: "2026-09-22T12:01" }, later: { settings: { privacy: "SELF_ONLY", consent: true } },
  } });
  const { posts: [post] } = await h.submit(initial);
  h.advance(60000); await h.finish();
  const before = h.app.posts.get("alice", h.project.id, post.id);
  assert.equal(before.status, "scheduled"); assert.equal(before.editable, true);
  const updated = await h.app.posts.update("alice", h.project.id, post.id, { ...initial, caption: "Updated later post", revision: before.revision });
  assert.equal(updated.deliveries.find(item => item.accountId === "tiktok").status, "awaiting_publish");
  assert.equal(updated.overrides.tiktok.caption, initial.caption);
  await h.app.worker.tick();
  assert.equal(h.calls.filter(call => call.url.includes("/inbox/video/init/")).length, 1);
});

test("disconnecting TikTok does not describe an already delivered inbox upload as cancelled", async t => {
  const h = setup(t), { posts: [post] } = await h.submit(); await h.finish();
  h.app.privacy.markDeleting(h.app.store.get("account", "tiktok"));
  assert.equal(h.app.posts.get("alice", h.project.id, post.id).status, "awaiting_publish");
});
