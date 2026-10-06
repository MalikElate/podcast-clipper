import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { DurableMediaStorage } from "../src/bridge/storage/DurableMediaStorage.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
async function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-direct-upload-")), objects = new Map(), calls = [];
  let now = Date.now(), downloadsBlocked;
  const storage = new DurableMediaStorage(path.join(dir, "media"), { fetcher: async (url, options = {}) => {
    const pathname = new URL(url).pathname; calls.push({ pathname, method: options.method || "GET" });
    if (pathname === "/uploads") return Response.json({ uploadUrl: "https://test.r2.cloudflarestorage.com/staging", method: "PUT", expiresAt: now + 3600000 });
    const input = options.body && typeof options.body === "string" ? JSON.parse(options.body) : null;
    if (pathname === "/uploads/complete") {
      const data = objects.get(`staging:${input.key}`) || objects.get(input.key);
      if (!data) return Response.json({ error: "Upload incomplete", code: "upload_incomplete" }, { status: 409 });
      if (data.length !== input.bytes) return Response.json({ error: "Size mismatch", code: "upload_size_mismatch" }, { status: 400 });
      objects.set(input.key, data); objects.delete(`staging:${input.key}`); return Response.json({ saved: true });
    }
    const key = decodeURIComponent(pathname.slice("/media/".length));
    if (options.method === "DELETE") { objects.delete(key); objects.delete(`staging:${key}`); return new Response(null, { status: 204 }); }
    if (options.method === "PUT") {
      const chunks = []; for await (const chunk of options.body) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks)); return new Response(null, { status: 201 });
    }
    if (downloadsBlocked) await downloadsBlocked;
    const data = objects.get(key);
    return data ? new Response(data, { headers: { "Content-Length": String(data.length) } }) : new Response(null, { status: 404 });
  } });
  const application = new BridgeApplication({ store: new SqliteStore(), storage, clock: () => now,
    env: { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_MEDIA_SIGNING_KEY: "test-key", BRIDGE_PUBLISHING_ENABLED: "false", BRIDGE_MAX_UPLOAD_MB: "5115" },
    authMiddleware: (req, res, next) => { const uid = /^Bearer (alice|bob)$/.exec(req.headers.authorization || "")?.[1]; if (!uid) return res.status(401).json({ error: "Sign in required" }); req.uid = uid; next(); },
  });
  const project = application.projects.create("alice", { name: "Alice" }), other = application.projects.create("bob", { name: "Bob" });
  const server = await new Promise(resolve => { const server = application.app.listen(0, "127.0.0.1", () => resolve(server)); });
  t.after(async () => { await application.media.directProcessing; await new Promise(resolve => server.close(resolve)); application.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const root = `/projects/${project.id}`, base = `http://127.0.0.1:${server.address().port}/api/bridge`;
  const request = (endpoint, { method = "GET", token = "alice", body } = {}) => fetch(base + endpoint, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const issue = async (bytes = pdf.length, filename = "file.pdf") => { const response = await request(`${root}/media/uploads`, { method: "POST", body: { bytes, filename, direct: true } }); assert.equal(response.status, 201); return (await response.json()).directUpload; };
  const stage = (ticket, data = pdf) => { const record = application.store.get("media", ticket.mediaId); objects.set(`staging:${record.storageKey}`, data); return record; };
  const complete = ticket => request(`${root}/media/uploads/${ticket.mediaId}/complete`, { method: "POST", body: {} });
  return { application, storage, objects, calls, dir, root, project, other, request, issue, stage, complete, advance: ms => { now += ms; }, blockDownloads: promise => { downloadsBlocked = promise; } };
}

test("direct tickets, completion and status are restricted to the project owner", async t => {
  const h = await setup(t);
  for (const token of ["bob", null]) assert.equal((await h.request(`${h.root}/media/uploads`, { method: "POST", token, body: { bytes: pdf.length, direct: true } })).status, token ? 404 : 401);
  const ticket = await h.issue();
  for (const endpoint of [`${h.root}/media/${ticket.mediaId}`, `${h.root}/media/uploads/${ticket.mediaId}/complete`]) assert.equal((await h.request(endpoint, { token: "bob", ...(endpoint.endsWith("complete") ? { method: "POST", body: {} } : {}) })).status, 404);
  assert.equal((await h.request(`/projects/${h.other.id}/media/${ticket.mediaId}`, { token: "bob" })).status, 404);
  assert.deepEqual(h.application.media.list("alice", h.project.id), []);
  const publicRecord = (await (await h.request(`${h.root}/media/${ticket.mediaId}`)).json()).media;
  assert.equal(publicRecord.status, "uploading"); assert.equal(publicRecord.url, null); assert.equal(publicRecord.storageKey, undefined);
});

test("direct size cap admits files above 100 MB and rejects invalid or oversized grants", async t => {
  const h = await setup(t);
  await h.issue(120 * 1024 ** 2, "large.mp4");
  await h.issue(5115 * 1024 ** 2, "largest.mp4");
  for (const bytes of [0, -1, "100", 1.5, 5115 * 1024 ** 2 + 1]) assert.equal((await h.request(`${h.root}/media/uploads`, { method: "POST", body: { direct: true, bytes } })).status, 400);
});

test("completion verifies stored bytes and prepares the original without reuploading it", async t => {
  const h = await setup(t), ticket = await h.issue(), record = h.stage(ticket);
  const response = await h.complete(ticket);
  assert.equal(response.status, 202); assert.equal((await response.json()).media.status, "processing");
  await h.application.media.directProcessing;
  const media = (await (await h.request(`${h.root}/media/${ticket.mediaId}`)).json()).media;
  assert.equal(media.status, "ready"); assert.equal(media.mime, "application/pdf"); assert.equal(media.bytes, pdf.length);
  assert.match(media.url, /^\/media\//);
  assert.equal(h.calls.filter(call => call.method === "PUT").length, 0, "The original is already in R2");
  assert.deepEqual(h.objects.get(record.storageKey), pdf);
  assert.equal(fs.existsSync(h.storage.path(record.storageKey)), false, "Large originals do not occupy the working disk after preparation");
  await h.storage.ensure(record.storageKey);
  assert.deepEqual(fs.readFileSync(h.storage.path(record.storageKey)), pdf, "Publishing can restore the private R2 original lazily");
  assert.equal((await h.complete(ticket)).status, 200);
  assert.equal(h.calls.filter(call => call.pathname === "/uploads/complete").length, 1);
  assert.equal(h.application.media.list("alice", h.project.id).length, 1);
});

test("empty, incomplete and mismatched uploads never enter processing", async t => {
  const h = await setup(t), ticket = await h.issue();
  assert.equal((await h.complete(ticket)).status, 409);
  h.stage(ticket, Buffer.from("short"));
  assert.equal((await h.complete(ticket)).status, 400);
  assert.equal(h.application.store.get("media", ticket.mediaId).status, "uploading");
});

test("magic-byte validation rejects disguised media and cleans its durable objects", async t => {
  const h = await setup(t), bytes = Buffer.from("this is not a video"), ticket = await h.issue(bytes.length, "video.mp4"), record = h.stage(ticket, bytes);
  assert.equal((await h.complete(ticket)).status, 202);
  await h.application.media.directProcessing;
  const media = (await (await h.request(`${h.root}/media/${ticket.mediaId}`)).json()).media;
  assert.equal(media.status, "failed"); assert.match(media.error, /file type/); assert.equal(media.url, null);
  assert.equal(h.objects.has(record.storageKey), false);
  assert.equal(fs.existsSync(h.storage.path(record.storageKey)), false);
  assert.deepEqual(h.application.media.list("alice", h.project.id), []);
});

test("video processing reads real metadata and saves a thumbnail before ready", async t => {
  const h = await setup(t), filename = path.join(h.dir, "fixture.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=green:s=160x90:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", filename]);
  const bytes = fs.readFileSync(filename), ticket = await h.issue(bytes.length, "video.mp4"); h.stage(ticket, bytes);
  assert.equal((await h.complete(ticket)).status, 202);
  await h.application.media.directProcessing;
  const media = (await (await h.request(`${h.root}/media/${ticket.mediaId}`)).json()).media;
  assert.equal(media.status, "ready"); assert.equal(media.width, 160); assert.equal(media.height, 90); assert.equal(media.durationSec, 1); assert.equal(media.videoCodec, "h264");
  assert.ok(media.thumbnailUrl); assert.ok(h.objects.get(`${ticket.mediaId}-thumb.jpg`).length > 0);
  assert.deepEqual(h.calls.filter(call => call.method === "PUT").map(call => call.pathname), [`/media/${ticket.mediaId}-thumb.jpg`]);
});

test("durable processing resumes after a worker restart and expired grants are cleaned", async t => {
  const h = await setup(t), ticket = await h.issue(), record = h.stage(ticket);
  // Simulate a restart after immutable storage completion but before preparation started.
  await h.storage.completeDirectUpload(record.storageKey, { bytes: record.bytes });
  h.application.store.put("media", { ...record, status: "processing" });
  h.application.media.start(); await h.application.media.directProcessing; h.application.media.stop();
  assert.equal(h.application.store.get("media", ticket.mediaId).status, "ready");
  const expired = await h.issue(), pending = h.stage(expired); h.advance(3600001);
  assert.equal((await h.complete(expired)).status, 410);
  h.application.media.directStopped = false; await h.application.media.processDirectUploads();
  assert.equal(h.application.store.get("media", expired.mediaId).status, "failed"); assert.equal(h.objects.has(`staging:${pending.storageKey}`), false);
});

test("account deletion blocks pending uploads and never resurrects in-flight processing", async t => {
  const h = await setup(t), ticket = await h.issue(); h.stage(ticket);
  let release; const blocked = new Promise(resolve => { release = resolve; }); h.blockDownloads(blocked);
  assert.equal((await h.complete(ticket)).status, 202);
  h.application.privacy.requestAccount("alice", { confirmation: "DELETE" });
  assert.equal((await h.request(`${h.root}/media/${ticket.mediaId}`)).status, 410);
  release(); await h.application.media.directProcessing;
  assert.notEqual(h.application.store.get("media", ticket.mediaId)?.status, "ready"); assert.equal(h.objects.size, 0);
});

test("maintenance observes completion during another large file's preparation rather than expiring a stale grant", async t => {
  const h = await setup(t), pending = await h.issue(); h.stage(pending);
  h.advance(1); const busy = await h.issue(); h.stage(busy);
  await h.application.media.completeDirectUpload("alice", h.project.id, busy.mediaId);
  let release; h.blockDownloads(new Promise(resolve => { release = resolve; }));
  const processing = h.application.media.processDirectUploads();
  await new Promise(resolve => setImmediate(resolve));
  await h.application.media.completeDirectUpload("alice", h.project.id, pending.mediaId);
  h.advance(3600001); release(); await processing;
  assert.equal(h.application.store.get("media", busy.mediaId).status, "ready");
  assert.equal(h.application.store.get("media", pending.mediaId).status, "ready");
});
