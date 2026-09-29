import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { SecretVault } from "../src/bridge/core/SecretVault.js";
import { LockService } from "../src/bridge/core/LockService.js";
import { AccountService } from "../src/bridge/services/AccountService.js";
import { ProjectService } from "../src/bridge/services/ProjectService.js";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { withZernio } from "../src/bridge/platforms/ZernioProvider.js";

function fixture(t) {
  const store = new SqliteStore(), vault = new SecretVault(randomBytes(32).toString("base64"));
  const projects = new ProjectService(store), alice = projects.create("alice", { name: "Woodbark" }), other = projects.create("alice", { name: "Other workspace" }), bob = projects.create("bob", { name: "Bob" });
  const provider = {
    authorizationUrl: async ({ state }) => `https://social.example/?state=${state}`,
    exchange: async ({ code }) => ({ accessToken: code }),
    accounts: async credentials => [{ remoteId: credentials.accessToken, label: "Channel" }],
  };
  const service = new AccountService({ store, vault, projects, locks: new LockService(store), registry: { get: () => provider } });
  const pending = (project, candidates, platform = "youtube") => {
    const id = randomUUID();
    store.put("connection", { id, ownerUid: project.ownerUid, projectId: project.id, platform, createdAt: Date.now(), expiresAt: Date.now() + 60000,
      encrypted: vault.encrypt(candidates.map(candidate => ({ label: "Channel", credentials: { accessToken: randomUUID() }, ...candidate })), `connection:${id}`) });
    return id;
  };
  const attach = (project, candidates, platform = "youtube") => service.attach(project.ownerUid, project.id, pending(project, candidates, platform), candidates.map(candidate => candidate.remoteId));
  const callback = async (project, code, platform = "youtube") => {
    const { url } = await service.start(project.ownerUid, project.id, platform);
    return service.callback(platform, new URLSearchParams({ state: new URL(url).searchParams.get("state"), code }));
  };
  t.after(() => store.close());
  return { store, vault, service, projects, alice, other, bob, provider, pending, attach, callback };
}

test("reconnecting a YouTube channel updates one row and preserves its posts and deliveries", t => {
  const h = fixture(t), [first] = h.attach(h.alice, [{ remoteId: "UC-woodbark", credentials: { accessToken: "old" } }]);
  h.store.put("post", { id: "post", ownerUid: "alice", projectId: h.alice.id, accountIds: [first.id] });
  h.store.put("delivery", { id: "delivery", ownerUid: "alice", projectId: h.alice.id, accountId: first.id, status: "published", externalId: "video" });
  h.store.put("account", { ...h.store.get("account", first.id), status: "reconnect_required" });
  const [reconnected] = h.attach(h.alice, [{ remoteId: "UC-woodbark", label: "Renamed channel", credentials: { accessToken: "new" } }]);
  assert.equal(reconnected.id, first.id);
  assert.equal(reconnected.createdAt, first.createdAt);
  assert.equal(reconnected.label, "Renamed channel");
  assert.equal(h.store.list("account").length, 1);
  assert.equal(h.vault.decrypt(h.store.get("account", first.id).encryptedCredentials, `account:${first.id}`).accessToken, "new");
  assert.deepEqual(h.store.get("post", "post").accountIds, [first.id]);
  assert.equal(h.store.get("delivery", "delivery").externalId, "video");
});

test("uniqueness belongs to the Meadow user, not the workspace or all Meadow users", t => {
  const h = fixture(t), [alice] = h.attach(h.alice, [{ remoteId: "UC-shared" }]);
  assert.throws(() => h.attach(h.other, [{ remoteId: "UC-shared" }]), error => error.status === 409 && error.code === "account_already_connected");
  const [bob] = h.attach(h.bob, [{ remoteId: "UC-shared" }]);
  assert.notEqual(alice.id, bob.id);
  assert.equal(h.service.list("alice", h.other.id).length, 0);
  assert.equal(h.service.list("bob", h.bob.id).length, 1);
  assert.equal(h.store.get("account", alice.id).projectId, h.alice.id);
});

test("different channels sharing a name and IDs on different platforms stay independent", t => {
  const h = fixture(t);
  h.attach(h.alice, [{ remoteId: "one", label: "Woodbark" }, { remoteId: "two", label: "Woodbark" }]);
  h.attach(h.alice, [{ remoteId: "one", label: "Woodbark" }], "x");
  assert.equal(h.service.list("alice", h.alice.id).length, 3);
});

test("repeated candidates and overlapping OAuth callbacks cannot create duplicates", async t => {
  const h = fixture(t);
  const results = h.attach(h.alice, [{ remoteId: "UC-repeated" }, { remoteId: "UC-repeated" }]);
  assert.equal(results.length, 1);
  const connected = await Promise.all([h.callback(h.alice, "UC-concurrent"), h.callback(h.alice, "UC-concurrent")]);
  assert.equal(connected[0].accounts[0].id, connected[1].accounts[0].id);
  const acrossWorkspaces = await Promise.allSettled([h.callback(h.alice, "UC-race"), h.callback(h.other, "UC-race")]);
  assert.equal(acrossWorkspaces.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(acrossWorkspaces.find(result => result.status === "rejected").reason.code, "account_already_connected");
  assert.equal(h.store.list("account").length, 3);
});

test("an account-selection batch rolls back if one channel belongs to another workspace", t => {
  const h = fixture(t);
  h.attach(h.alice, [{ remoteId: "UC-existing" }]);
  const id = h.pending(h.other, [{ remoteId: "UC-new" }, { remoteId: "UC-existing" }]);
  assert.throws(() => h.service.attach("alice", h.other.id, id, ["UC-new", "UC-existing"]), error => error.code === "account_already_connected");
  assert.equal(h.store.list("account").length, 1);
  assert.ok(h.store.get("connection", id), "selection can be corrected after the conflict");
});

test("removed account records do not reserve a channel or get resurrected", t => {
  const h = fixture(t);
  for (const status of ["deleting", "disconnected"]) {
    const [old] = h.attach(h.alice, [{ remoteId: status }]);
    h.store.put("account", { ...h.store.get("account", old.id), status });
    const [fresh] = h.attach(h.other, [{ remoteId: status }]);
    assert.notEqual(fresh.id, old.id);
    assert.equal(h.store.get("account", old.id).status, status);
  }
});

test("TikTok union identity blocks duplicate app-specific IDs without merging credentials", async t => {
  const h = fixture(t), identityKey = "tiktok:union:person";
  const [sandbox] = h.attach(h.alice, [{ remoteId: "sandbox-id", identityKey, credentials: { accessToken: "sandbox" } }], "tiktok");
  assert.equal(sandbox.identityKey, undefined, "cross-app IDs stay out of public account responses");
  assert.throws(() => h.attach(h.alice, [{ remoteId: "production-id", identityKey }], "tiktok"), error => error.code === "account_already_connected");
  h.attach(h.bob, [{ remoteId: "production-id", identityKey }], "tiktok");
  assert.equal(h.store.list("account", { ownerUid: "alice" }).length, 1);
  assert.equal(h.vault.decrypt(h.store.get("account", sandbox.id).encryptedCredentials, `account:${sandbox.id}`).accessToken, "sandbox");
  const id = h.pending(h.alice, [{ remoteId: "another-id", identityKey }], "tiktok");
  assert.equal((await h.service.pending("alice", h.alice.id, id)).candidates[0].identityKey, undefined);
});

test("a TikTok callback verifies a historical grant before rejecting a duplicate", async t => {
  const h = fixture(t), identityKey = "tiktok:union:person", calls = [];
  const [old] = h.attach(h.alice, [{ remoteId: "sandbox-id", credentials: { accessToken: "sandbox-id" } }], "tiktok");
  h.provider.accounts = async tokens => { calls.push(tokens.accessToken); return [{ remoteId: tokens.accessToken, identityKey, label: "Creator" }]; };
  await assert.rejects(h.callback(h.alice, "production-id", "tiktok"), error => error.code === "account_already_connected");
  assert.deepEqual(calls, ["production-id", "sandbox-id"]);
  assert.equal(h.store.get("account", old.id).identityKey, identityKey);
  assert.equal(h.store.list("account").length, 1);
});

test("failed historical identity verification cannot silently allow another TikTok connection", async t => {
  const h = fixture(t);
  h.attach(h.alice, [{ remoteId: "old", credentials: { accessToken: "old" } }], "tiktok");
  h.provider.accounts = async tokens => {
    if (tokens.accessToken === "old") throw new Error("Provider unavailable");
    return [{ remoteId: tokens.accessToken, identityKey: "tiktok:union:person" }];
  };
  await assert.rejects(h.callback(h.alice, "new", "tiktok"), error => error.code === "account_identity_unavailable");
  assert.equal(h.store.list("account").length, 1);
});

test("identity lookup cannot overwrite a concurrent reconnect", async t => {
  const h = fixture(t), [old] = h.attach(h.alice, [{ remoteId: "old", credentials: { accessToken: "old" } }], "tiktok");
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  h.provider.accounts = async () => { entered(); await new Promise(resolve => { release = resolve; }); return [{ remoteId: "old", identityKey: "tiktok:union:old" }]; };
  const pending = h.service.prepareIdentities("alice", "tiktok", [{ remoteId: "new", identityKey: "tiktok:union:new" }]);
  await started;
  h.store.put("account", { ...h.store.get("account", old.id), authorizationId: "new-grant", label: "New grant" });
  release();
  await assert.rejects(pending, error => error.code === "account_identity_unavailable");
  assert.equal(h.store.get("account", old.id).label, "New grant");
  assert.equal(h.store.get("account", old.id).identityKey, undefined);
});

test("simultaneous Zernio connections in an owner's workspaces create one provider profile", async t => {
  const h = fixture(t), provider = new (withZernio(TikTokProvider))({ store: h.store, locks: new LockService(h.store) });
  let creates = 0;
  provider.zernio = async (path, options) => {
    await Promise.resolve();
    return options?.method === "POST" ? { profile: { _id: `profile-${++creates}` } } : { profiles: [] };
  };
  const ids = await Promise.all([provider.zernioProfile("alice", h.alice.id), provider.zernioProfile("alice", h.other.id)]);
  assert.deepEqual(ids, ["profile-1", "profile-1"]);
  assert.equal(creates, 1);
  assert.equal(await provider.zernioProfile("bob", h.bob.id), "profile-2");
});
