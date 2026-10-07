import test from "node:test";
import assert from "node:assert/strict";
import { withZernio, zernioPlatforms } from "../src/bridge/platforms/ZernioProvider.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { PinterestProvider } from "../src/bridge/platforms/PinterestProvider.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";

// Production no longer routes TikTok through Zernio, but the Zernio adapter
// still supports it, so these tests opt TikTok in explicitly.
const env = { ZERNIO_API_KEY: "sk_test", ZERNIO_PLATFORMS: "tiktok,snapchat,facebook,instagram,threads,pinterest", TIKTOK_DIRECT_POST_PRIVATE_ONLY: "true" };
const video = { id: "video1", filename: "clip.mp4", kind: "video", mime: "video/mp4", status: "ready", bytes: 500, durationSec: 30 };

function memoryStore() {
  const data = new Map();
  return { get: (kind, id) => data.get(`${kind}:${id}`) || null, put: (kind, record) => (data.set(`${kind}:${record.id}`, record), record), list: (kind, filters = {}) => [...data.entries()].filter(([key, value]) => key.startsWith(`${kind}:`) && (!filters.ownerUid || value.ownerUid === filters.ownerUid)).map(([, value]) => value) };
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
const provider = (Base, transport) => new (withZernio(Base))({ env, transport, store: memoryStore(), publicUrl: "https://findmeadow.com", clock: () => Date.parse("2026-09-25T12:00:00Z"), zernioConnections: zernioPlatforms(env).has(new Base({ env }).id) });

const analyticsCredentials = { zernioAccountId: "acct1", zernioProfileId: "profile1" };
const singleQuery = "analytics?postId=post1&accountId=acct1&platform=tiktok&profileId=profile1";
const accountQuery = "analytics?accountId=acct1&platform=tiktok&profileId=profile1&source=all&fromDate=2026-06-28&toDate=2026-09-25&limit=100&page=";
const analyticsPost = (id = "native1", extra = {}) => ({ _id: `external-${id}`, latePostId: "post1", content: "Account post", publishedAt: "2026-09-24T12:00:00Z", platforms: [{ platform: "tiktok", accountId: "acct1", status: "published", platformPostId: id, syncStatus: "synced", analytics: { views: 42, likes: 0, comments: null }, platformPostUrl: `https://www.tiktok.com/@creator/video/${id}` }], ...extra });

test("Zernio post analytics use the delivery's Zernio id and only its account's platform metrics", async () => {
  const { calls, transport } = zernioApi({ [`GET ${singleQuery}`]: () => [200, { analytics: { views: 999999 }, platformAnalytics: [
    { platform: "tiktok", accountId: "foreign", analytics: { views: 8888 } },
    { platform: "instagram", accountId: "acct1", analytics: { views: 7777 } },
    { platform: "tiktok", accountId: "acct1", syncStatus: "synced", analytics: { views: "42", likes: 0, comments: null, saves: -1, shares: false, clicks: "" } },
  ] }] });
  const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: { externalId: "native1", progress: { zernioPostId: "post1" } } });
  assert.equal(result.values.views, 42); assert.equal(result.values.likes, 0);
  for (const key of ["comments", "saves", "shares", "clicks", "impressions"]) assert.equal(result.values[key], null);
  assert.equal(calls.length, 1); assert.equal(result.pending, false);
});

const resolvedTikTok = { platform: "tiktok", accountId: "acct1", status: "published", platformPostId: "7692456089249500423", platformPostUrl: "https://www.tiktok.com/@creator/video/7692456089249500423?utm_source=api", syncStatus: "synced", analytics: { views: 141, likes: 3 } };
const unresolvedTikTokDelivery = () => ({ status: "published", externalId: "v_pub_url~v2.7692455748873766918", url: null, progress: { zernioPostId: "post1" } });

test("TikTok analytics resolve an existing upload reference from only the matching account and platform", async () => {
  const { calls, transport } = zernioApi({ [`GET ${singleQuery}`]: () => [200, { platformAnalytics: [
    { ...resolvedTikTok, accountId: "foreign", platformPostId: "111", platformPostUrl: "https://www.tiktok.com/@other/video/111" },
    { ...resolvedTikTok, platform: "instagram", platformPostId: "222", platformPostUrl: "https://www.instagram.com/p/222" },
    { ...resolvedTikTok, accountId: { _id: "acct1" } },
  ] }] });
  const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: unresolvedTikTokDelivery() });
  assert.deepEqual(result.publication, { externalId: resolvedTikTok.platformPostId, url: resolvedTikTok.platformPostUrl });
  assert.equal(result.values.views, 141); assert.equal(result.values.likes, 3);
  assert.equal(calls.length, 1);
});

test("TikTok publication metadata excludes foreign targets, drafts, temporary IDs and unsafe or inconsistent URLs", async () => {
  for (const entry of [
    { ...resolvedTikTok, accountId: "foreign" },
    { ...resolvedTikTok, platform: "instagram" },
    { ...resolvedTikTok, status: "pending" },
    { ...resolvedTikTok, platformSpecificData: { isDraft: true } },
    { ...resolvedTikTok, platformPostId: "v_pub_url~v2.7692455748873766918", platformPostUrl: null },
    { ...resolvedTikTok, platformPostId: null, platformPostUrl: "javascript:alert(1)" },
    { ...resolvedTikTok, platformPostId: null, platformPostUrl: "http://www.tiktok.com/@creator/video/7692456089249500423" },
    { ...resolvedTikTok, platformPostId: null, platformPostUrl: "https://www.tiktok.com.evil.example/@creator/video/7692456089249500423" },
    { ...resolvedTikTok, platformPostId: null, platformPostUrl: "https://www.tiktok.com/@creator" },
    { ...resolvedTikTok, platformPostUrl: "https://www.tiktok.com/@creator/video/111" },
  ]) {
    const { transport } = zernioApi({ [`GET ${singleQuery}`]: () => [200, { platformPostUrl: resolvedTikTok.platformPostUrl, platformAnalytics: [entry] }] });
    const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: { externalId: "temporary", progress: { zernioPostId: "post1" } } });
    assert.equal(result.publication, undefined);
  }
});

test("TikTok resolves delayed links from its saved Zernio post when analytics have no public metadata", async () => {
  for (const [status, analytics] of [[200, { platformAnalytics: [{ platform: "tiktok", accountId: "acct1", status: "published", analytics: { views: 141 } }] }], [404, { error: "Not synced yet" }], [402, { error: "Analytics unavailable" }]]) {
    const { calls, transport } = zernioApi({
      [`GET ${singleQuery}`]: () => [status, analytics],
      "GET posts/post1": () => [200, { post: { platforms: [{ ...resolvedTikTok, accountId: "foreign" }, { ...resolvedTikTok, accountId: { _id: "acct1" } }] } }],
    });
    const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: unresolvedTikTokDelivery() });
    assert.deepEqual(result.publication, { externalId: resolvedTikTok.platformPostId, url: resolvedTikTok.platformPostUrl });
    if (status === 200) assert.equal(result.values.views, 141);
    else { assert.equal(result.pending, true); assert.ok(result.unavailableReason); }
    assert.equal(calls.length, 2);
  }
});

test("TikTok link reconciliation preserves metrics when the post lookup fails or lacks the account", async () => {
  for (const [status, body] of [[404, { error: "Missing post" }], [200, { post: { platforms: [{ ...resolvedTikTok, accountId: "foreign" }] } }], [200, { post: { platforms: [{ ...resolvedTikTok, platform: "instagram" }] } }]]) {
    const { transport } = zernioApi({
      [`GET ${singleQuery}`]: () => [200, { platformAnalytics: [{ platform: "tiktok", accountId: "acct1", status: "published", analytics: { views: 141 } }] }],
      "GET posts/post1": () => [status, body],
    });
    const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: unresolvedTikTokDelivery() });
    assert.equal(result.values.views, 141); assert.equal(result.publication, undefined);
  }
});

test("TikTok combines partial publication metadata only when the native ID and public URL agree", async () => {
  for (const id of [resolvedTikTok.platformPostId, "111"]) {
    const url = `https://www.tiktok.com/@creator/video/${id}`;
    const { transport } = zernioApi({
      [`GET ${singleQuery}`]: () => [200, { platformAnalytics: [{ ...resolvedTikTok, platformPostUrl: null }] }],
      "GET posts/post1": () => [200, { post: { platforms: [{ ...resolvedTikTok, platformPostId: "v_pub_url~v2.temporary", platformPostUrl: url }] } }],
    });
    const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: unresolvedTikTokDelivery() });
    assert.deepEqual(result.publication, { externalId: resolvedTikTok.platformPostId, ...(id === resolvedTikTok.platformPostId ? { url } : {}) });
  }
});

test("TikTok partial metadata cannot conflict with a preserved delivery ID or URL", async () => {
  const saved = { ...unresolvedTikTokDelivery(), externalId: "111", url: "https://www.tiktok.com/@creator/video/111" };
  for (const entry of [
    { ...resolvedTikTok, platformPostUrl: null },
    { ...resolvedTikTok, platformPostId: null },
    resolvedTikTok,
  ]) {
    const { calls, transport } = zernioApi({ [`GET ${singleQuery}`]: () => [200, { platformAnalytics: [entry] }] });
    const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: saved });
    assert.deepEqual(result.publication, entry === resolvedTikTok ? { externalId: resolvedTikTok.platformPostId, url: resolvedTikTok.platformPostUrl } : undefined);
    assert.equal(calls.length, 1);
  }
});

test("TikTok inbox delivery never acquires public publication metadata from analytics", async () => {
  const { calls, transport } = zernioApi({ [`GET ${singleQuery}`]: () => [200, { platformAnalytics: [resolvedTikTok] }] });
  const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: { ...unresolvedTikTokDelivery(), contentSnapshot: { settings: { deliveryMode: "inbox" } } } });
  assert.equal(result.publication, undefined); assert.equal(calls.length, 1);
});

test("TikTok link reconciliation preserves account reconnection errors", async () => {
  const { calls, transport } = zernioApi({
    [`GET ${singleQuery}`]: () => [403, { error: "Account disconnected", code: "ACCOUNT_DISCONNECTED" }],
    "GET posts/post1": () => [200, { post: { platforms: [resolvedTikTok] } }],
  });
  await assert.rejects(provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: unresolvedTikTokDelivery() }), error => error.reconnect && error.code === "reconnect_required");
  assert.equal(calls.length, 1);
});

test("Zernio metrics keep sync-pending, missing posts and failed publications unavailable", async () => {
  for (const [status, body] of [[202, { syncStatus: "pending", platformAnalytics: [] }], [404, { error: "not found" }], [424, { status: "failed", platformAnalytics: [] }], [200, { analytics: { views: 999 }, platformAnalytics: [{ platform: "tiktok", accountId: "foreign", analytics: { views: 999 } }] }]]) {
    const { transport } = zernioApi({ [`GET ${singleQuery}`]: () => [status, body] });
    const result = await provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: { progress: { zernioPostId: "post1" } } });
    assert.equal(result.pending, true); assert.ok(result.unavailableReason || result.note);
    assert.ok(!Object.values(result.values).some(Number.isFinite));
  }
});

test("Zernio analytics access errors never disconnect an account or expose upstream request data", async () => {
  for (const status of [401, 402, 403]) {
    const { transport } = zernioApi({ [`GET ${singleQuery}`]: () => [status, { error: "private-api-key", code: status === 402 ? "analytics_addon_required" : "denied" }] });
    await assert.rejects(provider(TikTokProvider, transport).metrics({ credentials: analyticsCredentials, delivery: { progress: { zernioPostId: "post1" } } }), error => !error.reconnect && !error.message.includes("private-api-key") && (status !== 402 || /Analytics access is not enabled/.test(error.message)));
  }
});

test("Zernio account analytics page through owned published posts and exclude unrelated roll-ups", async () => {
  const { calls, transport } = zernioApi({
    [`GET ${accountQuery}1`]: () => [200, { hasAnalyticsAccess: true, posts: [analyticsPost(), analyticsPost("foreign", { platforms: [{ platform: "tiktok", accountId: "foreign", status: "published", analytics: { views: 9999 } }] })], pagination: { pages: 2 } }],
    [`GET ${accountQuery}2`]: () => [200, { posts: [analyticsPost(), analyticsPost("native2"), analyticsPost("draft", { platforms: [{ platform: "tiktok", accountId: "acct1", status: "scheduled" }] })], pagination: { pages: 2 } }],
  });
  const result = await provider(TikTokProvider, transport).accountPostAnalytics({ credentials: analyticsCredentials });
  assert.deepEqual(result.posts.map(post => post.id), ["native1", "native2"]);
  assert.equal(result.posts[0].values.views, 42); assert.equal(result.posts[0].values.likes, 0);
  assert.equal(result.partial, false); assert.equal(calls.length, 2);
});

test("Zernio account analytics keep each post's HTTPS media", async () => {
  const media = { mediaType: "video", thumbnailUrl: "https://cdn.example.com/cover.jpg", mediaItems: [{ type: "video", url: "https://cdn.example.com/clip.mp4", thumbnail: "https://cdn.example.com/cover.jpg" }, { type: "image", url: "http://insecure.example.com/a.jpg" }, { type: "image", url: "javascript:alert(1)" }] };
  const { transport } = zernioApi({ [`GET ${accountQuery}1`]: () => [200, { posts: [analyticsPost("native1", media), analyticsPost("text")], pagination: { pages: 1 } }] });
  const result = await provider(TikTokProvider, transport).accountPostAnalytics({ credentials: analyticsCredentials });
  assert.deepEqual(result.posts[0].media, { type: "video", thumbnailUrl: "https://cdn.example.com/cover.jpg", items: [{ type: "video", url: "https://cdn.example.com/clip.mp4", thumbnail: "https://cdn.example.com/cover.jpg" }] });
  assert.equal(result.posts[1].media, null);
});

test("Zernio account analytics bound pagination and explain partial totals", async () => {
  const routes = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`GET ${accountQuery}${i + 1}`, () => [200, { posts: [analyticsPost(`native${i}`)], pagination: { pages: 9 } }]]));
  const { calls, transport } = zernioApi(routes);
  const result = await provider(TikTokProvider, transport).accountPostAnalytics({ credentials: analyticsCredentials });
  assert.equal(result.partial, true); assert.equal(calls.length, 5); assert.match(result.note, /Totals cover the posts loaded/);
});

test("Zernio account analytics reject missing entitlements and incomplete pagination", async () => {
  for (const body of [{ hasAnalyticsAccess: false, posts: [], pagination: { pages: 0 } }, { posts: [] }]) {
    const { transport } = zernioApi({ [`GET ${accountQuery}1`]: () => [200, body] });
    await assert.rejects(provider(TikTokProvider, transport).accountPostAnalytics({ credentials: analyticsCredentials }), /access is not enabled|incomplete analytics pagination/);
  }
});

test("All Zernio platforms support post analytics while native grants retain their adapter", async () => {
  for (const id of ["tiktok", "instagram", "facebook", "threads", "snapchat", "pinterest"]) {
    class Native extends PlatformProvider { constructor(options) { super(id, options); } async metrics() { return { values: { likes: 7 } }; } }
    const query = `analytics?postId=post1&accountId=acct1&platform=${id}&profileId=profile1`;
    const { calls, transport } = zernioApi({ [`GET ${query}`]: () => [200, { platformAnalytics: [{ platform: id, accountId: "acct1", analytics: { likes: 2 } }] }] });
    const adapter = provider(Native, transport);
    assert.equal((await adapter.metrics({ credentials: analyticsCredentials, delivery: { externalId: "post1" } })).values.likes, 2);
    assert.equal((await adapter.metrics({ credentials: { accessToken: "native" } })).values.likes, 7);
    assert.equal(await adapter.accountPostAnalytics({ credentials: { accessToken: "native" } }), null);
    assert.equal(calls.length, 1);
  }
});

test("Zernio routing is enabled only with an API key and for supported platforms", () => {
  assert.deepEqual([...zernioPlatforms({})], []);
  assert.deepEqual([...zernioPlatforms({ ZERNIO_API_KEY: "sk" })], ["snapchat", "facebook", "instagram", "threads", "pinterest"]);
  assert.deepEqual([...zernioPlatforms({ ZERNIO_API_KEY: "sk", ZERNIO_PLATFORMS: "tiktok, youtube,pinterest" })], ["tiktok", "pinterest"]);
});

test("Zernio creator-info distinguishes app credentials from a social account's authorization", async () => {
  const path = "accounts/acct1/tiktok/creator-info?mediaType=video";
  for (const { status = 401, body, code, reconnect, upstreamCode } of [
    { body: { type: "authentication_error", code: "invalid_credentials" }, code: "provider_app_credentials", reconnect: false },
    { body: { type: "authentication_error", code: "missing_credentials" }, code: "provider_app_credentials", reconnect: false },
    { body: { code: "TOKEN_EXPIRED" }, code: "reconnect_required", reconnect: true },
    { body: { code: "ACCOUNT_DISCONNECTED" }, code: "reconnect_required", reconnect: true },
    { status: 403, body: { code: "TOKEN_EXPIRED" }, code: "reconnect_required", reconnect: true },
    { body: { type: "platform_error", code: "platform_api_error", platform: "tiktok", platformError: { error: { code: "access_token_invalid", message: "private-token" } } }, code: "reconnect_required", reconnect: true, upstreamCode: "access_token_invalid" },
    { body: { type: "platform_error", platform: "tiktok", platformError: { code: "access_token_expired", message: "private-token" } }, code: "reconnect_required", reconnect: true, upstreamCode: "access_token_expired" },
    { body: { code: "platform_api_error", platform: "tiktok", platformError: { error: { code: "scope_not_authorized" } } }, code: "reconnect_required", reconnect: true, upstreamCode: "scope_not_authorized" },
  ]) {
    const { calls, transport } = zernioApi({ [`GET ${path}`]: () => [status, { ...body, error: "private-api-key private-token" }] });
    await assert.rejects(provider(TikTokProvider, transport).options({}, analyticsCredentials), error => {
      assert.equal(error.code, code); assert.equal(error.reconnect, reconnect);
      assert.equal(error.authFailure, undefined);
      assert.equal(error.details.provider, "zernio"); assert.equal(error.details.httpStatus, status);
      assert.equal(error.details.upstreamCode, upstreamCode);
      assert.match(error.message, reconnect ? /Reconnect this TikTok account/ : /Meadow's API key/);
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /private-api-key|private-token/);
      return true;
    });
    assert.equal(calls.length, 1);
  }
});

test("unknown Zernio 401 envelopes do not blame the API key or invalidate a social account", async () => {
  const path = "accounts/acct1/tiktok/creator-info?mediaType=video";
  for (const body of [
    { error: "private-api-key", code: "private-token" },
    { type: "platform_error", code: "platform_api_error", platform: "instagram", platformError: { error: { code: "private-token" } } },
    { error: "Unauthorized" }, null, "private-token",
  ]) {
    const { transport } = zernioApi({ [`GET ${path}`]: () => [401, body] });
    await assert.rejects(provider(TikTokProvider, transport).options({}, analyticsCredentials), error => {
      assert.equal(error.code, "provider_authorization"); assert.equal(error.reconnect, false);
      assert.equal(error.authFailure, undefined);
      assert.match(error.message, /TikTok.*HTTP 401/);
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), /private-api-key|private-token|ZERNIO_API_KEY|Reconnect/);
      return true;
    });
  }
});

test("TikTok connections use native OAuth when explicitly excluded from Zernio routing", async () => {
  const liveEnv = { ZERNIO_API_KEY: "sk_test", ZERNIO_PLATFORMS: "snapchat,facebook,instagram,threads,pinterest", TIKTOK_CLIENT_KEY: "meadow-client", TIKTOK_CLIENT_SECRET: "meadow-secret" };
  const calls = [];
  const transport = new HttpTransport({ fetcher: async (url, options) => {
    calls.push(url);
    assert.equal(new URL(url).origin, "https://open.tiktokapis.com");
    if (url.endsWith("/oauth/token/")) {
      const form = new URLSearchParams(options.body);
      assert.equal(form.get("client_key"), "meadow-client");
      assert.equal(form.get("code"), "authorized-code");
      assert.equal(form.get("redirect_uri"), "https://findmeadow.com/oauth/tiktok/callback");
      return Response.json({ access_token: "native-token", refresh_token: "native-refresh", open_id: "native-id", scope: "user.info.basic,video.publish,video.upload,video.list", expires_in: 86400 });
    }
    assert.equal(options.headers.Authorization, "Bearer native-token");
    assert.equal(new URL(url).pathname, "/v2/user/info/");
    return Response.json({ data: { user: { open_id: "native-id", union_id: "native-union", display_name: "Creator" } } });
  } });
  const tiktok = new (withZernio(TikTokProvider))({ env: liveEnv, transport, publicUrl: "https://findmeadow.com", zernioConnections: zernioPlatforms(liveEnv).has("tiktok") });
  const authorize = new URL(await tiktok.authorizationUrl({ state: "state1" }));
  assert.equal(authorize.origin, "https://www.tiktok.com");
  assert.equal(authorize.pathname, "/v2/auth/authorize/");
  assert.equal(authorize.searchParams.get("client_key"), "meadow-client");
  assert.equal(authorize.searchParams.get("state"), "state1");
  assert.equal(authorize.searchParams.get("scope"), "user.info.basic,video.publish,video.upload,video.list");
  const result = await tiktok.finishAuthorization(new URLSearchParams("state=state1&code=authorized-code"), {});
  assert.equal(result.credentials.accessToken, "native-token");
  assert.equal(result.credentials.zernioAccountId, undefined);
  assert.equal(result.candidates[0].remoteId, "native-id");
  assert.equal(calls.length, 2);
  const missingCredentials = new (withZernio(TikTokProvider))({ env: { ZERNIO_API_KEY: "sk_test" }, zernioConnections: false });
  assert.equal(missingCredentials.configured, false);
  await assert.rejects(missingCredentials.authorizationUrl({ state: "state2" }), error => error.code === "platform_unconfigured");
});

test("Zernio connections reuse an owner's profile and verify the returned account", async () => {
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
  const before = calls.length;
  assert.equal(await tiktok.zernioProfile("user1", "project2"), "profile1");
  assert.equal(calls.length, before, "another workspace must not create another provider identity for this user");
  assert.equal(tiktok.store.get("zernioProfile", "project2").ownerUid, "user1");
});

test("Zernio never shares an owner's provider profile with a different Meadow user", async () => {
  const { calls, transport } = zernioApi({
    "GET profiles": () => [200, { profiles: [] }],
    "POST profiles": () => [201, { profile: { _id: "bob-profile" } }],
  });
  const tiktok = provider(TikTokProvider, transport);
  tiktok.store.put("zernioProfile", { id: "alice-project", ownerUid: "alice", profileId: "alice-profile" });
  assert.equal(await tiktok.zernioProfile("bob", "bob-project"), "bob-profile");
  assert.equal(calls.length, 2);
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
    "GET accounts/acct1/pinterest-boards": () => [401, { error: "Unauthorized", type: "authentication_error", code: "invalid_credentials" }],
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
