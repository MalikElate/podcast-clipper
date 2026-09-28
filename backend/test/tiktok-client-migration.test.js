import test from "node:test";
import assert from "node:assert/strict";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { PrivacyService } from "../src/bridge/services/PrivacyService.js";
import { createHmac } from "node:crypto";

const env = { TIKTOK_CLIENT_KEY: "sandbox-client", TIKTOK_CLIENT_SECRET: "sandbox-secret", TIKTOK_CLIENT_KEY_V2: "production-client", TIKTOK_CLIENT_SECRET_V2: "production-secret" };
function setup(overrides = {}) {
  const calls = [];
  const provider = new TikTokProvider({ env: { ...env, ...overrides }, publicUrl: "https://findmeadow.com", transport: { request: async (url, options) => {
    calls.push({ url, ...options });
    return { access_token: "access", refresh_token: "rotated-refresh", expires_in: 3600, scope: "video.publish" };
  } } });
  return { provider, calls };
}

test("new TikTok authorizations and exchanges use the approved production client", async () => {
  const { provider, calls } = setup();
  const url = new URL(await provider.authorizationUrl({ state: "state" }));
  assert.equal(url.searchParams.get("client_key"), "production-client");
  assert.equal(url.searchParams.get("redirect_uri"), "https://findmeadow.com/oauth/tiktok/callback");
  const credentials = await provider.exchange({ code: "approved-code" });
  assert.equal(calls[0].form.client_key, "production-client");
  assert.equal(calls[0].form.client_secret, "production-secret");
  assert.equal(credentials.tiktokClientKey, "production-client");
});

test("TikTok renews and revokes each grant with its original client credentials", async () => {
  for (const client of [undefined, "sandbox-client", "production-client"]) {
    const { provider, calls } = setup();
    const credentials = { accessToken: "original-access", refreshToken: "original-refresh", ...(client ? { tiktokClientKey: client } : {}) };
    const refreshed = await provider.refresh(credentials);
    const expected = client || "sandbox-client";
    assert.equal(refreshed.tiktokClientKey, expected);
    assert.equal(refreshed.refreshToken, "rotated-refresh");
    assert.equal(calls[0].form.client_key, expected);
    assert.equal(calls[0].form.client_secret, expected === "production-client" ? "production-secret" : "sandbox-secret");
    await provider.revoke(refreshed);
    assert.equal(calls[1].form.client_key, expected);
    assert.equal(calls[1].form.client_secret, calls[0].form.client_secret);
    assert.equal(calls[1].form.token, "access");
    assert.equal(credentials.accessToken, "original-access");
  }
});

test("partial production configuration cannot combine a production key with a sandbox secret", async () => {
  for (const missing of ["TIKTOK_CLIENT_KEY_V2", "TIKTOK_CLIENT_SECRET_V2"]) {
    const { provider, calls } = setup({ [missing]: "" });
    assert.equal(provider.configured, false);
    await assert.rejects(provider.authorizationUrl({ state: "state" }), error => error.code === "platform_unconfigured");
    assert.equal(calls.length, 0);
  }
});

test("unknown TikTok grants require reconnection without contacting the wrong client", async () => {
  const { provider, calls } = setup();
  const credentials = { accessToken: "access", refreshToken: "refresh", tiktokClientKey: "retired-client" };
  await assert.rejects(provider.refresh(credentials), error => error.reconnect && error.code === "reconnect_required");
  await assert.rejects(provider.revoke(credentials), error => error.reconnect && error.code === "reconnect_required");
  assert.equal(calls.length, 0);
});

test("TikTok removal webhooks verify the matching app secret and isolate production from sandbox grants", () => {
  const now = 1800000000000, records = new Map(), removals = [];
  const accounts = [
    { id: "sandbox", encryptedCredentials: { accessToken: "sandbox-access" } },
    { id: "production", encryptedCredentials: { accessToken: "production-access", tiktokClientKey: "production-client" } },
  ].map(account => ({ ...account, platform: "tiktok", remoteId: "same-open-id", ownerUid: "owner", projectId: "project", createdAt: now - 1000 }));
  const privacy = new PrivacyService({ env, clock: () => now, vault: { decrypt: value => value }, store: {
    get: (kind, id) => records.get(`${kind}:${id}`), put: (kind, record) => records.set(`${kind}:${record.id}`, record),
    list: kind => kind === "account" ? accounts : [], transaction: fn => fn(),
  } });
  privacy.requestConnection = (uid, projectId, id, options) => removals.push({ id, options });
  for (const [client, secret, id] of [["production-client", "production-secret", "production"], ["sandbox-client", "sandbox-secret", "sandbox"]]) {
    const body = Buffer.from(JSON.stringify({ client_key: client, event: "authorization.removed", user_openid: "same-open-id", create_time: now / 1000 }));
    const signature = value => `t=${now / 1000},s=${createHmac("sha256", value).update(`${now / 1000}.`).update(body).digest("hex")}`;
    assert.throws(() => privacy.tiktokWebhook(body, signature(secret === "production-secret" ? "sandbox-secret" : "production-secret")), /Unexpected TikTok client/);
    assert.equal(privacy.tiktokWebhook(body, signature(secret)).received, true);
    assert.equal(removals.at(-1).id, id);
    assert.equal(removals.at(-1).options.matchAuthorizationOnly, true);
    const count = removals.length;
    privacy.tiktokWebhook(body, signature(secret));
    assert.equal(removals.length, count, "replayed removal must not erase a later grant");
  }
  assert.deepEqual(removals.map(item => item.id), ["production", "sandbox"]);
});
