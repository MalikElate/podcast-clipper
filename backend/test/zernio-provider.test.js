import test from "node:test";
import assert from "node:assert/strict";
import { withZernio, zernioPlatforms } from "../src/bridge/platforms/ZernioProvider.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { PinterestProvider } from "../src/bridge/platforms/PinterestProvider.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";

const env = { ZERNIO_API_KEY: "sk_test", TIKTOK_DIRECT_POST_PRIVATE_ONLY: "true" };
const video = { id: "video1", filename: "clip.mp4", kind: "video", mime: "video/mp4", status: "ready", bytes: 500, durationSec: 30 };

function memoryStore() {
  const data = new Map();
  return { get: (kind, id) => data.get(`${kind}:${id}`) || null, put: (kind, record) => (data.set(`${kind}:${record.id}`, record), record) };
}
function zernioApi(routes) {
  const calls = [];
  const transport = new HttpTransport({ fetcher: async (url, options) => {
    const { pathname, search } = new URL(url), call = { method: options.method, path: pathname.replace("/api/v1/", "") + search, headers: options.headers, body: options.body ? JSON.parse(options.body) : undefined };
    calls.push(call);
    assert.equal(options.headers.Authorization, "Bearer sk_test");
    const handler = routes[`${call.method} ${call.path}`];
    assert.ok(handler, `Unexpected Zernio call: ${call.method} ${call.path}`);
    const [status, body] = handler(call);
    return Response.json(body, { status });
  } });
  return { calls, transport };
}
const provider = (Base, transport) => new (withZernio(Base))({ env, transport, store: memoryStore(), publicUrl: "https://findmeadow.com", clock: () => Date.parse("2026-09-25T12:00:00Z") });

test("Zernio routing is enabled only with an API key and for supported platforms", () => {
  assert.deepEqual([...zernioPlatforms({})], []);
  assert.deepEqual([...zernioPlatforms({ ZERNIO_API_KEY: "sk" })], ["tiktok", "snapchat", "facebook", "instagram", "threads", "pinterest"]);
  assert.deepEqual([...zernioPlatforms({ ZERNIO_API_KEY: "sk", ZERNIO_PLATFORMS: "tiktok, youtube,pinterest" })], ["tiktok", "pinterest"]);
});

test("Zernio connections use one profile per workspace and verify the returned account", async () => {
  const { calls, transport } = zernioApi({
    "GET profiles": () => [200, { profiles: [] }],
    "POST profiles": () => [201, { profile: { _id: "profile1", name: "meadow-project1" } }],
    "GET connect/tiktok?profileId=profile1&redirect_url=https%3A%2F%2Ffindmeadow.com%2Foauth%2Ftiktok%2Fcallback%3Fstate%3Dabc": () => [200, { authUrl: "https://www.tiktok.com/auth" }],
    "GET accounts?profileId=profile1&platform=tiktok": () => [200, { accounts: [{ _id: "acct1", platform: "tiktok", profileId: { _id: "profile1" }, username: "creator", displayName: "Creator", isActive: true }] }],
  });
  const tiktok = provider(TikTokProvider, transport);
  assert.equal(tiktok.configured, true);
  assert.equal(await tiktok.authorizationUrl({ state: "abc", uid: "user1", projectId: "project1" }), "https://www.tiktok.com/auth");
  await tiktok.authorizationUrl({ state: "abc", uid: "user1", projectId: "project1" });
  assert.equal(calls.filter(call => call.path === "profiles").length, 2, "the saved profile is reused");
  assert.equal(tiktok.authorizationState(new URLSearchParams("state=abc")), "abc");

  const result = await tiktok.finishAuthorization(new URLSearchParams("state=abc&connected=tiktok&accountId=acct1"), { projectId: "project1" });
  assert.deepEqual(result.credentials, { zernioAccountId: "acct1", zernioProfileId: "profile1" });
  assert.equal(result.candidates[0].remoteId, "zernio:acct1");
  assert.equal(result.candidates[0].label, "Creator");

  await assert.rejects(tiktok.finishAuthorization(new URLSearchParams("state=abc&accountId=someone-else"), { projectId: "project1" }), /no longer connected/);
  await assert.rejects(tiktok.finishAuthorization(new URLSearchParams("state=abc&error=oauth_denied&platform=tiktok"), { projectId: "project1" }), /not authorized/);
});

test("Zernio TikTok posts are submitted once and polled until published", async () => {
  const { calls, transport } = zernioApi({
    "GET accounts/acct1/tiktok/creator-info?mediaType=video": () => [200, { creator: { nickname: "creator" }, privacyLevels: [{ value: "PUBLIC_TO_EVERYONE" }, { value: "SELF_ONLY" }], postingLimits: { maxVideoDurationSec: 600, interactionSettings: { allow_stitch: { enabled: false } } } }],
    "POST posts": () => [201, { post: { _id: "post1", status: "scheduled" } }],
    "GET posts/post1": () => [200, { post: { _id: "post1", platforms: [{ platform: "tiktok", accountId: { _id: "acct1" }, status: "published", platformPostId: "7300", platformPostUrl: "https://www.tiktok.com/@creator/video/7300" }] } }],
  });
  const tiktok = provider(TikTokProvider, transport), credentials = { zernioAccountId: "acct1", zernioProfileId: "profile1" };
  const options = await tiktok.options({}, credentials);
  assert.deepEqual(options.creator.privacyOptions, ["PUBLIC_TO_EVERYONE", "SELF_ONLY"]);
  assert.equal(options.creator.stitchDisabled, true);
  const settings = { privacy: "PUBLIC_TO_EVERYONE", consent: true, allowComments: true };
  // Zernio's audited app is not bound by Meadow's native Only-me restriction.
  assert.deepEqual(tiktok.validate({ caption: "Hello", format: "video", media: [video], settings, accountOptions: options }), []);
  assert.match(tiktok.validate({ caption: "Hello", format: "video", media: [video], settings, accountOptions: { ...options, tiktokDirectPostPrivateOnly: undefined } }).join(" "), /Only me/);

  const ctx = { credentials, delivery: { id: "delivery1" }, progress: {}, content: { caption: "Hello", title: "", format: "video", media: [video], settings },
    media: { prepare: async item => ({ ...item, variant: "mp4" }), url: (item, { variant, external }) => (assert.equal(external, true), `https://findmeadow.com/media/${item.id}/${variant}?expires=1&signature=x`) } };
  ctx.checkpoint = async patch => { ctx.progress = { ...ctx.progress, ...patch }; };
  const submitted = await tiktok.publish(ctx);
  assert.equal(submitted.status, "processing");
  assert.equal(ctx.progress.zernioPostId, "post1");
  const post = calls.find(call => call.path === "posts");
  assert.equal(post.headers["Idempotency-Key"], "meadow-delivery1");
  assert.deepEqual(post.body.platforms, [{ platform: "tiktok", accountId: "acct1", platformSpecificData: { privacy_level: "PUBLIC_TO_EVERYONE", allow_comment: true, content_preview_confirmed: true, express_consent_given: true, commercialContentType: "none", allow_duet: false, allow_stitch: false, video_made_with_ai: false } }]);
  assert.deepEqual(post.body.mediaItems, [{ type: "video", url: "https://findmeadow.com/media/video1/mp4?expires=1&signature=x" }]);
  assert.equal(post.body.content, "Hello");

  // A retried delivery resumes polling instead of creating a second post.
  const published = await tiktok.publish(ctx);
  assert.deepEqual(published, { status: "published", externalId: "7300", url: "https://www.tiktok.com/@creator/video/7300" });
  assert.equal(calls.filter(call => call.path === "posts").length, 1);
});

test("Zernio failures become delivery errors without flagging user accounts for Meadow's key", async () => {
  const { transport } = zernioApi({
    "GET posts/post1": () => [200, { post: { platforms: [{ accountId: "acct1", status: "failed", errorMessage: "Video too short" }] } }],
    "POST posts": () => [403, { error: "Account is disconnected", code: "ACCOUNT_DISCONNECTED" }],
    "GET accounts/acct1/pinterest-boards": () => [401, { error: "Unauthorized" }],
  });
  const pinterest = provider(PinterestProvider, transport), credentials = { zernioAccountId: "acct1", zernioProfileId: "profile1" };
  const ctx = { credentials, progress: { zernioPostId: "post1" } };
  await assert.rejects(pinterest.poll(ctx), error => error.code === "provider_rejected" && /Video too short/.test(error.message));
  await assert.rejects(pinterest.publish({ ...ctx, progress: {}, content: { caption: "Pin", title: "", format: "text", media: [], settings: { boardId: "b1" } }, checkpoint: async () => {} }), error => error.reconnect === true);
  await assert.rejects(pinterest.options({}, credentials), error => error.code === "provider_app_credentials" && !error.reconnect);
});

test("Accounts connected natively before the switch keep using the native adapter", async () => {
  class NativeBase extends TikTokProvider {
    async refresh(credentials) { return { ...credentials, refreshed: true }; }
    async publish() { return { status: "published", externalId: "native" }; }
  }
  const { calls, transport } = zernioApi({});
  const tiktok = provider(NativeBase, transport);
  assert.deepEqual(await tiktok.refresh({ accessToken: "t" }), { accessToken: "t", refreshed: true });
  assert.deepEqual(await tiktok.publish({ credentials: { accessToken: "t" } }), { status: "published", externalId: "native" });
  assert.deepEqual(await tiktok.refresh({ zernioAccountId: "acct1" }), { zernioAccountId: "acct1" });
  await assert.rejects(tiktok.availableAccountViews({ credentials: { zernioAccountId: "acct1" } }), /not yet available/);
  assert.equal(calls.length, 0);
});

test("A platform returned to native connections still serves its Zernio accounts", async () => {
  class NativeBase extends TikTokProvider {
    async exchange({ code, verifier }) { return { accessToken: `${code}:${verifier}` }; }
    async accounts(credentials) { return [{ remoteId: "open-id", label: credentials.accessToken }]; }
  }
  const { calls, transport } = zernioApi({ "GET posts/post1": () => [200, { post: { platforms: [{ accountId: "acct1", status: "processing" }] } }] });
  const tiktok = new (withZernio(NativeBase))({ env: { ...env, TIKTOK_CLIENT_KEY: "key", TIKTOK_CLIENT_SECRET: "secret" }, transport, store: memoryStore(), publicUrl: "https://findmeadow.com", zernioConnections: false });
  assert.match(await tiktok.authorizationUrl({ state: "abc", verifier: "v", uid: "user1", projectId: "project1" }), /^https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\//);
  const result = await tiktok.finishAuthorization(new URLSearchParams("state=abc&code=c1"), { projectId: "project1", verifier: "v" });
  assert.deepEqual(result, { state: "abc", credentials: { accessToken: "c1:v" }, candidates: [{ remoteId: "open-id", label: "c1:v" }] });
  await assert.rejects(tiktok.finishAuthorization(new URLSearchParams("state=abc&error=access_denied"), { verifier: "v" }), /not authorized/);
  assert.equal((await tiktok.poll({ credentials: { zernioAccountId: "acct1" }, progress: { zernioPostId: "post1" } })).status, "processing");
  assert.deepEqual(calls.map(call => call.path), ["posts/post1"]);
});
