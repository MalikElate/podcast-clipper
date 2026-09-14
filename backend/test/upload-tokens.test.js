import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-upload-token-"));
  let now = Date.now(), sessionChecks = 0;
  const application = new BridgeApplication({
    store: new SqliteStore(), clock: () => now,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_PUBLISHING_ENABLED: "false", BRIDGE_MAX_UPLOAD_MB: "1" },
    authMiddleware: (req, res, next) => {
      sessionChecks++;
      const uid = /^Bearer (alice|bob)$/.exec(req.headers.authorization || "")?.[1] || /^session=(alice|bob)$/.exec(req.headers.cookie || "")?.[1];
      if (!uid) return res.status(401).json({ error: "Sign in required" });
      req.uid = uid; next();
    },
  });
  const server = await new Promise(resolve => { const server = application.app.listen(0, "127.0.0.1", () => resolve(server)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); application.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/bridge`;
  const project = application.projects.create("alice", { name: "Alice", timeZone: "UTC" });
  const other = application.projects.create("bob", { name: "Bob", timeZone: "UTC" });
  const root = `/projects/${project.id}`;
  async function request(endpoint, { method = "GET", token = "alice", body, cookie } = {}) {
    const form = body instanceof FormData;
    return fetch(base + endpoint, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !form ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: form ? body : JSON.stringify(body) } : {}) });
  }
  async function issue(bytes = pdf.length) {
    const response = await request(`${root}/media/uploads`, { method: "POST", body: { bytes } });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("cache-control"), "no-store");
    return response.json();
  }
  function upload(token, { bytes = pdf, endpoint = `${root}/media`, cookie } = {}) {
    const body = new FormData(); body.set("file", new Blob([bytes], { type: "application/pdf" }), "document.pdf");
    return request(endpoint, { method: "POST", token, body, cookie });
  }
  return { application, root, other, request, issue, upload, dir, clock: () => now, advance: value => { now += value; }, sessionChecks: () => sessionChecks };
}

test("upload grants require an authenticated project owner and a valid declared size", async t => {
  const h = await setup(t);
  assert.equal((await h.request(`${h.root}/media/uploads`, { method: "POST", token: null, body: { bytes: pdf.length } })).status, 401);
  assert.equal((await h.request(`${h.root}/media/uploads`, { method: "POST", token: "bob", body: { bytes: pdf.length } })).status, 404);
  for (const bytes of [0, -1, 1.5, "100", 1024 ** 2 + 1, null]) {
    const response = await h.request(`${h.root}/media/uploads`, { method: "POST", body: { bytes } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "upload_size_invalid");
  }
  const ticket = await h.issue();
  assert.match(ticket.uploadToken, /^meadow_upload_[A-Za-z0-9_-]{43}$/);
  assert.equal(ticket.expiresAt, h.clock() + 30 * 60000);
  const rows = h.application.store.db.prepare("SELECT * FROM one_time_states").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, createHash("sha256").update(ticket.uploadToken).digest("hex"));
  assert.equal(JSON.stringify(rows).includes(ticket.uploadToken), false);
});

test("upload grants work without a session and atomically admit only one upload", async t => {
  const h = await setup(t), ticket = await h.issue(), before = h.sessionChecks();
  const responses = await Promise.all([h.upload(ticket.uploadToken, { cookie: "session=bob" }), h.upload(ticket.uploadToken)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 401]);
  assert.equal(h.sessionChecks(), before);
  const media = (await responses.find(response => response.status === 201).json()).media;
  assert.equal(media.ownerUid, "alice");
  assert.equal(media.bytes, pdf.length);
  assert.equal(h.application.store.list("media").length, 1);
  assert.equal((await responses.find(response => response.status === 401).json()).code, "invalid_upload_token");
  assert.deepEqual(fs.readdirSync(path.join(h.dir, "incoming")), []);
});

test("upload grants cannot authenticate other paths or methods and never fall back to cookies", async t => {
  const h = await setup(t);
  const cases = [
    ["GET", `${h.root}/media`], ["DELETE", `${h.root}/media`], ["POST", `${h.root}/media/`],
    ["POST", "/api-keys"], ["GET", "/config"], ["DELETE", "/privacy/account"],
    ["POST", `${h.root}/media/uploads`], ["POST", `/projects/${h.other.id}/media`],
  ];
  for (const [method, endpoint] of cases) {
    const ticket = await h.issue(), before = h.sessionChecks();
    const response = await h.request(endpoint, { method, token: ticket.uploadToken, cookie: "session=alice" });
    assert.equal(response.status, 401, `${method} ${endpoint}`);
    assert.equal((await response.json()).code, "invalid_upload_token");
    assert.equal(h.sessionChecks(), before);
  }
  const before = h.sessionChecks();
  const malformed = await h.upload("meadow_upload_invalid", { cookie: "session=alice" });
  assert.equal(malformed.status, 401);
  assert.equal(h.sessionChecks(), before);
  assert.equal(h.application.store.list("media").length, 0);
});

test("upload grants survive a buffered upload delay but expire after thirty minutes", async t => {
  const h = await setup(t), ticket = await h.issue();
  // Simulate the proxy receiving a slow request after the 60-second session JWT expires.
  h.advance(171000);
  assert.equal((await h.upload(ticket.uploadToken)).status, 201);
  const expired = await h.issue();
  h.advance(30 * 60000);
  const rejected = await h.upload(expired.uploadToken, { cookie: "session=alice" });
  assert.equal(rejected.status, 401);
  assert.equal((await rejected.json()).code, "invalid_upload_token");
  assert.equal(h.application.store.list("media").length, 1);
});

test("upload grants enforce declared bytes and remove rejected temporary files", async t => {
  const h = await setup(t);
  const short = await h.issue(pdf.length + 1);
  const shortResponse = await h.upload(short.uploadToken);
  assert.equal(shortResponse.status, 400);
  assert.equal((await shortResponse.json()).code, "upload_size_mismatch");
  const large = await h.issue(pdf.length - 1);
  const largeResponse = await h.upload(large.uploadToken);
  assert.equal(largeResponse.status, 413);
  assert.equal((await largeResponse.json()).code, "upload_limit");
  assert.equal(h.application.store.list("media").length, 0);
  assert.deepEqual(fs.readdirSync(path.join(h.dir, "incoming")), []);
  assert.equal((await h.upload(short.uploadToken)).status, 401);
});

test("account deletion immediately blocks upload grants and owner removal revokes them", async t => {
  const h = await setup(t), ticket = await h.issue();
  h.application.privacy.requestAccount("alice", { confirmation: "DELETE" });
  assert.equal((await h.upload(ticket.uploadToken)).status, 410);
  assert.equal((await h.request(`${h.root}/media/uploads`, { method: "POST", body: { bytes: pdf.length } })).status, 410);
  assert.equal(h.application.store.list("media").length, 0);

  const otherRoot = `/projects/${h.other.id}`;
  const otherTicketResponse = await h.request(`${otherRoot}/media/uploads`, { method: "POST", token: "bob", body: { bytes: pdf.length } });
  assert.equal(otherTicketResponse.status, 201);
  const otherTicket = await otherTicketResponse.json();
  h.application.store.removeOwner("bob");
  assert.equal((await h.upload(otherTicket.uploadToken, { endpoint: `${otherRoot}/media` })).status, 401);
  assert.deepEqual(fs.readdirSync(path.join(h.dir, "incoming")), []);
});
