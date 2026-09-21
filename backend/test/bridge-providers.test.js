import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";
import { InstagramProvider, ThreadsProvider, FacebookProvider } from "../src/bridge/platforms/MetaProviders.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { XProvider } from "../src/bridge/platforms/XProvider.js";
import { LinkedInProvider } from "../src/bridge/platforms/LinkedInProvider.js";
import { PinterestProvider } from "../src/bridge/platforms/PinterestProvider.js";
import { YouTubeProvider, GoogleBusinessProvider } from "../src/bridge/platforms/GoogleProviders.js";
import { BlueskyProvider } from "../src/bridge/platforms/BlueskyProvider.js";
import { TelegramProvider } from "../src/bridge/platforms/TelegramProvider.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { LockService } from "../src/bridge/core/LockService.js";

const image = { id: "image1", filename: "image.jpg", kind: "image", mime: "image/jpeg", status: "ready", bytes: 500, width: 1080, height: 1080 };
const video = { id: "video1", filename: "clip.mp4", kind: "video", mime: "video/mp4", status: "ready", bytes: 500, width: 1080, height: 1920, durationSec: 15 };
function context(media = [], settings = {}) {
  const ctx = { account: { id: "a", remoteId: "123", label: "Account", options: {} }, credentials: { accessToken: "test-access-token" }, delivery: { id: "d", createdAt: Date.now() }, content: { title: "A title", caption: "A caption", format: "auto", media, settings, accountOptions: {} }, progress: {}, media: { prepare: async (item, variant) => ({ ...item, key: item.id, variant }), url: item => `https://media.example/${item.id}`, storage: { blob: async () => new Blob(["video bytes"], { type: "video/mp4" }), stream: () => new Blob(["bytes"]).stream() } } };
  ctx.checkpoint = patch => { ctx.progress = { ...ctx.progress, ...patch }; };
  return ctx;
}
function transport(handler) { const calls = []; return { calls, request: async (url, options = {}) => { calls.push({ url, options }); return handler(url, options, calls.length); } }; }

test("every direct OAuth adapter sends account connections to its native authorization page", async () => {
  const cases = [
    [TikTokProvider, "TIKTOK", "https://www.tiktok.com/v2/auth/authorize/"],
    [YouTubeProvider, "YOUTUBE", "https://accounts.google.com/o/oauth2/v2/auth"],
    [GoogleBusinessProvider, "GOOGLE_BUSINESS", "https://accounts.google.com/o/oauth2/v2/auth"],
    [PinterestProvider, "PINTEREST", "https://www.pinterest.com/oauth/"],
    [InstagramProvider, "INSTAGRAM", "https://www.instagram.com/oauth/authorize"],
    [ThreadsProvider, "THREADS", "https://threads.com/oauth/authorize"],
    [FacebookProvider, "FACEBOOK", "https://www.facebook.com/v26.0/dialog/oauth"],
    [LinkedInProvider, "LINKEDIN", "https://www.linkedin.com/oauth/v2/authorization"],
    [XProvider, "X", "https://x.com/i/oauth2/authorize"],
  ];
  for (const [Provider, prefix, endpoint] of cases) {
    const provider = new Provider({ publicUrl: "https://bridge.example", env: { [`${prefix}_CLIENT_ID`]: "fixture-app", [`${prefix}_CLIENT_KEY`]: "fixture-app", [`${prefix}_CLIENT_SECRET`]: "private-fixture-secret", META_GRAPH_VERSION: "v26.0" } });
    const url = new URL(await provider.authorizationUrl({ state: "fresh-csrf-state", verifier: "private-pkce-verifier" }));
    assert.equal(url.origin + url.pathname, endpoint);
    assert.equal(url.searchParams.get("state"), "fresh-csrf-state");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("redirect_uri"), `https://bridge.example/oauth/${provider.id}/callback`);
    assert.ok(url.searchParams.get("scope"));
    assert.ok(!url.href.includes("private-"), "Client secrets and PKCE verifiers must stay on the server");
    assert.notEqual(url.searchParams.get("prompt"), "none");
    if (provider.oauth.pkce) assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    if (provider.id === "instagram") {
      assert.equal(url.searchParams.get("force_reauth"), "true");
      assert.equal(url.searchParams.get("enable_fb_login"), "false");
      assert.equal(url.searchParams.has("force_authentication"), false);
    }
  }
});

test("Google Business can reuse the existing YouTube OAuth client", async () => {
  const provider = new GoogleBusinessProvider({
    publicUrl: "https://bridge.example",
    env: { YOUTUBE_CLIENT_ID: "existing-google-client", YOUTUBE_CLIENT_SECRET: "existing-google-secret" },
  });
  assert.equal(provider.oauth.clientId, "existing-google-client");
  assert.equal(provider.oauth.clientSecret, "existing-google-secret");
  const url = new URL(await provider.authorizationUrl({ state: "state", verifier: "verifier" }));
  assert.equal(url.searchParams.get("client_id"), "existing-google-client");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/business.manage");
  assert.equal(url.searchParams.get("redirect_uri"), "https://bridge.example/oauth/google_business/callback");
});

test("Telegram connects through a private bot link, verifies webhooks, and publishes supported posts", async () => {
  const http = transport((url, options) => {
    if (url.endsWith("/setWebhook")) return { ok: true, result: true };
    if (url.endsWith("/sendMediaGroup")) return { ok: true, result: [{ message_id: 13, chat: { username: "meadow_updates" } }] };
    return { ok: true, result: { message_id: url.endsWith("/sendMessage") ? 11 : 12, chat: { username: "meadow_updates" } } };
  });
  const provider = new TelegramProvider({
    publicUrl: "https://bridge.example",
    env: {
      BRIDGE_APP_URL: "https://app.example",
      TELEGRAM_BOT_TOKEN: "123456:fixture_bot_token_abcdefghijklmnopqrstuvwxyz",
      TELEGRAM_BOT_USERNAME: "FindMeadowAppBot",
      TELEGRAM_WEBHOOK_SECRET: "fixture-webhook-secret-1234",
    },
    transport: http,
  });

  assert.equal(provider.configured, true);
  const authorization = new URL(provider.authorizationUrl({ state: "fresh-telegram-state-123456" }));
  assert.equal(authorization.href, "https://t.me/FindMeadowAppBot?start=fresh-telegram-state-123456");
  assert.equal(provider.verifyWebhook("fixture-webhook-secret-1234"), true);
  assert.equal(provider.verifyWebhook("wrong-secret"), false);

  await provider.configureWebhook();
  assert.deepEqual(http.calls[0].options.json, {
    url: "https://bridge.example/api/telegram/webhook",
    secret_token: "fixture-webhook-secret-1234",
    allowed_updates: ["message", "my_chat_member"],
  });

  const text = context(); text.credentials.chatId = "123";
  assert.equal((await provider.publish(text)).externalId, "11");
  assert.deepEqual(http.calls[1].options.json, { chat_id: "123", text: "A caption" });

  const single = context([image]); single.credentials.chatId = "123";
  assert.equal((await provider.publish(single)).externalId, "12");
  assert.ok(http.calls[2].options.body instanceof FormData);
  assert.equal(http.calls[2].options.body.get("chat_id"), "123");
  assert.equal(http.calls[2].options.body.get("caption"), "A caption");

  const document = context([{ id: "doc", filename: "brief.pdf", kind: "document", mime: "application/pdf", status: "ready", bytes: 20 }]); document.credentials.chatId = "123";
  assert.equal((await provider.publish(document)).externalId, "12");
  assert.equal(http.calls[3].options.body.get("document").name, "brief.pdf");

  const album = context([image, { ...video, id: "video2" }]); album.credentials.chatId = "123";
  assert.equal((await provider.publish(album)).externalId, "13");
  const media = JSON.parse(http.calls[4].options.body.get("media"));
  assert.deepEqual(media.map(item => item.type), ["photo", "video"]);
  assert.equal(media[0].caption, "A caption");

  assert.ok(provider.validate({ ...album.content, caption: "x".repeat(1025) }).some(error => /1,024/.test(error)));
  assert.ok(provider.validate({ ...album.content, media: [image, { id: "doc", filename: "brief.pdf", kind: "document", status: "ready", bytes: 20 }] }).some(error => /one document/.test(error)));
});

test("transport respects reset headers and holds unsafe or interrupted requests for review", async () => {
  const now = 100000;
  let http = new HttpTransport({ clock: () => now, fetcher: async () => new Response("", { status: 429, headers: { "Retry-After": "60" } }) });
  await assert.rejects(http.request("https://api.example/posts", { method: "POST" }), error => error.code === "rate_limited" && error.retryAt === now + 60000);
  http = new HttpTransport({ fetcher: async () => { throw new Error("network"); } });
  await assert.rejects(http.request("https://api.example/posts", { method: "POST" }), error => error.uncertain && !error.retryable);
  await assert.rejects(http.request("https://api.example/posts"), error => error.retryable && !error.uncertain);
  http = new HttpTransport({ fetcher: async () => ({ status: 200, ok: true, headers: new Headers(), text: async () => { throw new Error("truncated body"); } }) });
  await assert.rejects(http.request("https://api.example/posts", { method: "POST" }), error => error.uncertain);
  http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ error: { code: 613, message: "Limit" } }), { status: 400 }) });
  await assert.rejects(http.request("https://graph.facebook.com/posts", { method: "POST" }), error => error.code === "rate_limited");
});

test("TikTok requires creator-specific privacy and consent, then maps private publication correctly", async () => {
  const http = transport((url, options) => url.includes("/init/") ? { data: { publish_id: "p_private" } } : { data: { status: "PUBLISH_COMPLETE" } });
  const provider = new TikTokProvider({ transport: http }), ctx = context([video]);
  assert.ok(provider.validate(ctx.content).some(error => /audience options could not be loaded/.test(error)));
  ctx.content.accountOptions = { creator: { privacyOptions: ["SELF_ONLY"], maxVideoSeconds: 30 } };
  assert.ok(provider.validate(ctx.content).includes("Choose who can see this TikTok post."));
  ctx.content.settings = { privacy: "PUBLIC_TO_EVERYONE", consent: true };
  assert.ok(provider.validate(ctx.content).some(error => /audience is no longer available/.test(error)));
  ctx.content.settings = { privacy: "SELF_ONLY", consent: true };
  assert.deepEqual(provider.validate(ctx.content), []);
  const result = await provider.publish(ctx); assert.equal(result.status, "processing");
  assert.equal(http.calls[0].options.json.post_info.disable_comment, true); assert.equal(http.calls[0].options.json.post_info.disable_duet, true);
  const published = await provider.poll(ctx); assert.equal(published.status, "published"); assert.equal(published.externalId, "p_private"); assert.equal(published.progress.privatePost, true);
});

test("Instagram and Threads wait for carousel children and only publish the finished parent", async () => {
  for (const Provider of [InstagramProvider, ThreadsProvider]) {
    let ready = false, childCount = 0;
    const http = transport((url, options) => {
      if (url.includes("fields=status")) return url.includes("child") ? { status_code: ready ? "FINISHED" : "IN_PROGRESS", status: ready ? "FINISHED" : "IN_PROGRESS" } : { status_code: "FINISHED", status: "FINISHED" };
      if (url.includes("fields=permalink")) return { permalink: "https://example.com/published" };
      if (url.endsWith("_publish")) return { id: "published-parent" };
      if (options.form?.is_carousel_item === "true") return { id: `child${++childCount}` };
      return { id: "parent" };
    });
    const provider = new Provider({ transport: http }), ctx = context([image, { ...image, id: "image2" }]);
    let result = await provider.publish(ctx); ctx.progress = { ...ctx.progress, ...result.progress }; assert.equal(result.status, "processing"); assert.equal(ctx.progress.children.length, 2); assert.ok(!ctx.progress.containerId);
    ready = true; result = await provider.poll(ctx); assert.equal(result.status, "processing"); assert.equal(ctx.progress.containerId, "parent");
    result = await provider.poll(ctx); assert.equal(result.status, "published"); assert.equal(result.externalId, "published-parent");
    result = await provider.poll(ctx); assert.equal(result.status, "published"); assert.equal(http.calls.filter(call => call.url.endsWith("_publish")).length, 1);
  }
});

test("Facebook Reel upload is not marked published until finish is acknowledged and processing completes", async () => {
  const http = transport((url, options) => {
    if (options.form?.upload_phase === "start") return { video_id: "v1", upload_url: "https://rupload.facebook.com/video" };
    if (options.form?.upload_phase === "finish") return { success: true };
    if (url.includes("fields=status")) return { status: { video_status: "ready", publishing_phase: { status: "complete" } } };
    return {};
  });
  const provider = new FacebookProvider({ transport: http }), ctx = context([video]); ctx.content.format = "reel";
  let result = await provider.publish(ctx); assert.equal(result.status, "processing"); assert.equal(ctx.progress.phase, "short_uploaded");
  result = await provider.poll(ctx); assert.equal(result.status, "processing"); assert.equal(ctx.progress.finishAccepted, true);
  result = await provider.poll(ctx); assert.equal(result.status, "published"); assert.equal(http.calls.filter(call => call.options.form?.upload_phase === "finish").length, 1);
});

test("LinkedIn document upload waits for availability and sends the Posts API contract", async () => {
  const http = transport((url, options) => {
    if (url.includes("initializeUpload")) return { value: { document: "urn:li:document:1", uploadUrl: "https://www.linkedin.com/upload" } };
    if (url.endsWith("/upload")) return new Response(null, { status: 201 });
    if (url.endsWith("/posts")) return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:5" } });
    return { status: "AVAILABLE" };
  });
  const provider = new LinkedInProvider({ transport: http }), ctx = context([{ id: "doc", filename: "paper.pdf", kind: "document", mime: "application/pdf", bytes: 10, status: "ready" }]);
  const result = await provider.publish(ctx); assert.equal(result.status, "published"); assert.equal(result.externalId, "urn:li:share:5");
  const request = http.calls.find(call => call.url.endsWith("/posts")); assert.equal(request.options.json.content.media.id, "urn:li:document:1"); assert.equal(request.options.json.lifecycleState, "PUBLISHED"); assert.equal(request.options.headers["X-Restli-Protocol-Version"], "2.0.0");
});

test("Pinterest creates a carousel with explicit board and media source", async () => {
  const http = transport(() => ({ id: "pin1" })), provider = new PinterestProvider({ transport: http }), ctx = context([image, { ...image, id: "image2" }], { boardId: "board1" });
  ctx.content.accountOptions = { boards: [{ id: "board1", name: "Board" }] }; assert.deepEqual(provider.validate(ctx.content), []);
  const result = await provider.publish(ctx); assert.equal(result.status, "published"); assert.equal(http.calls[0].options.json.board_id, "board1"); assert.equal(http.calls[0].options.json.media_source.source_type, "multiple_image_urls"); assert.equal(http.calls[0].options.json.media_source.items.length, 2);
});

test("Pinterest Sandbox routes token and API requests to the Sandbox host", async () => {
  const http = transport(() => ({ items: [], bookmark: null }));
  const provider = new PinterestProvider({ env: { PINTEREST_CLIENT_ID: "app", PINTEREST_CLIENT_SECRET: "secret", PINTEREST_ENVIRONMENT: "sandbox" }, transport: http, publicUrl: "https://bridge.example" });
  assert.equal(provider.oauth.token, "https://api-sandbox.pinterest.com/v5/oauth/token");
  await provider.options({}, { accessToken: "token" });
  assert.equal(http.calls[0].url, "https://api-sandbox.pinterest.com/v5/boards?page_size=250");
  assert.deepEqual(await provider.metrics({ credentials: {}, delivery: {} }), { values: {}, unavailableReason: "Pinterest Sandbox does not provide organic Pin analytics." });
});

test("Pinterest distinguishes invalid tokens, missing scopes, and app access restrictions without exposing response data", async () => {
  const cases = [
    { status: 401, data: { code: 2, message: "Authentication failed. private-token" }, reconnect: true, code: "reconnect_required", text: /Pinterest code 2/ },
    { status: 403, data: { code: 29, message: "Your token does not have sufficient permissions to perform this operation. private-token" }, reconnect: false, code: "provider_permissions", text: /permissions needed/ },
    { status: 403, data: { code: 3, message: "Apps with Trial access may not create Pins in production. private-token" }, reconnect: false, code: "pinterest_app_access_required", text: /Standard access/ },
    { status: 401, data: { code: 3, message: "This app requires Standard access. private-token" }, reconnect: false, code: "pinterest_app_access_required", text: /Standard access/ },
    { status: 404, data: { code: 100, message: "Board private-token not found." }, reconnect: false, code: "provider_rejected", text: /Pinterest code 100/ },
  ];
  for (const item of cases) {
    const http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify(item.data), { status: item.status }) });
    await assert.rejects(http.request("https://api.pinterest.com/v5/pins", { method: "POST", token: "private-token" }), error => {
      assert.equal(error.code, item.code); assert.equal(error.reconnect, item.reconnect);
      assert.equal(error.retryable, false); assert.equal(error.uncertain, false);
      assert.match(error.message, item.text);
      assert.deepEqual(error.details, { provider: "pinterest", httpStatus: item.status, providerCode: item.data.code });
      assert.ok(!JSON.stringify({ message: error.message, ...error }).includes("private-token"));
      return true;
    });
  }
  const http = new HttpTransport({ fetcher: async () => new Response("Unauthorized", { status: 401 }) });
  await assert.rejects(http.request("https://api-sandbox.pinterest.com/v5/boards"), error => error.reconnect && /HTTP 401/.test(error.message));
  await assert.rejects(http.request("https://api.example/posts"), error => error.reconnect && error.message === "Reconnect this social account to renew its permissions.");
});

test("Pinterest token exchange identifies app credentials separately from an invalid authorization grant", async () => {
  for (const [providerError, code, reconnect] of [["invalid_client", "pinterest_app_credentials", false], ["invalid_grant", "reconnect_required", true]]) {
    const http = new HttpTransport({ fetcher: async () => new Response(JSON.stringify({ error: providerError }), { status: 401 }) });
    await assert.rejects(http.request("https://api.pinterest.com/v5/oauth/token", { method: "POST" }), error => error.code === code && error.reconnect === reconnect);
  }
});

test("Pinterest refuses incomplete OAuth permissions and binds new tokens to their issuing environment", async () => {
  const http = transport(() => ({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "user_accounts:read,boards:read,pins:read,pins:write" }));
  const provider = new PinterestProvider({ env: { PINTEREST_CLIENT_ID: "app", PINTEREST_CLIENT_SECRET: "secret", PINTEREST_ENVIRONMENT: "sandbox" }, transport: http, publicUrl: "https://bridge.example" });
  const authorization = new URL(await provider.authorizationUrl({ state: "state" }));
  assert.equal(authorization.searchParams.get("scope"), "user_accounts:read,boards:read,pins:read,pins:write");
  const credentials = await provider.exchange({ code: "code" });
  assert.equal(credentials.pinterestEnvironment, "sandbox");
  assert.equal(http.calls[0].url, "https://api-sandbox.pinterest.com/v5/oauth/token");
  const refreshed = await provider.refresh(credentials);
  assert.equal(refreshed.pinterestEnvironment, "sandbox");
  assert.equal(http.calls[1].url, "https://api-sandbox.pinterest.com/v5/oauth/token");
  assert.throws(() => provider.normalizeToken({ access_token: "limited", scope: "user_accounts:read boards:read pins:read" }), /pins:write/);
  assert.throws(() => provider.normalizeToken({ access_token: "limited" }), /permissions needed to publish/);
  assert.equal(provider.normalizeToken({ access_token: "full", scope: "user_accounts:read boards:read pins:read pins:write" }).pinterestEnvironment, "sandbox");
  const production = new PinterestProvider({ transport: http });
  const callCount = http.calls.length;
  await assert.rejects(production.options({}, credentials), /environment changed/);
  await assert.rejects(production.refresh(credentials), /environment changed/);
  assert.equal(http.calls.length, callCount, "mismatched tokens must not be sent to the other environment");
  await production.request("user_account", { accessToken: "legacy-token" });
  assert.equal(http.calls.at(-1).url, "https://api.pinterest.com/v5/user_account");
});

test("X finalizes an upload before creating a post and carries media IDs", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-x-test-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); fs.writeFileSync(path.join(dir, "asset"), Buffer.alloc(500));
  const http = transport(url => url.endsWith("initialize") ? { data: { id: "media1" } } : url.endsWith("finalize") ? { data: {} } : url.endsWith("tweets") ? { data: { id: "post1" } } : {});
  const provider = new XProvider({ transport: http }), ctx = context([image]); ctx.media.storage.path = () => path.join(dir, "asset");
  const result = await provider.publish(ctx); assert.equal(result.status, "published"); const tweet = http.calls.find(call => call.url.endsWith("tweets")); assert.deepEqual(tweet.options.json.media.media_ids, ["media1"]); assert.equal(http.calls[1].options.body.get("segment_index"), "0");
});

test("Google token refresh separates revoked account access from app configuration and temporary failures", async () => {
  const cases = [
    { status: 400, error: "invalid_grant", code: "reconnect_required", reconnect: true },
    { status: 400, error: "invalid_client", code: "google_app_credentials", reconnect: false },
    { status: 401, error: "invalid_client", code: "google_app_credentials", reconnect: false },
    { status: 400, error: "unauthorized_client", code: "google_app_credentials", reconnect: false },
    { status: 400, error: "admin_policy_enforced", code: "provider_rejected", reconnect: false },
    { status: 503, error: "temporarily_unavailable", code: "provider_unavailable", reconnect: false, retryable: true },
  ];
  for (const Provider of [YouTubeProvider, GoogleBusinessProvider]) {
    for (const item of cases) {
      const http = new HttpTransport({ fetcher: async (url, options) => {
        assert.equal(url, "https://oauth2.googleapis.com/token");
        assert.equal(options.body.get("grant_type"), "refresh_token");
        return new Response(JSON.stringify({ error: item.error, error_description: "Private refresh-token and client-secret" }), { status: item.status });
      } });
      const provider = new Provider({ env: { GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "client-secret" }, transport: http });
      await assert.rejects(provider.refresh({ accessToken: "expired", refreshToken: "refresh-token", expiresAt: 1 }), error => {
        assert.equal(error.code, item.code); assert.equal(error.reconnect, item.reconnect);
        assert.equal(error.retryable, Boolean(item.retryable)); assert.equal(error.uncertain, false);
        if (item.reconnect) assert.match(error.message, /Reconnect the account in Meadow/);
        assert.doesNotMatch(JSON.stringify({ message: error.message, ...error }), /Private|refresh-token|client-secret/);
        return true;
      });
    }
  }
});

test("YouTube upload session survives an uncertain response and polls status before confirming", async () => {
  let uploaded = false;
  const http = transport((url, options) => {
    if (url.includes("uploadType=resumable")) return new Response(null, { headers: { location: "https://www.googleapis.com/upload-session" } });
    if (url.endsWith("upload-session") && options.raw) return new Response(JSON.stringify({ id: "video1" }));
    if (url.endsWith("upload-session")) { const error = new Error("connection interrupted"); error.uncertain = true; throw error; }
    return { items: [{ status: { uploadStatus: "processed", privacyStatus: "private" }, processingDetails: { processingStatus: "succeeded" } }] };
  });
  const provider = new YouTubeProvider({ transport: http }), ctx = context([video], { privacy: "private", madeForKids: false });
  let result = await provider.publish(ctx); assert.equal(result.status, "processing"); assert.equal(ctx.progress.phase, "upload");
  result = await provider.poll(ctx); assert.equal(result.status, "published"); assert.equal(result.externalId, "video1");
});

test("YouTube uploads a selected thumbnail once and checkpoints it before status polling", async () => {
  const http = transport((url, options) => {
    if (url.includes("thumbnails/set")) return { items: [{ videoId: "video1" }] };
    return { items: [{ status: { uploadStatus: "processed", privacyStatus: "public" } }] };
  });
  const provider = new YouTubeProvider({ transport: http });
  const ctx = context([video], { privacy: "public", madeForKids: false, thumbnailMediaId: image.id });
  ctx.content.thumbnail = image;
  ctx.progress = { phase: "video_processing", videoId: "video1" };

  const published = await provider.poll(ctx);
  assert.equal(published.status, "published");
  assert.equal(ctx.progress.thumbnailSet, true);
  assert.equal(http.calls.filter(call => call.url.includes("thumbnails/set")).length, 1);

  await provider.poll(ctx);
  assert.equal(http.calls.filter(call => call.url.includes("thumbnails/set")).length, 1);
});

test("YouTube confirms publication only when the processed video's visibility matches the selection", async () => {
  for (const privacy of ["public", "unlisted", "private"]) {
    for (const actual of ["public", "unlisted", "private", undefined]) {
      const http = transport(() => ({ items: [{ status: { uploadStatus: "processed", privacyStatus: actual } }] }));
      const provider = new YouTubeProvider({ transport: http }), ctx = context([video], { privacy, madeForKids: false });
      ctx.progress = { phase: "video_processing", videoId: "existing-video" };
      if (actual === privacy) {
        const result = await provider.poll(ctx);
        assert.equal(result.status, "published"); assert.equal(result.externalId, "existing-video");
      } else {
        await assert.rejects(provider.poll(ctx), error => error.uncertain && !error.retryable && /visibility does not match/.test(error.message));
      }
      assert.equal(http.calls.length, 1); assert.ok(!http.calls[0].options.method, "checking visibility must not upload again");
    }
  }
});

test("Google Business returns a tracked processing post then confirms it is live", async () => {
  const http = transport((url, options) => options.method === "POST" ? { name: "accounts/a/locations/b/localPosts/p", state: "PROCESSING" } : { name: "accounts/a/locations/b/localPosts/p", state: "LIVE", searchUrl: "https://google.com/post" });
  const provider = new GoogleBusinessProvider({ transport: http }), ctx = context([image]); ctx.account.remoteId = "accounts/a/locations/b";
  const result = await provider.publish(ctx); assert.equal(result.status, "processing"); const published = await provider.poll(ctx); assert.equal(published.status, "published");
});

test("Google Business discovers locations across account and location pages", async () => {
  const http = transport(url => {
    const request = new URL(url), pageToken = request.searchParams.get("pageToken");
    if (request.hostname === "mybusinessaccountmanagement.googleapis.com") {
      if (!pageToken) return { accounts: [{ name: "accounts/empty" }], nextPageToken: "accounts page+/=" };
      assert.equal(pageToken, "accounts page+/=");
      return { accounts: [{ name: "accounts/business" }] };
    }
    if (request.pathname.includes("accounts/empty/")) return { locations: [] };
    assert.equal(request.pathname, "/v1/accounts/business/locations");
    if (!pageToken) return { locations: [{ name: "locations/one", title: "First location" }], nextPageToken: "locations page+/=" };
    assert.equal(pageToken, "locations page+/=");
    return { locations: [{ name: "locations/two", title: "Second location" }] };
  });
  const provider = new GoogleBusinessProvider({ transport: http });
  const accounts = await provider.accounts({ accessToken: "token" });
  assert.deepEqual(accounts.map(account => account.remoteId), ["accounts/business/locations/one", "accounts/business/locations/two"]);
  assert.equal(http.calls.length, 5); assert.ok(http.calls.every(call => call.options.token === "token"));
  assert.equal(accounts[1].metadata.resourceName, "accounts/business/locations/two");
});

test("Google Business stops discovering locations at Meadow's connection limit", async () => {
  const http = transport((url, options, count) => {
    assert.ok(count <= 2, "the connection limit must stop further account and location requests");
    return url.includes("accountmanagement")
      ? { accounts: [{ name: "accounts/business" }, { name: "accounts/later" }], nextPageToken: "later-accounts" }
      : { locations: Array.from({ length: 100 }, (_, i) => ({ name: `locations/${i}`, title: `Location ${i}` })), nextPageToken: "later-locations" };
  });
  assert.equal((await new GoogleBusinessProvider({ transport: http }).accounts({ accessToken: "token" })).length, 100);
});

test("Google Business reports unavailable post metrics without calling the retired endpoint", async () => {
  const http = transport(() => { assert.fail("Google Business post analytics must not make an API request"); });
  const result = await new GoogleBusinessProvider({ transport: http }).metrics({});
  assert.deepEqual(result.values, {}); assert.match(result.unavailableReason, /Google retired/);
});

test("Bluesky OAuth metadata and encrypted session storage use the official client", async t => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const store = new SqliteStore(); t.after(() => store.close());
  const provider = new BlueskyProvider({ env: { BLUESKY_PRIVATE_KEY: privateKey, BRIDGE_APP_URL: "https://bridge.example" }, publicUrl: "https://bridge.example", store, vault: new SecretVault(randomBytes(32).toString("base64")), locks: new LockService(store) });
  const client = await provider.client(); assert.equal(client.clientMetadata.token_endpoint_auth_method, "private_key_jwt"); assert.equal(client.jwks.keys.length, 1); assert.ok(!client.jwks.keys[0].d);
  assert.equal(client.clientMetadata.policy_uri, "https://bridge.example/privacy");
  assert.equal(client.clientMetadata.tos_uri, "https://bridge.example/terms");
  const authorizations = [];
  client.authorize = async (handle, options) => { authorizations.push({ handle, options }); return new URL("https://bsky.social/oauth/authorize?request_uri=fixture"); };
  for (const state of ["initial-state", "reconnect-state"]) await provider.authorizationUrl({ handle: "creator.bsky.social", state });
  assert.deepEqual(authorizations, ["initial-state", "reconnect-state"].map(state => ({ handle: "creator.bsky.social", options: { state, prompt: "consent" } })));
  const storage = provider.encryptedStore("blueskySession"); await storage.set("did:test", { token: "secret" }); assert.deepEqual(await storage.get("did:test"), { token: "secret" }); assert.ok(!JSON.stringify(store.list("blueskySession")).includes('"secret"')); await storage.del("did:test"); assert.equal(await storage.get("did:test"), undefined);
});

test("Bluesky upload rate limits use reset metadata and invalid publication responses require review", async () => {
  const provider = new BlueskyProvider();
  const reset = Math.floor(Date.now() / 1000) + 120;
  const limited = provider.sdkError({ status: 429, headers: { "ratelimit-reset": String(reset) } }, false);
  assert.equal(limited.code, "rate_limited"); assert.equal(limited.retryAt, reset * 1000);
  assert.equal(provider.sdkError({ status: 2 }, true).uncertain, true);
  assert.equal(provider.sdkError({ status: 1 }, false).retryable, true);
});
