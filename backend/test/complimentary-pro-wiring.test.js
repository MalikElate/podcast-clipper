import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { connectionDisclosure } from "../src/bridge/platforms/connectionPrivacy.js";

test("BridgeApplication wires the runtime grant into billing routes and account entitlement", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-complimentary-pro-"));
  const uid = "user_Grantee", now = Date.now();
  const application = new BridgeApplication({
    store: new SqliteStore(), clock: () => now,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_PUBLISHING_ENABLED: "false", BRIDGE_COMPLIMENTARY_PRO_UIDS: uid },
    authMiddleware: (req, _res, next) => { req.uid = uid; next(); },
  });
  t.after(() => { application.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const project = application.projects.create(uid, { name: "Fixture" });
  const connectionId = randomUUID(), disclosure = connectionDisclosure("x");
  application.store.put("connection", { id: connectionId, ownerUid: uid, projectId: project.id, platform: "x",
    countryCode: "CM", createdAt: now, expiresAt: now + 60000,
    privacyConsent: disclosure ? { accepted: true, platform: "x", version: disclosure.version } : null,
    encrypted: application.vault.encrypt(["one", "two", "three"].map(remoteId => ({ remoteId, label: remoteId, credentials: { accessToken: "test-only" } })), `connection:${connectionId}`) });
  assert.equal(application.accounts.attach(uid, project.id, connectionId, ["one", "two", "three"]).length, 3);
  const server = await new Promise(resolve => { const server = application.app.listen(0, "127.0.0.1", () => resolve(server)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(`${base}/api/bridge/billing`);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).source, "complimentary");
  const checkout = await fetch(`${base}/api/bridge/billing/checkout`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: "pro", cycle: "monthly" }),
  });
  assert.equal(checkout.status, 409);
  assert.equal((await checkout.json()).code, "complimentary_access");
  assert.equal(application.store.get("billing", uid), null);
});
