import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { LinkedInProvider } from "../src/bridge/platforms/LinkedInProvider.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";

// Regression: refreshing analytics for a published LinkedIn post used to call an
// endpoint Meadow may not read, and LinkedIn's 403 marked the account for
// reconnection. Each reconnect lasted only until the next analytics refresh.
function setup(t, respond) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-linkedin-"));
  const calls = [];
  const transport = new HttpTransport({ fetcher: async (url, options) => { calls.push({ url, method: options.method }); return respond(url, options); } });
  const app = new BridgeApplication({
    store: new SqliteStore(),
    registry: new ProviderRegistry([new LinkedInProvider({ transport, env: { LINKEDIN_CLIENT_ID: "client", LINKEDIN_CLIENT_SECRET: "secret" } })]),
    env: { BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_PUBLIC_URL: "https://bridge.example", BRIDGE_APP_URL: "https://bridge.example", BRIDGE_PUBLISHING_ENABLED: "false" },
  });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const project = app.projects.create("alice", { name: "LinkedIn", timeZone: "UTC" });
  const connect = (id, remoteId) => app.store.put("account", { id, ownerUid: "alice", projectId: project.id, platform: "linkedin", remoteId, label: id, rateKey: `linkedin:${id}`, status: "connected", authorizationId: `grant-${id}`, encryptedCredentials: app.vault.encrypt({ accessToken: `token-${id}`, expiresAt: Date.now() + 50 * 86400000 }, `account:${id}`) });
  const published = (id, accountId) => app.store.put("delivery", { id, projectId: project.id, ownerUid: "alice", postId: `post-${id}`, accountId, platform: "linkedin", status: "published", externalId: "urn:li:share:5", requestedAt: Date.now(), dueAt: Date.now() });
  return { app, calls, connect, published };
}

test("refreshing LinkedIn analytics keeps the account connected", async t => {
  const h = setup(t, () => Response.json({ status: 403, serviceErrorCode: 100, code: "ACCESS_DENIED", message: "Not enough permissions" }, { status: 403 }));
  h.connect("member", "urn:li:person:member");
  h.connect("company", "urn:li:organization:company");
  h.published("member-post", "member");
  h.published("company-post", "company");

  await h.app.analytics.tick();

  for (const id of ["member", "company"]) {
    const account = h.app.store.get("account", id);
    assert.equal(account.status, "connected", id);
    assert.equal(account.lastError ?? null, null, id);
  }
  // The member post is never requested; the organization read is refused but harmless.
  assert.deepEqual(h.calls.map(call => call.url.includes("organizationalEntityShareStatistics")), [true]);
  assert.match(h.app.store.get("delivery", "member-post").metricsNote, /approved partner apps/);
  assert.match(h.app.store.get("delivery", "company-post").metricsError, /does not let Meadow read this/);
});

test("an expired or revoked LinkedIn token still asks for reconnection", async t => {
  const h = setup(t, () => Response.json({ serviceErrorCode: 65601, code: "REVOKED_ACCESS_TOKEN", message: "The token used in the request has been revoked by the user" }, { status: 401 }));
  h.connect("company", "urn:li:organization:company");
  h.published("company-post", "company");
  await h.app.analytics.tick();
  assert.equal(h.app.store.get("account", "company").status, "reconnect_required");
});
