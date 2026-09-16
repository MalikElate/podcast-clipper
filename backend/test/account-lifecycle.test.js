import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { connectionDisclosure } from "../src/bridge/platforms/connectionPrivacy.js";
import { ProviderError } from "../src/bridge/core/errors.js";

const DAY = 86400000;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture(t) {
  let now = Date.parse("2026-09-14T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-account-lifecycle-"));
  const providers = Object.fromEntries(["x", "pinterest", "youtube", "google_business"].map(id => {
    const provider = new PlatformProvider(id, { env: {}, clock: () => now });
    provider.refresh = async () => { throw new Error(`Unexpected ${id} refresh`); };
    provider.accounts = async () => { throw new Error(`Unexpected ${id} profile lookup`); };
    return [id, provider];
  }));
  const app = new BridgeApplication({
    store: new SqliteStore(), registry: new ProviderRegistry(Object.values(providers)), clock: () => now,
    deleteIdentity: async () => {}, deleteAnalytics: async () => true,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "lifecycle-test", BRIDGE_APP_URL: "https://meadow.example", BRIDGE_PUBLIC_URL: "https://meadow.example" },
  });
  const project = app.projects.create("alice", { name: "Alice" });
  const account = (id, { credentials = { accessToken: `access-${id}`, expiresAt: now + 30 * DAY }, platform = "x", ...overrides } = {}) => app.store.put("account", {
    id, ownerUid: "alice", projectId: project.id, platform, remoteId: id, label: `Profile ${id}`, avatar: "https://example.com/avatar", profileUrl: `https://example.com/${id}`,
    status: "connected", rateKey: `${platform}:${id}`, authorizationId: `authorization-${id}`, authorizationGrantedAt: now,
    createdAt: now, updatedAt: now, profileUpdatedAt: now, profileAttemptedAt: now, options: null,
    encryptedCredentials: app.vault.encrypt(credentials, `account:${id}`), ...overrides,
  });
  const saved = id => app.store.get("account", id);
  const tokens = id => app.vault.decrypt(saved(id).encryptedCredentials, `account:${id}`);
  const reconnect = (id, credentials, profile = {}) => {
    const old = saved(id), connectionId = randomUUID(), disclosure = connectionDisclosure(old.platform);
    app.store.put("connection", {
      id: connectionId, ownerUid: old.ownerUid, projectId: old.projectId, platform: old.platform, createdAt: now, expiresAt: now + 60000,
      privacyConsent: disclosure ? { accepted: true, platform: old.platform, version: disclosure.version } : null,
      encrypted: app.vault.encrypt([{ remoteId: old.remoteId, label: `Reconnected ${id}`, ...profile, credentials }], `connection:${connectionId}`),
    });
    app.accounts.attach(old.ownerUid, old.projectId, connectionId, [old.remoteId]);
    return saved(id);
  };
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, providers, project, account, saved, tokens, reconnect, now: () => now, advance: ms => { now += ms; } };
}

test("maintenance renews before either token expires and leaves lifetime-free connections connected", async t => {
  const h = fixture(t), calls = [];
  h.account("access-due", { credentials: { accessToken: "access-due", refreshToken: "refresh-access", expiresAt: h.now() + 6 * DAY, refreshExpiresAt: h.now() + 60 * DAY } });
  h.account("refresh-due", { credentials: { accessToken: "refresh-due", refreshToken: "refresh-due", expiresAt: h.now() + 30 * DAY, refreshExpiresAt: h.now() + 6 * DAY } });
  h.account("no-expiry", { createdAt: h.now() - 400 * DAY, authorizationGrantedAt: h.now() - 400 * DAY, credentials: { accessToken: "lasting-token", expiresAt: null } });
  h.providers.x.refresh = async credentials => {
    calls.push(credentials.accessToken);
    return { ...credentials, accessToken: `renewed-${credentials.accessToken}`, expiresAt: h.now() + 30 * DAY, refreshExpiresAt: h.now() + 60 * DAY };
  };
  await h.app.accounts.maintainConnections();
  assert.deepEqual(calls.sort(), ["access-due", "refresh-due"]);
  for (const id of ["access-due", "refresh-due", "no-expiry"]) assert.equal(h.saved(id).status, "connected");
  assert.equal(h.tokens("access-due").accessToken, "renewed-access-due");
  assert.equal(h.tokens("refresh-due").accessToken, "renewed-refresh-due");
  assert.equal(h.tokens("no-expiry").accessToken, "lasting-token");
  await h.app.accounts.maintainConnections();
  assert.equal(calls.length, 2, "ordinary maintenance must not repeatedly renew already healthy tokens");
});

test("unknown token lifetimes receive periodic renewal without expiring the account", async t => {
  const h = fixture(t);
  h.account("unknown", { credentials: { accessToken: "access", refreshToken: "refresh" } });
  let calls = 0;
  h.providers.x.refresh = async credentials => ({ ...credentials, accessToken: `renewed-${++calls}` });
  await h.app.accounts.maintainConnections();
  assert.equal(calls, 1);
  h.advance(29 * DAY);
  await h.app.accounts.maintainConnections();
  assert.equal(calls, 1);
  h.advance(2 * DAY);
  await h.app.accounts.maintainConnections();
  assert.equal(calls, 2);
  assert.equal(h.saved("unknown").status, "connected");
});

test("temporary renewal failure retains credentials and retries maintenance later", async t => {
  const h = fixture(t), original = { accessToken: "still-valid", refreshToken: "refresh", expiresAt: h.now() + DAY };
  h.account("one", { credentials: original });
  let calls = 0;
  h.providers.x.refresh = async credentials => {
    if (++calls === 1) throw new ProviderError("Temporary provider outage", { retryable: true });
    return { ...credentials, accessToken: "renewed", expiresAt: h.now() + 30 * DAY };
  };
  await h.app.accounts.maintainConnections();
  assert.equal(h.saved("one").status, "connected");
  assert.deepEqual(h.tokens("one"), original);
  assert.ok(h.saved("one").maintenanceDueAt > h.now());
  assert.ok(h.saved("one").maintenanceDueAt < h.now() + DAY);
  await h.app.accounts.maintainConnections();
  assert.equal(calls, 1, "a temporary failure must not cause a tight retry loop");
  h.advance(h.saved("one").maintenanceDueAt - h.now() + 1);
  await h.app.accounts.maintainConnections();
  assert.equal(calls, 2);
  assert.equal(h.tokens("one").accessToken, "renewed");
  assert.equal(h.saved("one").status, "connected");
  assert.equal(h.saved("one").maintenanceAttempts, 0);
});

test("concurrent account operations share a rotated token across the owner's grant only", { timeout: 5000 }, async t => {
  const h = fixture(t), started = deferred(), release = deferred();
  const secondProject = h.app.projects.create("alice", { name: "Second" });
  const bobProject = h.app.projects.create("bob", { name: "Bob" });
  const credentials = { accessToken: "old-access", refreshToken: "shared-refresh", scope: "granted-scope", expiresAt: h.now() - 1, refreshExpiresAt: h.now() + 60 * DAY };
  const one = h.account("one", { credentials }), two = h.account("two", { credentials, projectId: secondProject.id });
  const bob = h.account("bob", { credentials, ownerUid: "bob", projectId: bobProject.id });
  const unrelated = h.account("unrelated", { credentials: { ...credentials, refreshToken: "unrelated-refresh" } });
  const calls = [];
  h.providers.x.refresh = async value => {
    calls.push(value.refreshToken); started.resolve(); await release.promise;
    return { ...value, accessToken: "new-access", refreshToken: "rotated-refresh", expiresAt: h.now() + 30 * DAY };
  };
  const first = h.app.accounts.credentials(one);
  await started.promise;
  const second = h.app.accounts.credentials(two);
  release.resolve();
  const results = await Promise.all([first, second]);
  assert.deepEqual(calls, ["shared-refresh"], "the second account must reuse the completed renewal");
  for (const result of results) assert.equal(result.refreshToken, "rotated-refresh");
  for (const id of [one.id, two.id]) {
    assert.equal(h.tokens(id).refreshToken, "rotated-refresh");
    assert.equal(h.tokens(id).accessToken, "new-access");
    assert.equal(h.tokens(id).scope, "granted-scope");
    assert.equal(h.tokens(id).refreshExpiresAt, credentials.refreshExpiresAt);
    assert.equal(h.saved(id).label, `Profile ${id}`);
    assert.equal(h.saved(id).remoteId, id);
  }
  assert.equal(h.saved(bob.id).encryptedCredentials, bob.encryptedCredentials);
  assert.equal(h.saved(unrelated.id).encryptedCredentials, unrelated.encryptedCredentials);
});

test("a rotated Google grant also renews the same owner's connected Business Profile", async t => {
  const h = fixture(t), credentials = { accessToken: "old", refreshToken: "google-refresh", expiresAt: h.now() - 1 };
  const youtube = h.account("channel", { platform: "youtube", credentials });
  h.account("business", { platform: "google_business", credentials });
  h.providers.youtube.refresh = async value => ({ ...value, accessToken: "new-google", refreshToken: "new-refresh", expiresAt: h.now() + DAY });
  await h.app.accounts.credentials(youtube);
  assert.equal(h.tokens("business").refreshToken, "new-refresh");
  assert.equal(h.tokens("business").accessToken, "new-google");
  assert.equal(h.saved("business").platform, "google_business");
});

test("Pinterest remains listed when its profile is temporarily unavailable", async t => {
  const h = fixture(t);
  h.account("pins", { platform: "pinterest", label: "Pinterest account" });
  for (const behavior of [async () => [], async () => { throw new ProviderError("Temporary outage", { retryable: true }); }]) {
    h.providers.pinterest.accounts = behavior;
    const accounts = await h.app.accounts.listFresh("alice", h.project.id);
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].id, "pins");
    assert.equal(accounts[0].status, "connected");
    assert.equal(h.saved("pins").status, "connected");
    assert.ok(h.saved("pins").encryptedCredentials);
  }
});

test("Pinterest displays fresh profile data without exposing internal authorization metadata", async t => {
  const h = fixture(t);
  h.account("pins", { platform: "pinterest", label: "Pinterest account" });
  h.providers.pinterest.accounts = async () => [{ remoteId: "pins", label: "@fresh-profile", avatar: "https://example.com/fresh.png" }];
  const [account] = await h.app.accounts.listFresh("alice", h.project.id);
  assert.equal(account.label, "@fresh-profile");
  assert.equal(account.avatar, "https://example.com/fresh.png");
  assert.equal(account.authorizationId, undefined);
  assert.equal(account.encryptedCredentials, undefined);
  assert.equal(h.saved("pins").label, "Pinterest account", "Pinterest profiles must stay transient");
});

test("YouTube refreshes a 31-day-old profile without deleting the connection", async t => {
  const h = fixture(t), credentials = { accessToken: "access", refreshToken: "refresh", expiresAt: h.now() + 10 * DAY };
  h.account("channel", { platform: "youtube", credentials, createdAt: h.now() - 31 * DAY, profileUpdatedAt: h.now() - 31 * DAY, profileAttemptedAt: h.now() - 2 * DAY });
  let calls = 0;
  h.providers.youtube.accounts = async () => {
    calls++;
    return [{ remoteId: "channel", label: "Updated channel", avatar: "https://example.com/new-channel.png", profileUrl: "https://youtube.example/channel" }];
  };
  await h.app.accounts.maintainApiData();
  assert.equal(calls, 1);
  assert.equal(h.saved("channel").label, "Updated channel");
  assert.equal(h.saved("channel").status, "connected");
  assert.equal(h.saved("channel").profileUpdatedAt, h.now());
  assert.deepEqual(h.tokens("channel"), credentials);
  assert.equal(h.app.store.list("erasure").length, 0);
});

test("reconnect-required YouTube accounts cannot starve connected profile checks", async t => {
  const h = fixture(t);
  for (let index = 0; index < 10; index++) {
    h.account(`stale-${index}`, { platform: "youtube", status: "reconnect_required", profileUpdatedAt: h.now() - 31 * DAY, profileAttemptedAt: h.now() - 40 * DAY - index, metadata: { stale: true } });
  }
  h.account("healthy", { platform: "youtube", profileAttemptedAt: h.now() - 2 * DAY });
  let calls = 0;
  h.providers.youtube.accounts = async () => {
    calls++;
    return [{ remoteId: "healthy", label: "Checked healthy channel", avatar: null, profileUrl: "https://youtube.example/healthy" }];
  };

  await h.app.accounts.maintainApiData();

  assert.equal(calls, 1);
  assert.equal(h.saved("healthy").label, "Checked healthy channel");
  assert.equal(h.saved("healthy").profileAttemptedAt, h.now());
  for (let index = 0; index < 10; index++) {
    assert.equal(h.saved(`stale-${index}`).label, "YouTube channel");
    assert.equal(h.saved(`stale-${index}`).avatar, null);
    assert.equal(h.saved(`stale-${index}`).metadata, null);
  }
  assert.equal(h.app.store.list("erasure").length, 0);
});

test("failed YouTube profile refresh clears stale API data and keeps the authorization for retry", async t => {
  const h = fixture(t);
  const original = h.account("channel", { platform: "youtube", profileUpdatedAt: h.now() - 31 * DAY, profileAttemptedAt: h.now() - 2 * DAY, metadata: { old: true }, options: { old: true } });
  h.providers.youtube.accounts = async () => { throw new ProviderError("Temporary profile outage", { retryable: true }); };
  await h.app.accounts.maintainApiData();
  const current = h.saved("channel");
  assert.equal(current.status, "connected");
  assert.equal(current.encryptedCredentials, original.encryptedCredentials);
  assert.equal(current.label, "YouTube channel");
  for (const key of ["avatar", "profileUrl", "metadata", "options"]) assert.equal(current[key], null);
  assert.equal(h.app.store.list("erasure").length, 0);
});

test("a missing YouTube channel schedules deletion instead of retaining inaccessible API data", async t => {
  const h = fixture(t);
  const credentials = { accessToken: "shared-google-access", refreshToken: "shared-google-refresh", expiresAt: h.now() + DAY };
  h.account("channel", { platform: "youtube", credentials, authorizationId: "shared-google-authorization", profileAttemptedAt: h.now() - 2 * DAY });
  h.account("business", { platform: "google_business", credentials, authorizationId: "shared-google-authorization" });
  h.providers.youtube.accounts = async () => [];

  await h.app.accounts.maintainApiData();
  const [job] = h.app.store.list("erasure", { ownerUid: "alice", limit: null });
  assert.equal(h.saved("channel").status, "deleting");
  assert.equal(h.saved("business").status, "connected");
  assert.deepEqual(job.accountIds, ["channel"]);
  assert.equal(job.reason, "lost_access");

  await h.app.privacy.tick();
  assert.equal(h.saved("channel"), null);
  assert.equal(h.saved("business").status, "connected");
  assert.deepEqual(h.tokens("business"), credentials);
  assert.deepEqual(h.app.store.list("erasure", { ownerUid: "alice", limit: null }), []);
});

test("an authorization failure expands an already-scheduled channel deletion to its shared grant", async t => {
  const h = fixture(t);
  const credentials = { accessToken: "shared-google-access", refreshToken: "shared-google-refresh", expiresAt: h.now() + DAY };
  const channel = h.account("channel", { platform: "youtube", credentials, authorizationId: "youtube-authorization", profileAttemptedAt: h.now() - 2 * DAY });
  h.account("business", { platform: "google_business", credentials, authorizationId: "business-authorization" });
  h.providers.youtube.accounts = async () => [];

  await h.app.accounts.maintainApiData();
  assert.deepEqual(h.app.store.list("erasure", { ownerUid: "alice", limit: null }).map(job => job.accountIds), [["channel"]]);
  assert.equal(h.app.accounts.markReconnect(channel.id, "Google rejected this authorization.", { authorizationId: channel.authorizationId, credentials, lossScope: "authorization" }), true);
  assert.deepEqual(h.app.store.list("erasure", { ownerUid: "alice", limit: null }).flatMap(job => job.accountIds).sort(), ["business", "channel"]);
  assert.equal(h.saved("business").status, "deleting");

  await h.app.privacy.tick();
  assert.equal(h.saved("channel"), null);
  assert.equal(h.saved("business"), null);
});

for (const failure of [false, true]) {
  test(`late options ${failure ? "failure" : "success"} cannot overwrite a new authorization`, async t => {
    const h = fixture(t), entered = deferred(), response = deferred();
    h.account("one");
    h.providers.x.options = async () => { entered.resolve(); return response.promise; };
    const pending = h.app.accounts.options("alice", h.project.id, "one", { force: true });
    await entered.promise;
    const replacement = h.reconnect("one", { accessToken: "new-authorization", expiresAt: h.now() + 30 * DAY });
    if (failure) response.reject(new ProviderError("Old token revoked", { reconnect: true, code: "reconnect_required" }));
    else response.resolve({ stale: true });
    await assert.rejects(pending);
    const current = h.saved("one");
    assert.equal(current.status, "connected");
    assert.equal(current.authorizationId, replacement.authorizationId);
    assert.equal(current.lastError, null);
    assert.equal(current.options, null);
    assert.equal(h.tokens("one").accessToken, "new-authorization");
  });
}

test("an old refresh failure cannot invalidate replacement credentials", async t => {
  const h = fixture(t), entered = deferred(), response = deferred();
  const old = h.account("one", { credentials: { accessToken: "old", refreshToken: "old-refresh", expiresAt: h.now() - 1 } });
  h.providers.x.refresh = async () => { entered.resolve(); return response.promise; };
  const pending = h.app.accounts.credentials(old);
  await entered.promise;
  const replacement = h.reconnect("one", { accessToken: "new", refreshToken: "new-refresh", expiresAt: h.now() + 30 * DAY });
  response.reject(new ProviderError("Old grant revoked", { reconnect: true, code: "reconnect_required" }));
  await assert.rejects(pending, /Old grant revoked/);
  assert.equal(h.saved("one").status, "connected");
  assert.equal(h.saved("one").authorizationId, replacement.authorizationId);
  assert.equal(h.saved("one").lastError, null);
  assert.equal(h.tokens("one").refreshToken, "new-refresh");
});

test("profile maintenance never restores its old snapshot over a reconnected account", async t => {
  const h = fixture(t), entered = deferred(), response = deferred(), calls = [];
  h.account("first", { platform: "youtube", profileAttemptedAt: h.now() - 3 * DAY });
  h.account("second", { platform: "youtube", profileAttemptedAt: h.now() - 2 * DAY });
  h.providers.youtube.accounts = async credentials => {
    calls.push(credentials.accessToken);
    if (credentials.accessToken === "access-first") { entered.resolve(); return response.promise; }
    return [{ remoteId: "second", label: "Stale second profile" }];
  };
  const pending = h.app.accounts.maintainApiData();
  await entered.promise;
  const replacement = h.reconnect("second", { accessToken: "replacement", expiresAt: h.now() + 30 * DAY }, { label: "New second profile" });
  response.resolve([{ remoteId: "first", label: "Updated first profile" }]);
  await pending;
  assert.deepEqual(calls, ["access-first"], "a selection from the previous authorization must not run against the replacement");
  assert.equal(h.saved("first").label, "Updated first profile");
  assert.equal(h.saved("second").label, "New second profile");
  assert.equal(h.saved("second").authorizationId, replacement.authorizationId);
  assert.equal(h.tokens("second").accessToken, "replacement");
});

test("disconnect during a shared token refresh waits and revokes the replacement without restoring accounts", { timeout: 5000 }, async t => {
  const h = fixture(t), entered = deferred(), response = deferred(), revoked = [];
  const original = { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: h.now() - 1 };
  const one = h.account("channel", { platform: "youtube", credentials: original });
  h.account("business", { platform: "google_business", credentials: original, createdAt: h.now() + 1 });
  h.providers.youtube.refresh = async () => { entered.resolve(); return response.promise; };
  for (const provider of [h.providers.youtube, h.providers.google_business]) {
    provider.revoke = async credentials => { revoked.push(credentials); return { remoteRevocation: true }; };
  }
  const refreshing = h.app.accounts.credentials(one).then(value => ({ value }), error => ({ error }));
  await entered.promise;
  const request = h.app.accounts.disconnect("alice", h.project.id, one.id);
  await h.app.privacy.tick();
  const waiting = [h.saved("channel"), h.saved("business")];
  const revocationsWhileRefreshing = h.app.store.list("revocation");
  const callsWhileRefreshing = revoked.length;
  response.resolve({ accessToken: "rotated-access", refreshToken: "rotated-refresh", expiresAt: h.now() + 30 * DAY });
  const result = await refreshing;

  assert.equal(request.affectedConnections, 2);
  assert.deepEqual(waiting.map(account => account?.status), ["deleting", "deleting"], "erasure must wait for the in-flight grant rotation, including a sibling's shared grant lock");
  assert.equal(revocationsWhileRefreshing.length, 0);
  assert.equal(callsWhileRefreshing, 0);
  assert.equal(result.error?.code, "connection_changed");
  for (const id of ["channel", "business"]) {
    assert.equal(h.saved(id).status, "deleting");
    assert.equal(h.tokens(id).refreshToken, "rotated-refresh");
  }

  h.advance(60001);
  await h.app.privacy.tick();
  assert.equal(h.saved("channel"), null);
  assert.equal(h.saved("business"), null);
  await h.app.privacy.tick();
  assert.equal(revoked.length, 2);
  for (const credentials of revoked) {
    assert.equal(credentials.accessToken, "rotated-access");
    assert.equal(credentials.refreshToken, "rotated-refresh");
  }
  assert.equal(h.app.store.list("revocation").length, 0);
  assert.equal(h.app.accounts.list("alice", h.project.id).length, 0);
});

const rejectedAccessToken = () => Object.assign(new ProviderError("Access token rejected", { reconnect: true, code: "reconnect_required" }), { authFailure: "access_token" });

test("an access-token rejection renews once and retries the read without disconnecting", async t => {
  const h = fixture(t), reads = [], refreshes = [];
  const one = h.account("one", { credentials: { accessToken: "old-access", refreshToken: "refresh", expiresAt: h.now() + 30 * DAY } });
  h.providers.x.refresh = async credentials => {
    refreshes.push(credentials.refreshToken);
    return { ...credentials, accessToken: "renewed-access", refreshToken: "rotated-refresh" };
  };
  h.providers.x.options = async (account, credentials) => {
    reads.push(credentials.accessToken);
    if (credentials.accessToken === "old-access") throw rejectedAccessToken();
    return { available: true };
  };
  const options = await h.app.accounts.options("alice", h.project.id, one.id, { force: true });
  assert.deepEqual(options, { available: true });
  assert.deepEqual(reads, ["old-access", "renewed-access"]);
  assert.deepEqual(refreshes, ["refresh"]);
  assert.equal(h.saved(one.id).status, "connected");
  assert.equal(h.saved(one.id).authorizationId, one.authorizationId);
  assert.equal(h.saved(one.id).lastError, null);
  assert.equal(h.tokens(one.id).refreshToken, "rotated-refresh");
});

test("a late access-token rejection cannot renew or invalidate a replacement authorization", async t => {
  const h = fixture(t), entered = deferred(), response = deferred();
  h.account("one", { credentials: { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: h.now() + 30 * DAY } });
  let refreshes = 0;
  h.providers.x.refresh = async credentials => { refreshes++; return credentials; };
  h.providers.x.options = async () => { entered.resolve(); return response.promise; };
  const pending = h.app.accounts.options("alice", h.project.id, "one", { force: true });
  await entered.promise;
  const replacement = h.reconnect("one", { accessToken: "replacement-access", refreshToken: "replacement-refresh", expiresAt: h.now() + 30 * DAY });
  response.reject(rejectedAccessToken());
  await assert.rejects(pending, /Access token rejected/);
  assert.equal(refreshes, 0);
  assert.equal(h.saved("one").status, "connected");
  assert.equal(h.saved("one").authorizationId, replacement.authorizationId);
  assert.equal(h.saved("one").lastError, null);
  assert.equal(h.tokens("one").refreshToken, "replacement-refresh");
});

test("a failed retried read never renews twice or invalidates a subsequent authorization", async t => {
  const h = fixture(t), retryEntered = deferred(), response = deferred();
  h.account("one", { credentials: { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: h.now() + 30 * DAY } });
  let refreshes = 0, reads = 0;
  h.providers.x.refresh = async credentials => { refreshes++; return { ...credentials, accessToken: "renewed-access" }; };
  h.providers.x.options = async () => {
    if (++reads === 1) throw rejectedAccessToken();
    retryEntered.resolve(); return response.promise;
  };
  const pending = h.app.accounts.options("alice", h.project.id, "one", { force: true });
  await retryEntered.promise;
  const replacement = h.reconnect("one", { accessToken: "replacement-access", refreshToken: "replacement-refresh", expiresAt: h.now() + 30 * DAY });
  response.reject(rejectedAccessToken());
  await assert.rejects(pending, /Access token rejected/);
  assert.equal(refreshes, 1);
  assert.equal(reads, 2);
  assert.equal(h.saved("one").status, "connected");
  assert.equal(h.saved("one").authorizationId, replacement.authorizationId);
  assert.equal(h.saved("one").lastError, null);
  assert.equal(h.tokens("one").refreshToken, "replacement-refresh");
});

test("renewed credentials are not returned until their durable flush completes", async t => {
  const h = fixture(t), flushEntered = deferred(), flushed = deferred();
  const one = h.account("one", { credentials: { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: h.now() - 1 } });
  h.providers.x.refresh = async credentials => ({ ...credentials, accessToken: "renewed-access", refreshToken: "rotated-refresh", expiresAt: h.now() + 30 * DAY });
  const originalFlush = h.app.store.flush.bind(h.app.store);
  h.app.store.flush = async () => {
    if (h.tokens(one.id).refreshToken === "rotated-refresh") { flushEntered.resolve(); await flushed.promise; }
    return originalFlush();
  };
  let returned = false;
  const pending = h.app.accounts.credentials(one).then(credentials => { returned = true; return credentials; });
  try {
    await flushEntered.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(returned, false, "publishing must wait for durable token storage");
    assert.equal(h.tokens(one.id).refreshToken, "rotated-refresh");
  } finally {
    flushed.resolve();
    await pending;
    h.app.store.flush = originalFlush;
  }
  assert.equal(returned, true);
  assert.equal((await pending).refreshToken, "rotated-refresh");
});

test("reconnecting during the post-refresh flush never returns the previous grant", async t => {
  const h = fixture(t), entered = deferred(), release = deferred();
  const one = h.account("one", { credentials: { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: h.now() - 1 } });
  h.providers.x.refresh = async credentials => ({ ...credentials, accessToken: "rotated-access", refreshToken: "rotated-refresh", expiresAt: h.now() + 30 * DAY });
  const originalFlush = h.app.store.flush.bind(h.app.store);
  h.app.store.flush = async () => {
    if (h.tokens(one.id).refreshToken === "rotated-refresh") { entered.resolve(); await release.promise; }
    return originalFlush();
  };
  const pending = h.app.accounts.credentials(one);
  await entered.promise;
  const replacement = h.reconnect(one.id, { accessToken: "replacement-access", refreshToken: "replacement-refresh", expiresAt: h.now() + 30 * DAY });
  release.resolve();
  await assert.rejects(pending, error => error.code === "connection_changed");
  assert.equal(h.saved(one.id).status, "connected");
  assert.equal(h.saved(one.id).authorizationId, replacement.authorizationId);
  assert.equal(h.tokens(one.id).refreshToken, "replacement-refresh");
});

test("disconnecting during the pre-refresh flush prevents an unnecessary token exchange", async t => {
  const h = fixture(t), entered = deferred(), release = deferred();
  const one = h.account("one", { credentials: { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: h.now() - 1 } });
  let refreshes = 0;
  h.providers.x.refresh = async credentials => { refreshes++; return { ...credentials, expiresAt: h.now() + 30 * DAY }; };
  const originalFlush = h.app.store.flush.bind(h.app.store);
  h.app.store.flush = async () => { entered.resolve(); await release.promise; return originalFlush(); };
  const pending = h.app.accounts.credentials(one);
  await entered.promise;
  h.app.accounts.disconnect("alice", h.project.id, one.id);
  release.resolve();
  await assert.rejects(pending, error => error.code === "connection_changed");
  assert.equal(refreshes, 0);
  assert.equal(h.saved(one.id).status, "deleting");
  assert.equal(h.tokens(one.id).refreshToken, "old-refresh");
});

test("healthy and coalesced credential reads cannot bypass a failed rotation flush", async t => {
  const h = fixture(t), original = { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: h.now() - 1 };
  const one = h.account("one", { credentials: original });
  let refreshes = 0, failedFlushes = 0;
  h.providers.x.refresh = async credentials => {
    refreshes++;
    return { ...credentials, accessToken: "rotated-access", refreshToken: "rotated-refresh", expiresAt: h.now() + 30 * DAY };
  };
  const originalFlush = h.app.store.flush.bind(h.app.store);
  h.app.store.flush = async () => {
    if (h.tokens(one.id).refreshToken === "rotated-refresh") { failedFlushes++; throw new Error("Durable storage unavailable"); }
    return originalFlush();
  };
  await assert.rejects(h.app.accounts.credentials(one), /Durable storage unavailable/);
  await assert.rejects(h.app.accounts.credentials(h.saved(one.id)), /Durable storage unavailable/);
  await assert.rejects(h.app.accounts.credentials(h.saved(one.id), { force: true, rejectedCredentials: original }), /Durable storage unavailable/);
  assert.equal(refreshes, 1, "a failed save must not consume another rotating refresh token");
  assert.equal(failedFlushes, 3, "every return path must wait for durable credentials");
  assert.equal(h.saved(one.id).status, "connected");
  h.app.store.flush = originalFlush;
  assert.equal((await h.app.accounts.credentials(h.saved(one.id))).refreshToken, "rotated-refresh");
});

async function queuedTextDelivery(h) {
  Object.defineProperty(h.providers.x, "configured", { value: true });
  h.providers.x.options = async () => ({ limits: [] });
  const { posts: [post] } = await h.app.posts.submit("alice", h.project.id, {
    requestId: randomUUID(),
    items: [{ caption: "A scheduled post", title: "", mediaIds: [], accountIds: ["one"], format: "text", schedule: { mode: "now", timeZone: "UTC" } }],
  });
  return post.deliveries[0];
}

test("a repeated YouTube access-token failure during publishing schedules lost-access erasure", async t => {
  const h = fixture(t);
  const credentials = { accessToken: "shared-google-access", refreshToken: "shared-google-refresh", expiresAt: h.now() + 30 * DAY };
  h.account("channel", { platform: "youtube", credentials, authorizationId: "youtube-authorization" });
  h.account("business", { platform: "google_business", credentials, authorizationId: "business-authorization" });
  Object.defineProperty(h.providers.youtube, "configured", { value: true });
  h.providers.youtube.validate = () => [];
  h.providers.youtube.refresh = async value => ({ ...value, accessToken: "renewed-google-access", expiresAt: h.now() + 30 * DAY });
  h.providers.youtube.publish = async () => {
    throw rejectedAccessToken();
  };
  const { posts: [post] } = await h.app.posts.submit("alice", h.project.id, {
    requestId: randomUUID(),
    items: [{ caption: "A scheduled video", title: "Video", mediaIds: [], accountIds: ["channel"], format: "auto", schedule: { mode: "now", timeZone: "UTC" } }],
  });

  await h.app.worker.deliver(post.deliveries[0].id);
  assert.equal(h.saved("channel").status, "connected");
  assert.equal(h.saved("business").status, "connected");
  assert.equal(h.tokens("channel").accessToken, "renewed-google-access");
  assert.equal(h.tokens("business").accessToken, "renewed-google-access");
  assert.equal(h.app.store.get("delivery", post.deliveries[0].id).status, "retrying");

  h.advance(1001);
  await h.app.worker.deliver(post.deliveries[0].id);
  assert.equal(h.saved("channel").status, "deleting");
  assert.equal(h.saved("business").status, "deleting");
  assert.equal(h.app.store.get("delivery", post.deliveries[0].id).status, "needs_account");
  assert.deepEqual(h.app.store.list("erasure", { ownerUid: "alice", limit: null }).map(job => [...job.accountIds].sort()), [["business", "channel"]]);

  await h.app.privacy.tick();
  assert.equal(h.saved("channel"), null);
  assert.equal(h.saved("business"), null);
});

function blockClaimFlush(h, deliveryId) {
  const entered = deferred(), release = deferred(), originalFlush = h.app.store.flush.bind(h.app.store);
  let blocked = false;
  h.app.store.flush = async () => {
    if (!blocked && h.app.store.get("delivery", deliveryId)?.status === "publishing") { blocked = true; entered.resolve(); await release.promise; }
    return originalFlush();
  };
  return { entered, release };
}

test("disconnecting during the publishing claim flush stops dispatch", async t => {
  const h = fixture(t); h.account("one");
  const delivery = await queuedTextDelivery(h), gate = blockClaimFlush(h, delivery.id);
  let publications = 0;
  h.providers.x.publish = async () => { publications++; return { status: "published", externalId: "unexpected-post" }; };
  const pending = h.app.worker.deliver(delivery.id);
  await gate.entered.promise;
  h.app.accounts.disconnect("alice", h.project.id, "one");
  gate.release.resolve();
  await pending;
  assert.equal(publications, 0);
  assert.equal(h.saved("one").status, "deleting");
  assert.equal(h.app.store.get("delivery", delivery.id).status, "cancelled");
});

test("reconnecting during a publishing claim uses the replacement grant on the next attempt", async t => {
  const h = fixture(t); h.account("one");
  const delivery = await queuedTextDelivery(h), gate = blockClaimFlush(h, delivery.id), publications = [];
  h.providers.x.publish = async ctx => { publications.push(ctx.credentials.accessToken); return { status: "published", externalId: "post" }; };
  const pending = h.app.worker.deliver(delivery.id);
  await gate.entered.promise;
  const replacement = h.reconnect("one", { accessToken: "replacement-access", expiresAt: h.now() + 30 * DAY });
  gate.release.resolve();
  await pending;
  assert.deepEqual(publications, []);
  assert.equal(h.app.store.get("delivery", delivery.id).status, "retrying");
  assert.equal(h.saved("one").status, "connected");
  assert.equal(h.saved("one").authorizationId, replacement.authorizationId);
  h.advance(1001);
  await h.app.worker.deliver(delivery.id);
  assert.deepEqual(publications, ["replacement-access"]);
  assert.equal(h.app.store.get("delivery", delivery.id).status, "published");
});
