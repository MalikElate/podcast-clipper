import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DurableMediaStorage } from "../src/bridge/storage/DurableMediaStorage.js";
import { MediaService } from "../src/bridge/services/MediaService.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-durable-media-"));
  const objects = new Map(), requests = [];
  let intercept;
  const fetcher = async (url, options = {}) => {
    const method = options.method || "GET", key = decodeURIComponent(new URL(url).pathname.slice("/media/".length));
    requests.push({ method, key });
    const overridden = await intercept?.(key, method, options);
    if (overridden) return overridden;
    if (method === "PUT") {
      assert.equal(typeof options.body.pipe, "function", "large files must be streamed");
      assert.equal(options.duplex, "half");
      const chunks = []; for await (const chunk of options.body) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      assert.equal(bytes.length, Number(options.headers["Content-Length"]));
      objects.set(key, bytes); return new Response(null, { status: 204 });
    }
    if (method === "DELETE") { objects.delete(key); return new Response(null, { status: 204 }); }
    const bytes = objects.get(key);
    return bytes ? new Response(bytes, { headers: { "Content-Length": String(bytes.length) } }) : new Response(null, { status: 404 });
  };
  const cache = name => new DurableMediaStorage(path.join(dir, name), { fetcher });
  const store = new SqliteStore();
  let flushes = 0;
  store.flush = async () => { flushes++; };
  const service = storage => new MediaService({ store, storage, projects: { require: () => {}, requireRecord: (uid, projectId, kind, id) => {
    const record = store.get(kind, id); assert.ok(record); return record;
  } }, publicUrl: "https://meadow.example", signingKey: "fixture-signing-key" });
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { dir, objects, requests, cache, service, store, flushes: () => flushes, intercept: fn => { intercept = fn; } };
}
async function bytes(stream) { const chunks = []; for await (const chunk of stream) chunks.push(chunk); return Buffer.concat(chunks); }

test("durable originals stream to storage and are restored lazily after a cache restart", async t => {
  const h = setup(t), original = Buffer.alloc(2 * 1024 ** 2, 42), source = path.join(h.dir, "source.mp4");
  fs.writeFileSync(source, original);
  await h.cache("first").importFile(source, "original.mp4");
  assert.deepEqual(h.objects.get("original.mp4"), original);
  const restarted = h.cache("restarted");
  assert.equal(fs.existsSync(restarted.path("original.mp4")), false);
  await Promise.all([restarted.ensure("original.mp4"), restarted.ensure("original.mp4"), restarted.size("original.mp4")]);
  assert.equal(h.requests.filter(item => item.method === "GET").length, 1);
  assert.deepEqual(await bytes(restarted.stream("original.mp4", { start: 10, end: 19 })), original.subarray(10, 20));
  const blob = await restarted.blob("original.mp4", "video/mp4");
  assert.equal(blob.size, original.length);
  const resumed = h.cache("resumed-stream");
  assert.deepEqual(await bytes(resumed.stream("original.mp4", { start: original.length - 10 })), original.subarray(-10));
});

test("incomplete cache downloads cannot become valid files and can be retried", async t => {
  const h = setup(t), storage = h.cache("cache");
  h.objects.set("file.pdf", pdf);
  h.intercept((key, method) => method === "GET" ? new Response(pdf.subarray(0, 10), { headers: { "Content-Length": String(pdf.length) } }) : null);
  await assert.rejects(storage.ensure("file.pdf"), error => error.code === "media_storage_unavailable");
  assert.deepEqual(fs.readdirSync(storage.root), []);
  h.intercept(null);
  assert.deepEqual(await bytes(storage.stream("file.pdf")), pdf);
  await assert.rejects(storage.ensure("missing.pdf"), error => error.code === "media_not_found");
  for (const key of ["..", ".", "../escape", "nested/file.mp4"]) assert.throws(() => storage.path(key));
});

test("upload completion waits for the durable original", async t => {
  const h = setup(t), storage = h.cache("cache"), media = h.service(storage), source = path.join(h.dir, "input.pdf");
  fs.writeFileSync(source, pdf);
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.intercept(async (key, method) => {
    if (method !== "PUT") return;
    entered(); await new Promise(resolve => { release = resolve; });
  });
  let complete = false;
  const upload = media.ingest("owner", "project", { path: source, originalname: "input.pdf" }).then(record => { complete = true; return record; });
  await started;
  assert.equal(complete, false); assert.equal(h.store.list("media")[0].status, "processing");
  release(); const record = await upload;
  assert.equal(record.status, "ready"); assert.deepEqual(h.objects.get(record.storageKey), pdf); assert.ok(h.flushes() >= 2);
});

test("video thumbnails and converted variants survive cache replacement", async t => {
  const h = setup(t), first = h.cache("first"), media = h.service(first), source = path.join(h.dir, "source.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
  const record = await media.ingest("owner", "project", { path: source, originalname: "source.mp4" });
  assert.ok(h.objects.get(record.storageKey)?.length); assert.ok(h.objects.get(record.thumbnailKey)?.length);
  const second = h.cache("second"), restored = h.service(second);
  const prepared = await restored.prepare(record, "jpeg");
  assert.ok(h.objects.get(prepared.key)?.length);
  const third = h.cache("third"), afterRestart = h.service(third);
  afterRestart.runner = { run: async () => { throw new Error("persisted variant should not be regenerated"); } };
  const original = await afterRestart.prepare(record, "original"), variant = await afterRestart.prepare(record, "jpeg");
  assert.deepEqual(fs.readFileSync(third.path(original.key)), fs.readFileSync(source));
  assert.deepEqual(fs.readFileSync(third.path(variant.key)), h.objects.get(variant.key));
  assert.deepEqual(await bytes(third.stream(record.thumbnailKey)), h.objects.get(record.thumbnailKey));
});

test("failed durable deletion retains its manifest and maintenance removes every object", async t => {
  const h = setup(t), storage = h.cache("cache"), media = h.service(storage), source = path.join(h.dir, "input.pdf");
  fs.writeFileSync(source, pdf);
  const record = await media.ingest("owner", "project", { path: source, originalname: "input.pdf" });
  h.objects.set(`${record.id}-jpeg.jpg`, Buffer.from("partial unrecorded derivative"));
  h.intercept((key, method) => method === "DELETE" ? new Response(null, { status: 503 }) : null);
  await assert.rejects(media.remove("owner", "project", record.id), error => error.code === "media_storage_unavailable");
  assert.equal(h.store.get("media", record.id).status, "deleting");
  assert.deepEqual(media.list("owner", "project"), []);
  const expires = Date.now() + 60000;
  assert.throws(() => media.verify(record.id, "original", expires, media.signature(record.id, "original", expires), false), /not found/);
  h.intercept(null); await media.retryRemovals();
  assert.equal(h.store.get("media", record.id), null); assert.equal(h.objects.size, 0); assert.deepEqual(fs.readdirSync(storage.root), []);
});

test("deletion waits for an in-flight cache restore and cannot resurrect the file", async t => {
  const h = setup(t), storage = h.cache("cache");
  h.objects.set("file.pdf", pdf);
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  h.intercept(async (key, method) => {
    if (method !== "GET") return;
    entered(); await new Promise(resolve => { release = resolve; });
  });
  const restoring = storage.ensure("file.pdf"); await started;
  const removing = storage.remove("file.pdf"); release();
  await Promise.all([restoring, removing]);
  assert.equal(h.objects.has("file.pdf"), false); assert.equal(fs.existsSync(storage.path("file.pdf")), false);
});
