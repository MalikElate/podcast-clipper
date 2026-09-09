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
  assert.ok(provider.validate(ctx.content).some(error => /privacy/.test(error)));
  ctx.content.accountOptions = { creator: { privacyOptions: ["SELF_ONLY"], maxVideoSeconds: 30 } };
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

test("X finalizes an upload before creating a post and carries media IDs", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-x-test-")); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); fs.writeFileSync(path.join(dir, "asset"), Buffer.alloc(500));
  const http = transport(url => url.endsWith("initialize") ? { data: { id: "media1" } } : url.endsWith("finalize") ? { data: {} } : url.endsWith("tweets") ? { data: { id: "post1" } } : {});
  const provider = new XProvider({ transport: http }), ctx = context([image]); ctx.media.storage.path = () => path.join(dir, "asset");
  const result = await provider.publish(ctx); assert.equal(result.status, "published"); const tweet = http.calls.find(call => call.url.endsWith("tweets")); assert.deepEqual(tweet.options.json.media.media_ids, ["media1"]); assert.equal(http.calls[1].options.body.get("segment_index"), "0");
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

test("Google Business returns a tracked processing post then confirms it is live", async () => {
  const http = transport((url, options) => options.method === "POST" ? { name: "accounts/a/locations/b/localPosts/p", state: "PROCESSING" } : { name: "accounts/a/locations/b/localPosts/p", state: "LIVE", searchUrl: "https://google.com/post" });
  const provider = new GoogleBusinessProvider({ transport: http }), ctx = context([image]); ctx.account.remoteId = "accounts/a/locations/b";
  const result = await provider.publish(ctx); assert.equal(result.status, "processing"); const published = await provider.poll(ctx); assert.equal(published.status, "published");
});

test("Bluesky OAuth metadata and encrypted session storage use the official client", async t => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256", privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const store = new SqliteStore(); t.after(() => store.close());
  const provider = new BlueskyProvider({ env: { BLUESKY_PRIVATE_KEY: privateKey, BRIDGE_APP_URL: "https://bridge.example" }, publicUrl: "https://bridge.example", store, vault: new SecretVault(randomBytes(32).toString("base64")), locks: new LockService(store) });
  const client = await provider.client(); assert.equal(client.clientMetadata.token_endpoint_auth_method, "private_key_jwt"); assert.equal(client.jwks.keys.length, 1); assert.ok(!client.jwks.keys[0].d);
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
