import test from "node:test";
import assert from "node:assert/strict";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { PinterestProvider } from "../src/bridge/platforms/PinterestProvider.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { InstagramProvider, ThreadsProvider } from "../src/bridge/platforms/MetaProviders.js";

const now = Date.parse("2026-09-14T12:00:00Z");
const day = 86400000;
const pinterestScope = "user_accounts:read,boards:read,pins:read,pins:write";

test("OAuth refresh retains omitted account metadata and uses each rotated refresh token", async () => {
  let time = now;
  const calls = [];
  const provider = new TikTokProvider({
    clock: () => time,
    transport: { request: async (url, options) => {
      calls.push(options.form);
      return calls.length === 1
        ? { access_token: "new-access", refresh_token: "rotated-refresh", expires_in: 3600, refresh_expires_in: 60 * 86400 }
        : { access_token: "next-access", expires_in: 3600 };
    } },
  });
  const original = { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: now - 1, refreshExpiresAt: now + day, scope: "video.publish,user.info.basic", rawAccountId: "creator-id", customMetadata: "preserved" };
  const refreshed = await provider.refresh(original);
  assert.equal(refreshed.accessToken, "new-access");
  assert.equal(refreshed.refreshToken, "rotated-refresh");
  assert.equal(refreshed.expiresAt, now + 3600000);
  assert.equal(refreshed.refreshExpiresAt, now + 60 * day);
  assert.equal(refreshed.scope, original.scope);
  assert.equal(refreshed.rawAccountId, original.rawAccountId);
  assert.equal(refreshed.customMetadata, "preserved");
  assert.equal(original.refreshToken, "old-refresh", "refresh must not mutate stored input credentials");

  time += day;
  const next = await provider.refresh(refreshed);
  assert.equal(calls[0].refresh_token, "old-refresh");
  assert.equal(calls[1].refresh_token, "rotated-refresh");
  assert.equal(next.refreshToken, "rotated-refresh");
  assert.equal(next.refreshExpiresAt, refreshed.refreshExpiresAt, "omitted lifetime must not move the authorization deadline forward");
  assert.equal(next.scope, original.scope);
  assert.equal(next.rawAccountId, original.rawAccountId);
});

test("token normalization records supported refresh expiration formats as Unix milliseconds", () => {
  const provider = new PlatformProvider("x", { clock: () => now });
  for (const data of [
    { refresh_token_expires_in: 3600 },
    { refresh_token_expires_in: "3600" },
    { refresh_expires_in: 3600 },
    { refresh_token_expires_at: (now + 3600000) / 1000 },
    { refresh_token_expires_at: String((now + 3600000) / 1000), refresh_token_expires_in: 7200 },
  ]) {
    const credentials = provider.normalizeToken({ access_token: "access", expires_in: "60", ...data });
    assert.equal(credentials.expiresAt, now + 60000);
    assert.equal(credentials.refreshExpiresAt, now + 3600000);
  }
  assert.equal(provider.normalizeToken({ access_token: "access", expires_in: 0, refresh_expires_in: 0 }).expiresAt, now);
  assert.equal(provider.normalizeToken({ access_token: "access", refresh_expires_in: 0 }).refreshExpiresAt, now);
});

test("missing or unusable refresh lifetime never discards a known authorization deadline", () => {
  const provider = new PlatformProvider("x", { clock: () => now });
  const previous = { refreshToken: "refresh", refreshExpiresAt: now + day };
  for (const value of [undefined, null, "", " ", "invalid", -1, Infinity, true]) {
    const credentials = provider.normalizeToken({ access_token: "access", refresh_token_expires_in: value }, previous);
    assert.equal(credentials.refreshExpiresAt, previous.refreshExpiresAt);
    assert.equal(credentials.refreshToken, previous.refreshToken);
  }
  assert.equal(provider.normalizeToken({ access_token: "access" }).refreshExpiresAt, undefined);
});

test("returned OAuth scope and account identifiers replace previous values", async () => {
  const provider = new TikTokProvider({ transport: { request: async () => ({ access_token: "access", scope: "user.info.basic", open_id: "new-id" }) } });
  const credentials = await provider.refresh({ refreshToken: "refresh", scope: "old-scope", rawAccountId: "old-id" });
  assert.equal(credentials.scope, "user.info.basic");
  assert.equal(credentials.rawAccountId, "new-id");
});

test("Pinterest requests continuous refresh and keeps granted scopes when renewal omits them", async () => {
  const calls = [];
  const provider = new PinterestProvider({
    env: { PINTEREST_CLIENT_ID: "app", PINTEREST_CLIENT_SECRET: "secret", PINTEREST_ENVIRONMENT: "sandbox" },
    publicUrl: "https://bridge.example",
    clock: () => now,
    transport: { request: async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? { access_token: "access", refresh_token: "refresh", expires_in: 30 * 86400, refresh_token_expires_in: 60 * 86400, scope: pinterestScope }
        : { access_token: "renewed-access", refresh_token: "renewed-refresh", expires_in: 30 * 86400, refresh_token_expires_at: (now + 60 * day) / 1000 };
    } },
  });
  const original = await provider.exchange({ code: "authorization-code" });
  assert.equal(calls[0].url, "https://api-sandbox.pinterest.com/v5/oauth/token");
  assert.equal(calls[0].options.form.continuous_refresh, "true");
  assert.equal(calls[0].options.form.grant_type, "authorization_code");
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from("app:secret").toString("base64")}`);
  assert.equal(original.refreshExpiresAt, now + 60 * day);
  const renewed = await provider.refresh(original);
  assert.equal(calls[1].options.form.grant_type, "refresh_token");
  assert.equal(renewed.scope, pinterestScope);
  assert.equal(renewed.refreshToken, "renewed-refresh");
  assert.equal(renewed.refreshExpiresAt, now + 60 * day);
  assert.equal(renewed.pinterestEnvironment, "sandbox");
});

test("Pinterest still detects an explicitly reduced scope in a refresh response", async () => {
  const provider = new PinterestProvider({ transport: { request: async () => ({ access_token: "access", scope: "user_accounts:read,boards:read,pins:read" }) } });
  await assert.rejects(provider.refresh({ refreshToken: "refresh", scope: pinterestScope }), error => error.reconnect && /pins:write/.test(error.message));
});

test("Meta access-token renewal preserves optional credentials omitted by the provider", async () => {
  for (const Provider of [InstagramProvider, ThreadsProvider]) {
    const provider = new Provider({ clock: () => now, transport: { request: async () => ({ access_token: "renewed", expires_in: 60 * 86400 }) } });
    const credentials = await provider.refresh({ accessToken: "old", scope: "granted", rawAccountId: "account-id" });
    assert.equal(credentials.accessToken, "renewed");
    assert.equal(credentials.scope, "granted");
    assert.equal(credentials.rawAccountId, "account-id");
    assert.equal(credentials.expiresAt, now + 60 * day);
  }
});
