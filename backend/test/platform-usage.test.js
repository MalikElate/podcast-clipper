import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { PlatformUsageService, clerkUserDirectory } from "../src/bridge/services/PlatformUsageService.js";

const provider = (id, name) => ({ id, capabilities: { id, name }, configured: true });
const person = (uid, signedUpAt) => ({ uid, email: `${uid}@example.com`, name: uid.toUpperCase(), signedUpAt, lastActiveAt: signedUpAt + 1 });

function setup({ adminUids = "owner", listUsers } = {}) {
  const store = new SqliteStore();
  const registry = new ProviderRegistry([provider("tiktok", "TikTok"), provider("youtube", "YouTube"), provider("x", "X")]);
  const usage = new PlatformUsageService({ store, registry, adminUids, listUsers, clock: () => 1000 });
  const account = (id, ownerUid, platform, status = "connected") => store.put("account", { id, ownerUid, projectId: `${ownerUid}-project`, platform, status, label: `secret label ${id}` });
  const delivery = (id, ownerUid, platform, status = "published") => store.put("delivery", { id, ownerUid, projectId: `${ownerUid}-project`, platform, status, accountId: "a", url: `https://social.example/${id}` });
  return { store, usage, account, delivery };
}

test("platform usage counts connected accounts and published posts per platform and per user", async t => {
  const h = setup({ adminUids: " owner , second-admin ", listUsers: async () => [person("carol", 300), person("bob", 200), person("alice", 100), person("quiet", 400)] });
  t.after(() => h.store.close());
  h.account("a1", "alice", "tiktok"); h.account("a2", "bob", "tiktok"); h.account("a3", "bob", "youtube");
  h.account("a4", "carol", "tiktok", "reconnect_required"); h.account("a5", "carol", "youtube", "disconnected");
  h.account("a6", "dave", "pinterest");
  h.delivery("d1", "alice", "tiktok"); h.delivery("d2", "bob", "tiktok"); h.delivery("d3", "bob", "youtube"); h.delivery("d7", "bob", "youtube");
  h.delivery("d4", "bob", "youtube", "failed"); h.delivery("d5", "carol", "tiktok", "scheduled");

  const report = await h.usage.report("second-admin");
  assert.equal(report.generatedAt, 1000);
  assert.equal(report.identitiesAvailable, true);
  assert.deepEqual(report.totals, { users: 5, connectedAccounts: 4, publishedPosts: 4 });
  assert.deepEqual(report.platforms, [
    { platform: "tiktok", name: "TikTok", connectedAccounts: 2, publishedPosts: 2 },
    { platform: "youtube", name: "YouTube", connectedAccounts: 1, publishedPosts: 2 },
    { platform: "x", name: "X", connectedAccounts: 0, publishedPosts: 0 },
    // Platforms no longer enabled still report their existing accounts and posts.
    { platform: "pinterest", name: "pinterest", connectedAccounts: 1, publishedPosts: 0 },
  ]);
  // Busiest first; people with nothing connected stay listed, newest first.
  assert.deepEqual(report.users.map(user => [user.uid, user.connectedAccounts, user.publishedPosts]), [
    ["bob", 2, 3], ["alice", 1, 1], ["dave", 1, 0], ["quiet", 0, 0], ["carol", 0, 0],
  ]);
  const bob = report.users[0];
  assert.equal(bob.email, "bob@example.com"); assert.equal(bob.name, "BOB"); assert.equal(bob.signedUpAt, 200);
  assert.deepEqual(bob.platforms, [
    { platform: "youtube", name: "YouTube", connectedAccounts: 1, publishedPosts: 2 },
    { platform: "tiktok", name: "TikTok", connectedAccounts: 1, publishedPosts: 1 },
  ]);
  // Data whose owner is no longer in Clerk is still counted, without an identity.
  assert.deepEqual(report.users[2], { uid: "dave", email: null, name: null, signedUpAt: null, lastActiveAt: null, connectedAccounts: 1, publishedPosts: 0, platforms: [{ platform: "pinterest", name: "pinterest", connectedAccounts: 1, publishedPosts: 0 }] });
  const serialized = JSON.stringify(report);
  for (const leak of ["secret label", "social.example"]) assert.ok(!serialized.includes(leak), `${leak} must not appear in the report`);
});

test("platform usage still reports counts when the user directory is unavailable", async t => {
  const h = setup({ listUsers: async () => { throw Object.assign(new Error("Clerk is down"), { code: "clerk_unavailable" }); } });
  t.after(() => h.store.close());
  h.account("a1", "alice", "tiktok"); h.delivery("d1", "alice", "tiktok");
  const report = await h.usage.report("owner");
  assert.equal(report.identitiesAvailable, false);
  assert.deepEqual(report.users.map(user => [user.uid, user.email, user.connectedAccounts, user.publishedPosts]), [["alice", null, 1, 1]]);
});

test("platform usage is limited to configured administrators", async t => {
  for (const adminUids of ["owner", "", undefined]) {
    const h = setup({ adminUids, listUsers: async () => assert.fail("non-admins must not reach the user directory") });
    t.after(() => h.store.close());
    await assert.rejects(h.usage.report("alice"), error => error.status === 403 && error.code === "admin_required");
    await assert.rejects(h.usage.report(""), error => error.status === 403);
  }
});

test("the Clerk directory pages through every user and keeps only sign-in details", async () => {
  const calls = [];
  const user = index => ({ id: `user_${index}`, firstName: index % 2 ? "Ada" : null, lastName: index % 2 ? "Lovelace" : null, createdAt: index, lastActiveAt: null,
    primaryEmailAddress: index === 0 ? null : { emailAddress: `primary${index}@example.com` }, emailAddresses: [{ emailAddress: `first${index}@example.com` }], privateMetadata: { secret: true } });
  const clerk = { users: { getUserList: async params => { calls.push(params); return { data: Array.from({ length: params.offset ? 2 : 500 }, (_, i) => user(params.offset + i)) }; } } };
  const users = await clerkUserDirectory(clerk)();
  assert.deepEqual(calls, [{ limit: 500, offset: 0, orderBy: "-created_at" }, { limit: 500, offset: 500, orderBy: "-created_at" }]);
  assert.equal(users.length, 502);
  assert.deepEqual(users[0], { uid: "user_0", email: "first0@example.com", name: null, signedUpAt: 0, lastActiveAt: null });
  assert.deepEqual(users[1], { uid: "user_1", email: "primary1@example.com", name: "Ada Lovelace", signedUpAt: 1, lastActiveAt: null });
});
