import test from "node:test";
import assert from "node:assert/strict";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";

const video = { id: "video", kind: "video", status: "ready", filename: "demo.mp4", bytes: 100, durationSec: 30 };
const photo = { id: "photo", kind: "image", status: "ready", filename: "demo.jpg", bytes: 100 };
const creator = { privacy_level_options: ["SELF_ONLY"], max_video_post_duration_sec: 60 };

function setup(handler = () => ({ data: { publish_id: "inbox-id" } })) {
  const calls = [], checkpoints = [];
  const provider = new TikTokProvider({
    env: { TIKTOK_CLIENT_KEY: "client", TIKTOK_CLIENT_SECRET: "secret" }, publicUrl: "https://meadow.example",
    transport: { request: async (url, options) => { calls.push({ url, options }); return handler(url, options); } },
  });
  const ctx = {
    credentials: { accessToken: "token", scope: "user.info.basic,video.upload" }, account: { options: {} }, progress: {},
    content: { caption: "An idea", title: "My photos", format: "auto", media: [video], settings: { deliveryMode: "inbox", uploadConsent: true } },
    media: { prepare: async (item, variant) => ({ ...item, variant }), url: (item, options) => `https://media.example/${item.id}.${options.variant}` },
    checkpoint: async patch => { checkpoints.push(patch); ctx.progress = { ...ctx.progress, ...patch }; },
  };
  return { provider, ctx, calls, checkpoints };
}

test("TikTok authorization requests upload permission and upload-only options skip creator_info", async () => {
  const { provider, calls, ctx } = setup();
  const url = new URL(await provider.authorizationUrl({ state: "state" }));
  assert.ok(url.searchParams.get("scope").split(",").includes("video.upload"));
  const options = await provider.options({}, ctx.credentials);
  assert.deepEqual(options.tiktokPermissions, { canUpload: true, canPublish: false });
  assert.equal(options.creator, undefined); assert.equal(calls.length, 0);
});

test("TikTok granted scope flags preserve legacy direct publishing without assuming upload access", async () => {
  const { provider, calls } = setup(() => ({ data: creator }));
  for (const [scope, expected] of [
    [undefined, { canUpload: false, canPublish: true }],
    ["user.info.basic,video.publish,video.list", { canUpload: false, canPublish: true }],
    [["video.publish", "video.upload"], { canUpload: true, canPublish: true }],
    ["video.publish video.upload", { canUpload: true, canPublish: true }],
    ["", { canUpload: false, canPublish: false }],
  ]) assert.deepEqual((await provider.options({}, { scope })).tiktokPermissions, expected);
  assert.equal(calls.length, 4);
});

test("TikTok inbox requires upload consent, a supported selection, permission, and a ten-minute maximum", () => {
  const { provider, ctx } = setup();
  assert.deepEqual(provider.validate(ctx.content), []);
  const validate = changes => provider.validate({ ...ctx.content, ...changes }).join(" ");
  assert.match(validate({ settings: { deliveryMode: "inbox" } }), /Confirm.*TikTok inbox/);
  assert.match(validate({ accountOptions: { tiktokPermissions: { canUpload: false, canPublish: true } } }), /Reconnect TikTok/);
  assert.match(validate({ media: [{ ...video, durationSec: 601 }] }), /10 minutes/);
  assert.match(validate({ media: [{ ...video, durationSec: undefined }] }), /known duration/);
  assert.match(validate({ media: [] }), /does not support this text format/);
  assert.match(validate({ media: [video, { ...video, id: "second" }] }), /images only/);
  assert.match(validate({ media: [photo], title: "a".repeat(91) }), /90 characters/);
  assert.match(validate({ settings: { deliveryMode: "other" } }), /Choose whether/);
  assert.deepEqual(provider.validate({ ...ctx.content, media: [{ ...video, durationSec: 600 }], accountOptions: { creator: { privacyOptions: [], maxVideoSeconds: 60 } } }), []);
});

test("TikTok inbox publish enforces real credentials and consent before sending media", async () => {
  const { provider, ctx, calls } = setup();
  for (const scope of [undefined, "user.info.basic,video.publish", ""]) {
    ctx.credentials.scope = scope;
    await assert.rejects(provider.publish(ctx), error => error.reconnect && /Reconnect TikTok/.test(error.message));
  }
  ctx.credentials.scope = "video.upload"; ctx.content.settings.uploadConsent = false;
  await assert.rejects(provider.publish(ctx), error => error.code === "invalid_content");
  assert.equal(calls.length, 0);
});

test("TikTok video upload only sends media, persists mode and ID, and resumes without a second upload", async () => {
  const { provider, ctx, calls, checkpoints } = setup();
  provider.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY = "true";
  ctx.content.settings = { ...ctx.content.settings, privacy: "PUBLIC_TO_EVERYONE", brandedContent: true, consent: false };
  const result = await provider.publish(ctx);
  assert.equal(result.status, "processing");
  assert.equal(calls[0].url, "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/");
  assert.deepEqual(calls[0].options.json, { source_info: { source: "PULL_FROM_URL", video_url: "https://media.example/video.mp4" } });
  assert.deepEqual(checkpoints, [{ publishId: "inbox-id", deliveryMode: "inbox" }]);
  ctx.credentials.scope = "video.publish";
  await provider.publish(ctx);
  assert.equal(calls.length, 1);
});

test("TikTok photo uploads use MEDIA_UPLOAD and include title/caption without Direct Post controls", async () => {
  const { provider, ctx, calls } = setup();
  provider.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY = "true";
  ctx.content.media = [photo, { ...photo, id: "photo-2" }];
  await provider.publish(ctx);
  assert.equal(calls[0].url, "https://open.tiktokapis.com/v2/post/publish/content/init/");
  assert.deepEqual(calls[0].options.json, {
    media_type: "PHOTO", post_mode: "MEDIA_UPLOAD", post_info: { title: "My photos", description: "An idea" },
    source_info: { source: "PULL_FROM_URL", photo_images: ["https://media.example/photo.jpeg", "https://media.example/photo-2.jpeg"], photo_cover_index: 0 },
  });
});

test("TikTok handoff is terminal awaiting_publish even if the user already posted in TikTok", async () => {
  for (const status of ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"]) {
    const { provider, ctx, calls } = setup(() => ({ data: { status, publicaly_available_post_id: ["123"] } }));
    ctx.progress = { publishId: "inbox-id", deliveryMode: "inbox" };
    ctx.content.settings.deliveryMode = "direct";
    const result = await provider.poll(ctx);
    assert.equal(result.status, "awaiting_publish"); assert.equal(result.externalId, "inbox-id"); assert.equal(result.url, null);
    assert.equal(result.progress.deliveryMode, "inbox"); assert.equal(result.progress.tiktokStatus, status);
    assert.equal(calls[0].options.safeToRetry, true);
    assert.deepEqual(calls[0].options.json, { publish_id: "inbox-id" });
  }
});

test("TikTok keeps polling pending uploads and surfaces terminal media failures", async () => {
  let status = "PROCESSING_DOWNLOAD";
  const { provider, ctx } = setup(() => ({ data: { status, fail_reason: "file_format_check_failed" } }));
  ctx.progress = { publishId: "inbox-id", deliveryMode: "inbox" };
  assert.equal((await provider.poll(ctx)).status, "processing");
  status = "FAILED";
  await assert.rejects(provider.poll(ctx), error => error.code === "provider_rejected" && !error.retryable && !error.restartPublishing);
});

test("TikTok inbox pending-share limit is actionable and a rejected init can safely retry", async () => {
  const { provider, ctx } = setup();
  provider.http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ error: { code: "spam_risk_too_many_pending_share" } }), { status: 403 }) });
  await assert.rejects(provider.publish(ctx), error => error.code === "rate_limited" && error.retryable && /five pending uploads/.test(error.message));
  assert.deepEqual(ctx.progress, {});
});

test("TikTok does not retry an inbox upload whose result is uncertain", async () => {
  const { provider, ctx } = setup(() => ({}));
  await assert.rejects(provider.publish(ctx), error => error.uncertain && !error.retryable);
  provider.http = new HttpTransport({ fetcher: async () => { throw new Error("timeout"); } });
  await assert.rejects(provider.publish(ctx), error => error.uncertain && !error.retryable);
});

test("TikTok inbox checkpoints must be durable before publish returns", async () => {
  const { provider, ctx } = setup();
  let entered;
  const checkpointEntered = new Promise(resolve => { entered = resolve; });
  let release;
  ctx.checkpoint = async () => { entered(); await new Promise(resolve => { release = resolve; }); };
  let completed = false;
  const pending = provider.publish(ctx).then(result => { completed = true; return result; });
  await checkpointEntered;
  assert.equal(completed, false);
  release(); await pending; assert.equal(completed, true);
});

test("TikTok Direct Post still enforces its own controls and retains published state", async () => {
  const { provider, ctx, calls } = setup(url => url.includes("/init/") ? { data: { publish_id: "direct-id" } } : { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: ["123"] } });
  ctx.credentials.scope = "video.publish";
  ctx.content.accountOptions = { creator: { privacyOptions: ["SELF_ONLY"], maxVideoSeconds: 60 } };
  ctx.content.settings = { privacy: "SELF_ONLY", consent: true };
  assert.deepEqual(provider.validate(ctx.content), []);
  assert.ok(provider.validate({ ...ctx.content, settings: { deliveryMode: "direct", uploadConsent: true } }).length);
  await provider.publish(ctx);
  assert.equal(calls[0].url, "https://open.tiktokapis.com/v2/post/publish/video/init/");
  assert.equal(calls[0].options.json.post_info.privacy_level, "SELF_ONLY");
  const result = await provider.poll(ctx);
  assert.equal(result.status, "published"); assert.equal(result.externalId, "123");
});

test("TikTok private-only policy offers only creator-supported Only me and can be lifted after approval", async () => {
  let privacy = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"];
  const { provider } = setup(() => ({ data: { ...creator, privacy_level_options: privacy } }));
  provider.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY = "true";
  const options = await provider.options({}, { scope: "video.publish" });
  assert.equal(options.tiktokDirectPostPrivateOnly, true);
  assert.deepEqual(options.creator.privacyOptions, ["SELF_ONLY"]);
  privacy = ["PUBLIC_TO_EVERYONE"];
  assert.deepEqual((await provider.options({}, { scope: "video.publish" })).creator.privacyOptions, []);
  provider.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY = "false";
  const unrestricted = await provider.options({}, { scope: "video.publish" });
  assert.equal(unrestricted.tiktokDirectPostPrivateOnly, false);
  assert.deepEqual(unrestricted.creator.privacyOptions, privacy);
});

test("TikTok private-only validation rejects stale public choices and still requires an explicit audience", () => {
  const { provider, ctx } = setup();
  provider.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY = "true";
  ctx.content.accountOptions = { creator: { privacyOptions: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], maxVideoSeconds: 60 } };
  for (const privacy of [undefined, "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS"]) {
    ctx.content.settings = { privacy, consent: true };
    assert.match(provider.validate(ctx.content).join(" "), /limited to Only me/);
  }
  ctx.content.settings = { privacy: "SELF_ONLY", consent: true };
  assert.deepEqual(provider.validate(ctx.content), []);
  ctx.content.settings.brandedContent = true;
  assert.match(provider.validate(ctx.content).join(" "), /Branded content cannot/);
});

test("TikTok blocks non-private direct requests before preparing media for both videos and photos", async () => {
  for (const item of [video, photo]) {
    const { provider, ctx, calls } = setup();
    provider.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY = "true";
    ctx.credentials.scope = "video.publish";
    ctx.content.media = [item];
    let prepared = 0;
    ctx.media.prepare = async (media, variant) => { prepared++; return { ...media, variant }; };
    for (const privacy of [undefined, "PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS"]) {
      ctx.content.settings = { privacy, consent: true };
      await assert.rejects(provider.publish(ctx), error => error.code === "tiktok_private_only");
      assert.equal(ctx.content.settings.privacy, privacy);
    }
    assert.equal(prepared, 0); assert.equal(calls.length, 0);
    ctx.content.settings = { privacy: "SELF_ONLY", consent: true };
    await provider.publish(ctx);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.json.post_info.privacy_level, "SELF_ONLY");
    assert.ok(calls[0].url.endsWith(item.kind === "image" ? "content/init/" : "video/init/"));
  }
});

test("TikTok allows the selected public audience after the private-only restriction is disabled", async () => {
  const { provider, ctx, calls } = setup();
  provider.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY = "false";
  ctx.credentials.scope = "video.publish";
  ctx.content.settings = { privacy: "PUBLIC_TO_EVERYONE", consent: true };
  await provider.publish(ctx);
  assert.equal(calls[0].options.json.post_info.privacy_level, "PUBLIC_TO_EVERYONE");
});
