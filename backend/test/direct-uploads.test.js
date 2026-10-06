import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { DurableMediaStorage } from "../src/bridge/storage/DurableMediaStorage.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
const md5 = bytes => createHash("md5").update(bytes).digest("hex");

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-direct-upload-"));
  const objects = new Map(), uploads = new Map(), requests = [];
  let now = Date.now(), loseCompletion = false, storageDown = false, flushes = 0;
  const store = new SqliteStore();
  store.flush = async () => { flushes++; };
  const storage = new DurableMediaStorage(path.join(dir, "media"), { fetcher: async (url, options = {}) => {
    const pathname = new URL(url).pathname, key = decodeURIComponent(pathname.split("/")[2]), method = options.method || "GET";
    requests.push({ pathname, method });
    if (storageDown) return Response.json({ error: "Unavailable", code: "media_storage_unavailable" }, { status: 503 });
    if (pathname.startsWith("/uploads/")) {
      const input = JSON.parse(options.body);
      if (input.action === "create") {
        assert.ok(store.list("media_upload").some(item => item.key === key), "The owner manifest precedes R2 creation");
        assert.ok(flushes > 0);
        const uploadId = randomUUID();
        uploads.set(uploadId, { key, bytes: input.bytes, parts: new Map(), active: true });
        return Response.json({ uploadId, partSize: input.partSize, expiresAt: input.expiresAt, parts: Array.from({ length: Math.ceil(input.bytes / input.partSize) }, (_, index) => ({ partNumber: index + 1, url: `https://fixture.r2.cloudflarestorage.com/media/${key}?uploadId=${uploadId}&partNumber=${index + 1}`, bytes: Math.min(input.partSize, input.bytes - index * input.partSize) })) });
      }
      const upload = uploads.get(input.uploadId);
      if (input.action === "abort") { if (upload) upload.active = false; return Response.json({ aborted: true }); }
      if (!objects.has(key)) {
        if (!upload?.active) return Response.json({ error: "Upload is not active", code: "upload_invalid" }, { status: 409 });
        const chunks = input.parts.map(part => {
          const bytes = upload.parts.get(part.partNumber);
          assert.ok(bytes); assert.equal(md5(bytes), part.etag);
          return bytes;
        });
        const bytes = Buffer.concat(chunks);
        if (bytes.length !== input.bytes) return Response.json({ error: "Wrong byte count", code: "upload_size_mismatch" }, { status: 409 });
        objects.set(key, bytes); upload.active = false;
      }
      if (loseCompletion) { loseCompletion = false; throw new TypeError("Response lost after R2 committed"); }
      return Response.json({ key, bytes: objects.get(key).length });
    }
    if (method === "DELETE") { objects.delete(key); return new Response(null, { status: 204 }); }
    if (method === "PUT") { assert.fail("Direct originals must never be uploaded again through the backend"); }
    const bytes = objects.get(key);
    return bytes ? new Response(bytes, { headers: { "Content-Length": String(bytes.length) } }) : new Response(null, { status: 404 });
  } });
  const application = new BridgeApplication({ store, storage, clock: () => now,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_MEDIA_SIGNING_KEY: "fixture", BRIDGE_PUBLISHING_ENABLED: "false", BRIDGE_DIRECT_UPLOADS_ENABLED: "true" },
    authMiddleware: (req, res, next) => {
      const uid = /^Bearer (alice|bob)$/.exec(req.headers.authorization || "")?.[1];
      if (!uid) return res.status(401).json({ error: "Sign in required", code: "authentication_required" });
      req.uid = uid; next();
    }, deleteIdentity: async () => {}, deleteAnalytics: async () => true,
  });
  const server = await new Promise(resolve => { const s = application.app.listen(0, "127.0.0.1", () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); application.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const project = application.projects.create("alice", { name: "Alice", timeZone: "UTC" });
  const other = application.projects.create("bob", { name: "Bob", timeZone: "UTC" });
  const root = `/projects/${project.id}`, base = `http://127.0.0.1:${server.address().port}/api/bridge`;
  const request = (endpoint, { method = "GET", token = "alice", body } = {}) => fetch(base + endpoint, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  async function create(bytes = pdf.length) {
    const res = await request(`${root}/media/uploads`, { method: "POST", body: { direct: true, bytes, filename: "document.pdf", contentType: "application/pdf" } });
    assert.equal(res.status, 201); assert.equal(res.headers.get("cache-control"), "no-store");
    return res.json();
  }
  function send(ticket, bytes = pdf) {
    const session = store.get("media_upload", ticket.id), upload = uploads.get(session.uploadId);
    return ticket.parts.map(part => {
      const chunk = bytes.subarray((part.partNumber - 1) * ticket.partSize, (part.partNumber - 1) * ticket.partSize + part.bytes);
      upload.parts.set(part.partNumber, chunk);
      return { partNumber: part.partNumber, etag: `"${md5(chunk)}"` };
    });
  }
  const complete = (ticket, parts, options = {}) => request(`${root}/media/uploads/${ticket.id}/complete`, { method: "POST", body: { parts }, ...options });
  return { application, root, other, request, create, send, complete, store, storage, objects, uploads, requests, dir, advance: duration => { now += duration; }, loseCompletion: () => { loseCompletion = true; }, storageDown: value => { storageDown = value; } };
}

test("direct uploads keep original bytes in R2, validate them, and finish idempotently", async t => {
  const h = await setup(t), ticket = await h.create();
  assert.equal(ticket.mode, "r2-multipart");
  assert.equal(ticket.parts[0].bytes, pdf.length);
  assert.equal(h.store.list("media").length, 0, "An authorized upload is not ready media");
  const parts = h.send(ticket);
  const response = await h.complete(ticket, parts);
  assert.equal(response.status, 201);
  const { media } = await response.json();
  assert.equal(media.id, ticket.id); assert.equal(media.status, "ready");
  assert.equal(media.mime, "application/pdf"); assert.equal(media.bytes, pdf.length);
  assert.equal(media.storageKey, undefined);
  assert.equal(h.objects.size, 1); assert.equal(h.store.list("media").length, 1);
  const reads = h.requests.filter(item => item.method === "GET").length;
  assert.equal((await h.complete(ticket, parts)).status, 201);
  assert.equal(h.requests.filter(item => item.method === "GET").length, reads, "An acknowledgement retry does not reprocess media");
  assert.equal(h.store.list("media").length, 1);
  assert.deepEqual(fs.readdirSync(path.join(h.dir, "incoming")), []);
  h.advance(25 * 3600000); await h.application.directUploads.prune();
  assert.equal(h.store.list("media_upload").length, 0);
  assert.equal(h.objects.size, 1, "Expired upload receipts never remove finished media");
});

test("part grants support large files while authorization stays metadata-only", async t => {
  const h = await setup(t), ticket = await h.create(150 * 1024 ** 2);
  assert.equal(ticket.parts.length, 5);
  assert.equal(ticket.parts.reduce((total, part) => total + part.bytes, 0), 150 * 1024 ** 2);
  assert.equal(h.objects.size, 0);
  for (const part of ticket.parts) assert.match(part.url, /^https:\/\/fixture\.r2\.cloudflarestorage\.com\//);
  assert.equal((await h.request(`${h.root}/media/uploads`, { method: "POST", body: { direct: true, filename: "large.mp4", bytes: 1024 ** 3 + 1 } })).status, 400);
});

test("upload authorization and completion are bound to their owner and project", async t => {
  const h = await setup(t), ticket = await h.create(), parts = h.send(ticket);
  assert.equal((await h.request(`${h.root}/media/uploads`, { method: "POST", token: null, body: { direct: true, bytes: pdf.length, filename: "file.pdf" } })).status, 401);
  assert.equal((await h.complete(ticket, parts, { token: "bob" })).status, 404);
  assert.equal((await h.request(`/projects/${h.other.id}/media/uploads/${ticket.id}/complete`, { method: "POST", token: "bob", body: { parts } })).status, 404);
  assert.equal((await h.complete(ticket, parts, { token: "meadow_upload_invalid" })).status, 401);
  assert.equal((await h.complete(ticket, [])).status, 400);
  assert.equal((await h.complete(ticket, [{ partNumber: 2, etag: parts[0].etag }])).status, 400);
  assert.equal(h.objects.size, 0);
  assert.equal((await h.complete(ticket, parts)).status, 201);
});

test("a lost completion response recovers the same immutable R2 original", async t => {
  const h = await setup(t), ticket = await h.create(), parts = h.send(ticket);
  h.loseCompletion();
  assert.equal((await h.complete(ticket, parts)).status, 503);
  assert.equal(h.objects.size, 1);
  assert.equal(h.store.get("media_upload", ticket.id).status, "completing");
  assert.equal((await h.complete(ticket, [{ partNumber: 1, etag: "0".repeat(32) }])).status, 409);
  assert.equal((await h.complete(ticket, parts)).status, 201);
  assert.equal(h.objects.size, 1);
  assert.equal(h.store.list("media").length, 1);
});

test("unsupported file contents and size mismatches are removed instead of becoming media", async t => {
  const h = await setup(t);
  for (const bytes of [Buffer.from("not a PDF"), pdf.subarray(0, pdf.length - 1)]) {
    const ticket = await h.create(bytes === pdf ? pdf.length : bytes.length + (bytes[0] === 37 ? 1 : 0));
    const response = await h.complete(ticket, h.send(ticket, bytes));
    assert.ok([409, 415].includes(response.status));
    assert.equal(h.store.list("media").length, 0);
    assert.equal(h.objects.size, 0);
    assert.equal(h.store.list("media_upload").length, 0);
  }
});

test("cancellation and expiration abort R2 uploads and retry failed cleanup", async t => {
  const h = await setup(t), ticket = await h.create(); h.send(ticket);
  h.storageDown(true);
  assert.equal((await h.request(`${h.root}/media/uploads/${ticket.id}`, { method: "DELETE" })).status, 503);
  assert.equal(h.store.get("media_upload", ticket.id).status, "cancelled");
  h.storageDown(false); await h.application.directUploads.prune();
  assert.equal(h.store.list("media_upload").length, 0);
  assert.ok([...h.uploads.values()].every(item => !item.active));
  const expired = await h.create(), parts = h.send(expired);
  h.advance(31 * 60000);
  assert.equal((await h.complete(expired, parts)).status, 410);
  await h.application.directUploads.prune();
  assert.equal(h.store.list("media_upload").length, 0);
  assert.ok([...h.uploads.values()].every(item => !item.active));
});

test("cleanup does not race active completion or remove already-ready media", async t => {
  const h = await setup(t), ticket = await h.create(), parts = h.send(ticket);
  h.advance(31 * 60000);
  await h.application.directUploads.prune(new Map([["alice", 1]]));
  assert.ok(h.store.get("media_upload", ticket.id));
  h.advance(-31 * 60000);
  assert.equal((await h.complete(ticket, parts)).status, 201);
  const response = await h.request(`${h.root}/media/uploads/${ticket.id}`, { method: "DELETE" });
  assert.deepEqual(await response.json(), { cancelled: false });
  assert.equal(h.objects.size, 1);
});

test("account deletion blocks finalization and aborts pending uploads before removing ownership", async t => {
  const h = await setup(t), ticket = await h.create(), parts = h.send(ticket);
  const result = h.application.privacy.requestAccount("alice", { confirmation: "DELETE" });
  assert.equal((await h.complete(ticket, parts)).status, 410);
  await h.application.privacy.process(h.store.get("erasure", result.deletion.reference));
  assert.equal(h.store.list("media_upload").length, 0);
  assert.ok([...h.uploads.values()].every(item => !item.active));
  assert.equal(h.objects.size, 0);
});
