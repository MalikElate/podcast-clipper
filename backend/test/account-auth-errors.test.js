import test from "node:test";
import assert from "node:assert/strict";
import { OAuthResponseError, TokenInvalidError, TokenRefreshError, TokenRevokedError } from "@atproto/oauth-client-node";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";
import { BlueskyProvider } from "../src/bridge/platforms/BlueskyProvider.js";
import { BridgeError } from "../src/bridge/core/errors.js";

const transport = (status, data, headers = {}) => new HttpTransport({ fetcher: async () => new Response(typeof data === "string" ? data : JSON.stringify(data), { status, headers }) });
const did = "did:plc:abcdefghijklmnopqrstuvwx";
const tokenEndpoints = [
  "https://oauth2.googleapis.com/token",
  "https://api.pinterest.com/v5/oauth/token",
  "https://open.tiktokapis.com/v2/oauth/token/",
  "https://api.x.com/2/oauth2/token",
  "https://www.linkedin.com/oauth/v2/accessToken",
  "https://api.instagram.com/oauth/access_token",
  "https://graph.threads.net/oauth/access_token",
];

test("request-specific permission, scope and expiry failures do not invalidate an account", async () => {
  for (const [status, data] of [
    [400, { error: { message: "The upload session expired." } }],
    [403, { error: { code: 403, message: "Missing scope for this operation." } }],
    [403, { error: { errors: [{ reason: "insufficientPermissions" }], message: "This permission is unavailable." } }],
  ]) {
    await assert.rejects(transport(status, data).request("https://www.googleapis.com/youtube/v3/videos"), error => {
      assert.equal(error.code, "provider_rejected");
      assert.equal(error.reconnect, false);
      assert.equal(error.authFailure, undefined);
      return true;
    });
  }
});

test("user API 401 and explicit invalid access-token responses identify renewable access tokens", async () => {
  for (const [url, status, data] of [
    ["https://api.x.com/2/users/me", 401, "Unauthorized"],
    ["https://graph.facebook.com/v24.0/me", 400, { error: { code: 190, message: "Invalid token" } }],
    ["https://open.tiktokapis.com/v2/user/info/", 200, { error: { code: "access_token_invalid", message: "Expired access token" } }],
    ["https://open.tiktokapis.com/v2/user/info/", 400, { error: { code: "access_token_invalid" } }],
    ["https://api.pinterest.com/v5/boards", 401, { code: 2, message: "Authentication failed." }],
  ]) {
    await assert.rejects(transport(status, data).request(url), error => {
      assert.equal(error.code, "reconnect_required");
      assert.equal(error.reconnect, true);
      assert.equal(error.authFailure, "access_token");
      return true;
    });
  }
});

test("invalid OAuth grants are distinguished from renewable access tokens", async () => {
  for (const url of tokenEndpoints) {
    for (const status of [400, 401, 200]) {
      await assert.rejects(transport(status, { error: "invalid_grant", error_description: "private refresh credential" }).request(url, { method: "POST", form: { grant_type: "refresh_token" } }), error => {
        assert.equal(error.code, "reconnect_required", url);
        assert.equal(error.authFailure, "grant", url);
        assert.equal(error.reconnect, true);
        assert.ok(!JSON.stringify(error).includes("private refresh credential"));
        return true;
      });
    }
  }
});

test("OAuth client configuration errors never invalidate a user's connection", async () => {
  for (const url of tokenEndpoints) {
    for (const [status, data] of [[401, "Unauthorized"], [400, { error: "invalid_client" }], [400, { error: "unauthorized_client" }]]) {
      await assert.rejects(transport(status, data).request(url, { method: "POST" }), error => {
        assert.match(error.code, /app_credentials$/, url);
        assert.equal(error.reconnect, false);
        assert.equal(error.authFailure, undefined);
        return true;
      });
    }
  }
});

test("Pinterest permission diagnostics remain actionable without dropping the connection", async () => {
  const http = transport(403, { code: 29, message: "Your token does not have sufficient permissions. private-token" });
  await assert.rejects(http.request("https://api.pinterest.com/v5/pins"), error => {
    assert.equal(error.code, "provider_permissions");
    assert.equal(error.reconnect, false);
    assert.deepEqual(error.details, { provider: "pinterest", httpStatus: 403, providerCode: 29 });
    assert.match(error.message, /permissions needed/);
    assert.ok(!JSON.stringify(error).includes("private-token"));
    return true;
  });
});

test("temporary transport failures and allowance limits preserve connection authorization", async () => {
  const offline = new HttpTransport({ fetcher: async () => { throw new TypeError("fetch failed"); } });
  for (const http of [offline, transport(503, { error: "expired upstream request" }), transport(429, {}, { "retry-after": "10" }), transport(400, { error: { code: 4, message: "Request limit reached; permission expired upstream." } })]) {
    await assert.rejects(http.request("https://graph.facebook.com/v24.0/me"), error => {
      assert.equal(error.reconnect, false);
      assert.equal(error.authFailure, undefined);
      assert.equal(error.retryable, true);
      return true;
    });
  }
  await assert.rejects(offline.request("https://api.example/posts", { method: "POST" }), error => !error.reconnect && error.uncertain && !error.retryable);
});

test("Bluesky session restoration retries network, server and lock failures without reconnecting", async () => {
  for (const failure of [new TypeError("fetch failed"), Object.assign(new Error("Unavailable"), { status: 503 }), new OAuthResponseError(new Response("", { status: 503 }), { error: "server_error" }), new OAuthResponseError(new Response("", { status: 503 }), { error: "invalid_grant" }), new BridgeError("busy", { code: "account_busy", status: 409 })]) {
    const provider = new BlueskyProvider();
    provider.client = async () => ({ restore: async () => { throw failure; } });
    await assert.rejects(provider.agent({ did }), error => {
      assert.equal(error.reconnect, false);
      assert.equal(error.authFailure, undefined);
      assert.equal(error.retryable, true);
      return true;
    });
  }
});

test("Bluesky reconnects only when the SDK explicitly identifies an unusable session grant", async () => {
  for (const failure of [new TokenInvalidError(did), new TokenRevokedError(did), new TokenRefreshError(did, "The session was deleted by another process"), new OAuthResponseError(new Response("", { status: 400 }), { error: "invalid_grant" })]) {
    const provider = new BlueskyProvider();
    provider.client = async () => ({ restore: async () => { throw failure; } });
    await assert.rejects(provider.agent({ did }), error => error.reconnect && error.authFailure === "grant");
  }
  for (const failure of [new OAuthResponseError(new Response("", { status: 401 }), { error: "invalid_client" }), new OAuthResponseError(new Response("", { status: 400 }), { error: "unauthorized_client" })]) {
    const provider = new BlueskyProvider();
    provider.client = async () => ({ restore: async () => { throw failure; } });
    await assert.rejects(provider.agent({ did }), error => error.code === "provider_app_credentials" && !error.reconnect);
  }
});

test("Bluesky scheduled renewal forces the SDK to refresh and preserves DID credentials", async () => {
  const provider = new BlueskyProvider(), calls = [], credentials = { did };
  provider.client = async () => ({ restore: async (subject, refresh) => {
    calls.push({ subject, refresh });
    return { did: subject, fetchHandler: async () => new Response("{}") };
  } });
  assert.deepEqual(await provider.refresh(credentials), credentials);
  assert.deepEqual(calls, [{ subject: did, refresh: true }]);
});

test("Bluesky session writes and removals wait for durable storage acknowledgement", async () => {
  const calls = [], data = new Map();
  let release;
  const provider = new BlueskyProvider({
    store: {
      put: (kind, value) => { data.set(value.id, value); calls.push("put"); return value; },
      remove: (kind, id) => { calls.push("remove"); return data.delete(id); },
      flush: () => { calls.push("flush"); return new Promise(resolve => { release = resolve; }); },
    },
    vault: { encrypt: value => JSON.stringify(value) },
  });
  const sessions = provider.encryptedStore("blueskySession");
  let written = false;
  const writing = sessions.set(did, { tokenSet: { sub: did } }).then(() => { written = true; });
  await Promise.resolve();
  assert.equal(written, false); assert.deepEqual(calls, ["put", "flush"]);
  release(); await writing; assert.equal(written, true);
  let removed = false;
  const removing = sessions.del(did).then(() => { removed = true; });
  await Promise.resolve();
  assert.equal(removed, false); assert.deepEqual(calls, ["put", "flush", "remove", "flush"]);
  release(); await removing; assert.equal(removed, true); assert.equal(data.size, 0);
});

test("Bluesky API failures retain access-token and retry safety distinctions", async () => {
  const provider = new BlueskyProvider();
  provider.agent = async () => ({ getPosts: async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); } });
  await assert.rejects(provider.metrics({ credentials: { did }, delivery: { externalId: "at://post" } }), error => error.reconnect && error.authFailure === "access_token");
  const reset = Math.floor(Date.now() / 1000) + 60;
  const limited = provider.sdkError(new OAuthResponseError(new Response("", { status: 429, headers: { "ratelimit-reset": String(reset) } }), { error: "rate_limit" }), false);
  assert.equal(limited.reconnect, false); assert.equal(limited.retryable, true); assert.equal(limited.retryAt, reset * 1000);
  const uncertain = provider.sdkError(new TypeError("network failure"), true);
  assert.equal(uncertain.reconnect, false); assert.equal(uncertain.retryable, false); assert.equal(uncertain.uncertain, true);
});
