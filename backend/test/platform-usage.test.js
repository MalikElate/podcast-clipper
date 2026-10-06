import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { PlatformUsageService } from "../src/bridge/services/PlatformUsageService.js";

const provider = (id, name) => ({ id, capabilities: { id, name }, configured: true });

function setup(adminUids = "owner") {
  const store = new SqliteStore();
  const registry = new ProviderRegistry([provider("tiktok", "TikTok"), provider("youtube", "YouTube"), provider("x", "X")]);
  const usage = new PlatformUsageService({ store, registry, adminUids, clock: () => 1000 });
  const account = (id, ownerUid, platform, status = "connected") => store.put("account", { id, ownerUid, projectId: `${ownerUid}-project`, platform, status, label: `secret label ${id}` });
  const delivery = (id, ownerUid, platform, status = "published") => store.put("delivery", { id, ownerUid, projectId: `${ownerUid}-project`, platform, status, accountId: "a", url: `https://example.com/${id}` });
  return { store, usage, account, delivery };
}

test("platform usage counts connected accounts and published posts across every Meadow user", t => {
  const h = setup(" owner , second-admin ");
  t.after(() => h.store.close());
  h.account("a1", "alice", "tiktok"); h.account("a2", "bob", "tiktok"); h.account("a3", "bob", "youtube");
  h.account("a4", "carol", "tiktok", "reconnect_required"); h.account("a5", "carol", "youtube", "disconnected");
  h.account("a6", "dave", "pinterest");
  h.delivery("d1", "alice", "tiktok"); h.delivery("d2", "bob", "tiktok"); h.delivery("d3", "bob", "youtube");
  h.delivery("d4", "bob", "youtube", "failed"); h.delivery("d5", "carol", "tiktok", "scheduled");
  h.delivery("d6", "erin", "linkedin");

  const report = h.usage.report("second-admin");
  assert.equal(report.generatedAt, 1000);
  assert.deepEqual(report.totals, { connectedAccounts: 4, publishedPosts: 4 });
  assert.deepEqual(report.platforms, [
    { platform: "tiktok", name: "TikTok", connectedAccounts: 2, publishedPosts: 2 },
    { platform: "youtube", name: "YouTube", connectedAccounts: 1, publishedPosts: 1 },
    { platform: "x", name: "X", connectedAccounts: 0, publishedPosts: 0 },
    // Platforms no longer enabled still report their existing accounts and posts.
    { platform: "pinterest", name: "pinterest", connectedAccounts: 1, publishedPosts: 0 },
    { platform: "linkedin", name: "linkedin", connectedAccounts: 0, publishedPosts: 1 },
  ]);
  const serialized = JSON.stringify(report);
  for (const leak of ["alice", "bob", "secret label", "example.com"]) assert.ok(!serialized.includes(leak), `${leak} must not appear in the report`);
});

test("platform usage is limited to configured administrators", t => {
  for (const adminUids of ["owner", "", undefined]) {
    const h = setup(adminUids);
    t.after(() => h.store.close());
    assert.throws(() => h.usage.report("alice"), error => error.status === 403 && error.code === "admin_required");
    assert.throws(() => h.usage.report(""), error => error.status === 403);
  }
});
