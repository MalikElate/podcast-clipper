import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { TwitchProvider, KickProvider } from "../src/bridge/platforms/ChatProviders.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";
import { ProviderError } from "../src/bridge/core/errors.js";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

const env = { TWITCH_CLIENT_ID: "twitch-client", TWITCH_CLIENT_SECRET: "twitch-secret", KICK_CLIENT_ID: "kick-client", KICK_CLIENT_SECRET: "kick-secret" };
const content = settings => ({ caption: "Hello chat", media: [], format: "auto", settings: settings || {} });
const identity = { client_id: env.TWITCH_CLIENT_ID, user_id: "123", scopes: ["user:write:chat", "moderator:manage:announcements"] };
function context(settings) {
  const ctx = { content: content(settings), account: { remoteId: "123", profileUrl: "https://kick.com/meadow" }, credentials: { accessToken: "access" }, delivery: { id: "delivery" }, progress: {} };
  ctx.checkpoint = async patch => { Object.assign(ctx.progress, structuredClone(patch)); };
  return ctx;
}
function provider(Provider, handler) {
  const calls = [];
  const instance = new Provider({ env, publicUrl: "https://findmeadow.com", delay: async () => {}, transport: { request: async (url, options) => { calls.push({ url, ...options }); return handler(url, options, calls.length); } } });
  return { instance, calls };
}

test("Kick OAuth binds the redirect and PKCE verifier; Twitch requests only needed scopes", async () => {
  const { instance, calls } = provider(KickProvider, () => ({ access_token: "a", refresh_token: "r", expires_in: 3600 }));
  const url = new URL(await instance.authorizationUrl({ state: "state", verifier: "verifier" }));
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update("verifier").digest("base64url"));
  assert.equal(url.searchParams.get("redirect_uri"), "https://findmeadow.com/oauth/kick/callback");
  assert.equal(url.searchParams.get("state"), "state");
  await instance.exchange({ code: "code", verifier: "verifier" });
  assert.equal(calls[0].form.code_verifier, "verifier");
  const refreshed = await instance.refresh({ accessToken: "old", refreshToken: "old-r", channelId: "123" });
  assert.equal(calls[1].form.refresh_token, "old-r");
  assert.equal(refreshed.refreshToken, "r");
  assert.equal(refreshed.channelId, "123");
  const twitch = new TwitchProvider({ env });
  assert.deepEqual(twitch.oauth.scopes, identity.scopes);
  assert.equal(new KickProvider({ env: {} }).configured, false);
});

test("Twitch verifies client, channel and permissions before listing an account", async () => {
  const { instance, calls } = provider(TwitchProvider, url => url.endsWith("validate") ? identity : { data: [{ id: "123", login: "meadow", display_name: "Meadow" }] });
  const [account] = await instance.accounts({ accessToken: "a" });
  assert.equal(account.profileUrl, "https://www.twitch.tv/meadow");
  assert.equal(calls[1].headers["Client-Id"], env.TWITCH_CLIENT_ID);
  await assert.rejects(instance.validateConnection({ remoteId: "456" }, { accessToken: "a" }), error => error.reconnect);
  for (const bad of [{ ...identity, client_id: "other" }, { ...identity, scopes: [] }, { ...identity, user_id: null }]) {
    const h = provider(TwitchProvider, () => bad);
    await assert.rejects(h.instance.accounts({ accessToken: "a" }), error => error.reconnect);
  }
});

test("Kick discovers its own channel and never persists the returned email", async () => {
  const { instance, calls } = provider(KickProvider, url => url.endsWith("users") ? { data: [{ user_id: 123, name: "Meadow", email: "private@example.com" }] } : { data: [{ broadcaster_user_id: 123, slug: "meadow-live" }] });
  const accounts = await instance.accounts({ accessToken: "a" });
  assert.equal(accounts[0].remoteId, "123");
  assert.equal(accounts[0].profileUrl, "https://kick.com/meadow-live");
  assert.ok(!JSON.stringify(accounts).includes("private@example.com"));
  assert.match(calls[1].url, /broadcaster_user_id=123$/);
  await assert.rejects(instance.accounts({ accessToken: "a", scope: "user:read" }), error => error.reconnect);
});

for (const Provider of [TwitchProvider, KickProvider]) {
  test(`${Provider.name} checkpoints replies and resumes without repeating confirmed messages`, async () => {
    let fail = true;
    const { instance, calls } = provider(Provider, (url, options, count) => {
      if (count === 2 && fail) throw new ProviderError("Limited", { retryable: true, code: "rate_limited" });
      const data = { is_sent: true, message_id: `message-${count}` };
      return { data: Provider === TwitchProvider ? [data] : data };
    });
    const ctx = context({ replies: ["Second", "Third"], replyToMessageId: "original" });
    await assert.rejects(instance.publish(ctx), /Limited/);
    assert.deepEqual(ctx.progress.chat.sent, ["message-1"]);
    fail = false;
    const result = await instance.publish(ctx);
    assert.equal(result.externalId, "message-1");
    const parentKey = Provider === TwitchProvider ? "reply_parent_message_id" : "reply_to_message_id";
    assert.equal(calls[0].json[parentKey], "original");
    assert.equal(calls[2].json[parentKey], "message-1");
    assert.equal(calls[3].json[parentKey], "message-3");
    assert.equal(calls.length, 4);
    await instance.publish(ctx);
    assert.equal(calls.length, 4, "fully checkpointed thread is not resent");
    ctx.content.caption = "Changed";
    await assert.rejects(instance.publish(ctx), /partially sent/);
  });

  test(`${Provider.name} distinguishes rejection, missing confirmation and a network timeout`, async () => {
    for (const data of [{ is_sent: false, message_id: "not-sent" }, { is_sent: true }, {}]) {
      const h = provider(Provider, () => ({ data: Provider === TwitchProvider ? [data] : data }));
      await assert.rejects(h.instance.publish(context()), error => data.is_sent === false ? error.code === "chat_rejected" && !error.uncertain : error.uncertain);
    }
    const instance = new Provider({ env, transport: new HttpTransport({ fetcher: async () => { throw new Error("timeout"); } }) });
    await assert.rejects(instance.publish(context()), error => error.uncertain && !error.retryable);
  });

  test(`${Provider.name} waits for a durable checkpoint before sending the next message`, async () => {
    const h = provider(Provider, () => ({ data: Provider === TwitchProvider ? [{ is_sent: true, message_id: "one" }] : { is_sent: true, message_id: "one" } }));
    const ctx = context({ replies: ["Second"] });
    ctx.checkpoint = async () => { throw new Error("storage unavailable"); };
    await assert.rejects(h.instance.publish(ctx), /storage unavailable/);
    assert.equal(h.calls.length, 1);
  });
}

test("Twitch announcements verify HTTP 204, use every supported color, and never invent a remote message ID", async () => {
  for (const color of ["primary", "blue", "green", "orange", "purple"]) {
    const { instance, calls } = provider(TwitchProvider, () => ({ status: 204 }));
    const result = await instance.publish(context({ messageType: "announcement", announcementColor: color, replies: ["Next announcement"] }));
    assert.equal(result.externalId, "announcement:delivery:0");
    assert.equal(calls[0].json.color, color);
    assert.match(calls[0].url, /broadcaster_id=123&moderator_id=123$/);
    assert.equal(calls[1].json.reply_parent_message_id, undefined);
  }
  const h = provider(TwitchProvider, () => ({ status: 200 }));
  await assert.rejects(h.instance.publish(context({ messageType: "announcement" })), error => error.uncertain);
});

test("chat validation enforces text, follow-ups, colors, Unicode and Kick's byte limit", () => {
  const twitch = new TwitchProvider(), kick = new KickProvider();
  for (const p of [twitch, kick]) {
    assert.deepEqual(p.validate({ ...content(), caption: "a".repeat(500) }), []);
    assert.ok(p.validate({ ...content(), caption: "a".repeat(501) }).length);
    assert.ok(p.validate({ ...content(), media: [{ kind: "image", status: "ready" }] }).length);
    for (const replies of [[""], [4], Array(11).fill("x"), "invalid"]) assert.ok(p.validate(content({ replies })).length);
  }
  assert.equal(kick.validate({ ...content(), caption: "e\u0301".repeat(500) }).length, 0);
  assert.ok(kick.validate({ ...content(), caption: "👨‍👩‍👧‍👦".repeat(100) }).some(x => x.includes("2,048")));
  assert.ok(twitch.validate(content({ messageType: "announcement", replyToMessageId: "parent" })).length);
  assert.ok(twitch.validate(content({ announcementColor: "red" })).length);
});

test("disconnect revokes Twitch access and both Kick tokens using documented endpoints", async () => {
  const twitch = provider(TwitchProvider, () => ({ status: 200 }));
  assert.deepEqual(await twitch.instance.revoke({ accessToken: "a" }), { remoteRevocation: true });
  assert.deepEqual(twitch.calls[0].form, { token: "a", client_id: env.TWITCH_CLIENT_ID });
  const kick = provider(KickProvider, () => ({ status: 200 }));
  await kick.instance.revoke({ accessToken: "a", refreshToken: "r" });
  assert.equal(new URL(kick.calls[0].url).searchParams.get("token_hint_type"), "refresh_token");
  assert.equal(new URL(kick.calls[1].url).searchParams.get("token"), "a");
});

function appFixture(t, platform = "kick") {
  let now = Date.parse("2026-09-21T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-chat-test-"));
  const instance = platform === "kick" ? new KickProvider({ env }) : new TwitchProvider({ env });
  instance.options = async () => ({ limits: [] });
  const app = new BridgeApplication({ store: new SqliteStore(), registry: new ProviderRegistry([instance]), clock: () => now, env: { BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test-key" } });
  instance.store = app.store;
  const project = app.projects.create("owner", { name: "Chat" });
  const account = app.store.put("account", { id: "account", ownerUid: "owner", projectId: project.id, platform, remoteId: "123", label: "Meadow", rateKey: `${platform}:123`, status: "connected", authorizationId: "auth", encryptedCredentials: app.vault.encrypt({ accessToken: "a", expiresAt: now + 30 * 86400000 }, "account:account") });
  const post = { caption: "First", mediaIds: [], accountIds: [account.id], format: "text", schedule: { mode: "now", timeZone: "UTC" }, overrides: { [account.id]: { settings: { replies: ["Second", "Third"] } } } };
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, instance, project, account, post, advance: ms => { now += ms; } };
}

for (const uncertain of [false, true]) test(`worker keeps confirmed chat messages across a manual ${uncertain ? "uncertain" : "rejected"} retry`, async t => {
  const h = appFixture(t), sent = [];
  let fail = true;
  h.instance.send = async (ctx, text) => { if (text === "Second" && fail) throw new ProviderError("Check chat", { uncertain }); sent.push(text); return `id-${sent.length}`; };
  const { posts: [post] } = await h.app.posts.submit("owner", h.project.id, { requestId: randomBytes(16).toString("hex"), items: [h.post] });
  const id = post.deliveries[0].id;
  await h.app.worker.deliver(id);
  const partial = h.app.posts.get("owner", h.project.id, post.id);
  assert.equal(partial.deliveries[0].chatMessagesSent, 1);
  assert.equal(partial.editable, false);
  await assert.rejects(h.app.posts.update("owner", h.project.id, post.id, { ...h.post, caption: "Changed" }));
  assert.throws(() => h.app.posts.remove("owner", h.project.id, post.id));
  if (uncertain) assert.throws(() => h.app.posts.retry("owner", h.project.id, id));
  fail = false;
  h.app.posts.retry("owner", h.project.id, id, { confirmedNotPublished: true });
  await h.app.worker.deliver(id);
  assert.deepEqual(sent, ["First", "Second", "Third"]);
  assert.equal(h.app.store.get("delivery", id).status, "published");
});

test("Twitch maintenance validates at least hourly and marks a revoked grant for reconnection", async t => {
  const h = appFixture(t, "twitch");
  let validations = 0;
  h.instance.validateConnection = async () => { validations++; };
  await h.app.accounts.maintainConnections();
  assert.equal(validations, 1);
  h.advance(49 * 60000);
  await h.app.accounts.maintainConnections();
  assert.equal(validations, 1);
  h.advance(60000);
  h.instance.validateConnection = async () => { validations++; throw new ProviderError("Revoked", { reconnect: true }); };
  await h.app.accounts.maintainConnections();
  assert.equal(validations, 2);
  assert.equal(h.app.store.get("account", "account").status, "reconnect_required");
});

test("disconnect during a thread prevents its next message from being sent", async t => {
  const h = appFixture(t), sent = [];
  h.instance.send = async (ctx, text) => {
    sent.push(text);
    h.app.store.put("account", { ...h.app.store.get("account", "account"), status: "deleting" });
    return "first";
  };
  const { posts: [post] } = await h.app.posts.submit("owner", h.project.id, { requestId: randomBytes(16).toString("hex"), items: [h.post] });
  await h.app.worker.deliver(post.deliveries[0].id);
  assert.deepEqual(sent, ["First"]);
  assert.equal(h.app.store.get("delivery", post.deliveries[0].id).progress.chat.sent.length, 1);
});

test("chat disconnect queues encrypted revocation and removes stored channel data", async t => {
  const h = appFixture(t);
  h.instance.revoke = async credentials => { assert.equal(credentials.accessToken, "a"); return { remoteRevocation: true }; };
  const result = await h.app.accounts.disconnect("owner", h.project.id, "account");
  assert.equal(result.remoteRevocation, "pending");
  await h.app.privacy.tick();
  assert.ok(!h.app.store.get("account", "account")?.encryptedCredentials);
  await h.app.privacy.tick();
  assert.equal(h.app.store.list("revocation").length, 0);
});
