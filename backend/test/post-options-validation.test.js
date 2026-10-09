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
import { withZernio } from "../src/bridge/platforms/ZernioProvider.js";
import { BridgeError, ProviderError } from "../src/bridge/core/errors.js";

const optionsFailure = "TikTok creator settings could not be loaded from the publishing provider.";
const privacyOptions = ["PUBLIC_TO_EVERYONE", "SELF_ONLY"];

function setup(t, { failZernio = true, cachedOptions = null } = {}) {
  const now = Date.parse("2026-10-04T12:00:00Z"), calls = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-options-validation-"));
  const env = { BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test", BRIDGE_PUBLIC_URL: "https://meadow.example", BRIDGE_APP_URL: "https://meadow.example", TIKTOK_CLIENT_KEY: "test", TIKTOK_CLIENT_SECRET: "test", TIKTOK_DIRECT_POST_PRIVATE_ONLY: "true", ZERNIO_API_KEY: "test-zernio" };
  const provider = new (withZernio(TikTokProvider))({ env, clock: () => now, transport: { request: async url => {
    calls.push(url);
    if (url === "https://zernio.com/api/v1/accounts/zernio-account/tiktok/creator-info?mediaType=video") {
      if (failZernio) throw new ProviderError(optionsFailure, { code: "provider_app_credentials" });
      return Response.json({ creator: { nickname: "Creator" }, privacyLevels: privacyOptions.map(value => ({ value })), postingLimits: { maxVideoDurationSec: 600 } });
    }
    if (url === "https://open.tiktokapis.com/v2/post/publish/creator_info/query/") return { data: { creator_nickname: "Creator", creator_username: "creator", privacy_level_options: privacyOptions, max_video_post_duration_sec: 600 } };
    assert.fail(`Preview must not publish or switch provider routes: ${url}`);
  } } });
  const app = new BridgeApplication({ store: new SqliteStore(), registry: new ProviderRegistry([provider]), env, clock: () => now });
  const project = app.projects.create("alice", { name: "TikTok preview", timeZone: "UTC" });
  for (const [id, credentials] of [["zernio", { zernioAccountId: "zernio-account" }], ["native", { accessToken: "native-token", scope: "video.publish,video.upload" }]]) {
    app.store.put("account", { id, ownerUid: "alice", projectId: project.id, platform: "tiktok", remoteId: id === "zernio" ? "zernio:zernio-account" : "native-account", label: id, rateKey: `tiktok:${id}`, status: "connected", authorizationId: `grant-${id}`, encryptedCredentials: app.vault.encrypt(credentials, `account:${id}`), options: id === "zernio" ? cachedOptions : null, optionsUpdatedAt: now - 120000 });
  }
  app.store.put("media", { id: "video", ownerUid: "alice", projectId: project.id, filename: "clip.mp4", kind: "video", status: "ready", bytes: 100, durationSec: 12 });
  const item = (accountIds = ["zernio"], deliveryMode = "direct") => ({ caption: "A video", title: "", mediaIds: ["video"], accountIds, format: "auto", schedule: { mode: "now", timeZone: "UTC" }, overrides: Object.fromEntries(accountIds.map(id => [id, { settings: { deliveryMode, privacy: "PUBLIC_TO_EVERYONE", consent: true, uploadConsent: true } }])) });
  const preview = input => app.posts.preview("alice", project.id, { items: [input] });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, project, item, preview, calls };
}

test("failed creator options show the provider error without inventing TikTok restrictions or changing delivery settings", async t => {
  const staleOptions = { tiktokDirectPostPrivateOnly: true, creator: { privacyOptions: ["SELF_ONLY"], maxVideoSeconds: 1 } };
  for (const cachedOptions of [null, staleOptions]) for (const mode of ["direct", "inbox"]) {
    const h = setup(t, { cachedOptions }), input = h.item(["zernio"], mode), original = structuredClone(input);
    const account = h.app.store.get("account", "zernio"), result = await h.preview(input);
    assert.equal(result.valid, false);
    assert.deepEqual(result.rows[0].destinations[0].errors, [optionsFailure]);
    assert.equal(result.rows[0].destinations[0].deliveryMode, mode);
    assert.deepEqual(input, original);
    assert.deepEqual(h.app.store.get("account", "zernio"), account);
    assert.equal(h.calls.length, 1);
  }
});

test("options failure blocks submission without creating a post or delivery", async t => {
  const h = setup(t), input = h.item(), original = structuredClone(input);
  await assert.rejects(h.app.posts.submit("alice", h.project.id, { requestId: "failed-options-submission-123", items: [input] }), error => {
    assert.equal(error.code, "invalid_content");
    assert.deepEqual(error.details[0].destinations[0].errors, [optionsFailure]);
    return true;
  });
  for (const kind of ["post", "delivery", "submission"]) assert.deepEqual(h.app.store.list(kind), []);
  assert.deepEqual(input, original);
  assert.equal(h.app.store.get("account", "zernio").status, "connected");
  assert.equal(h.calls.length, 1);
});

test("a failed destination does not suppress another account's native TikTok validation", async t => {
  const h = setup(t), result = await h.preview(h.item(["zernio", "native"]));
  const [zernio, native] = result.rows[0].destinations;
  assert.equal(result.valid, false);
  assert.deepEqual(zernio.errors, [optionsFailure]);
  assert.equal(native.errors.length, 1);
  assert.match(native.errors[0], /Direct Post audit.*Only me/);
  assert.equal(h.calls.length, 2);
});

test("successful options preserve public Zernio publishing and native TikTok's private audience requirement", async t => {
  const h = setup(t, { failZernio: false }), input = h.item(["zernio", "native"]);
  const first = await h.preview(input), [zernio, native] = first.rows[0].destinations;
  assert.deepEqual(zernio.errors, []);
  assert.equal(native.errors.length, 1);
  assert.match(native.errors[0], /Direct Post audit.*Only me/);
  input.overrides.native.settings.privacy = "SELF_ONLY";
  const accepted = await h.preview(input);
  assert.equal(accepted.valid, true);
  assert.deepEqual(accepted.rows[0].destinations.map(destination => destination.errors), [[], []]);
  assert.equal(input.overrides.zernio.settings.privacy, "PUBLIC_TO_EVERYONE");
  assert.equal(h.app.store.get("account", "zernio").options.tiktokDirectPostPrivateOnly, false);
  assert.equal(h.app.store.get("account", "native").options.tiktokDirectPostPrivateOnly, true);
  assert.equal(h.calls.length, 2);
});

test("an internal queue stop guard prevents writes after asynchronous creator settings and preserves duplicate recovery", async t => {
  const h = setup(t, { failZernio: false });
  const options = h.app.accounts.options.bind(h.app.accounts);
  let stopped = false;
  h.app.accounts.options = async (...args) => {
    const result = await options(...args);
    stopped = true;
    return result;
  };
  const body = { requestId: "dropper-commit-guard-submission-123", items: [h.item()] };
  const beforeCommit = () => { if (stopped) throw new BridgeError("Dropper was stopped.", { code: "dropper_stopped" }); };
  await assert.rejects(h.app.posts.submit("alice", h.project.id, body, { beforeCommit }), error => error.code === "dropper_stopped");
  for (const kind of ["post", "delivery", "submission"]) assert.deepEqual(h.app.store.list(kind), []);
  h.app.accounts.options = options;
  stopped = false;
  const submitted = await h.app.posts.submit("alice", h.project.id, body, { beforeCommit });
  stopped = true;
  const recovered = await h.app.posts.submit("alice", h.project.id, body, { beforeCommit });
  assert.equal(recovered.duplicate, true);
  assert.equal(recovered.posts[0].id, submitted.posts[0].id);
  for (const kind of ["post", "delivery", "submission"]) assert.equal(h.app.store.list(kind).length, 1);
});
