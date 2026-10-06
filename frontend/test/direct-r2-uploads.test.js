import test from "node:test";
import assert from "node:assert/strict";
import { handleDirectUpload, stagingKey, directUploadMaxBytes } from "../../cloudflare/directUploads.js";
import { BridgeApi } from "../src/bridge/BridgeApi.js";
import { uploadWithProgress } from "../src/bridge/uploadTransport.js";

const id = "c2ff249b-a63b-4287-831e-5aa68f615e16", key = `${id}.upload`, containerId = "a".repeat(64);
const context = { containerId }, objects = () => new Map();
const config = map => ({ R2_UPLOAD_ACCOUNT_ID: "b".repeat(32), R2_UPLOAD_BUCKET: "meadow-media", R2_UPLOAD_ACCESS_KEY_ID: "test-access", R2_UPLOAD_SECRET_ACCESS_KEY: "test-secret", MEADOW_MEDIA: { head: async key => map.get(key), delete: async key => map.delete(key) } });
const request = (path = "/uploads", input = { key, bytes: 120 * 1024 ** 2 }) => new Request(`http://meadow.storage${path}`, { method: "POST", body: JSON.stringify(input) });

test("R2 grants sign a private staging PUT with a one-hour expiry and no reusable credentials", async () => {
  const response = await handleDirectUpload(request(), config(objects()), context), ticket = await response.json();
  assert.equal(response.status, 200);
  const url = new URL(ticket.uploadUrl);
  assert.equal(url.hostname, `${"b".repeat(32)}.r2.cloudflarestorage.com`);
  assert.equal(url.pathname, `/meadow-media/${stagingKey(containerId, key)}`);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "3600");
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host;if-none-match");
  assert.equal(ticket.method, "PUT");
  assert.deepEqual(ticket.headers, { "Content-Type": "application/octet-stream", "If-None-Match": "*" });
  assert.equal(JSON.stringify(ticket).includes("test-secret"), false);
  assert.equal(url.pathname.includes(`/${containerId}/${key}`), true);
});

test("R2 rejects bad sizes, paths, missing configuration and accepts its actual single-request maximum", async () => {
  for (const input of [{ key: "../other", bytes: 10 }, { key, bytes: 0 }, { key, bytes: directUploadMaxBytes + 1 }, { key, bytes: "100" }]) assert.equal((await handleDirectUpload(request("/uploads", input), config(objects()), context)).status, 400);
  assert.equal((await handleDirectUpload(request(), {}, context)).status, 503);
  assert.equal((await handleDirectUpload(request("/uploads", { key, bytes: directUploadMaxBytes }), config(objects()), context)).status, 200);
});

test("completion copies inside R2 with an ETag condition, retires staging, and safely accepts retries", async () => {
  const map = objects(), bytes = 120 * 1024 ** 2;
  map.set(stagingKey(containerId, key), { size: bytes, httpEtag: '"immutable-etag"' });
  let copies = 0;
  const fetcher = async request => {
    copies++;
    assert.equal(request.method, "PUT");
    assert.equal(new URL(request.url).pathname, `/meadow-media/${containerId}/${key}`);
    assert.equal(request.headers.get("x-amz-copy-source"), `/meadow-media/${stagingKey(containerId, key)}`);
    assert.equal(request.headers.get("x-amz-copy-source-if-match"), '"immutable-etag"');
    assert.match(request.headers.get("Authorization"), /^AWS4-HMAC-SHA256/);
    map.set(`${containerId}/${key}`, { size: bytes });
    return new Response("<CopyObjectResult><ETag>etag</ETag></CopyObjectResult>");
  };
  for (let attempt = 0; attempt < 2; attempt++) assert.equal((await handleDirectUpload(request("/uploads/complete", { key, bytes }), config(map), context, { fetcher })).status, 200);
  assert.equal(copies, 1);
  assert.equal(map.has(stagingKey(containerId, key)), false);
});

test("missing, truncated and failed copies never acknowledge an uploaded file", async () => {
  const map = objects(), env = config(map);
  assert.equal((await handleDirectUpload(request("/uploads/complete"), env, context)).status, 409);
  map.set(stagingKey(containerId, key), { size: 1 });
  assert.equal((await handleDirectUpload(request("/uploads/complete"), env, context)).status, 400);
  map.set(stagingKey(containerId, key), { size: 120 * 1024 ** 2, etag: "etag" });
  assert.equal((await handleDirectUpload(request("/uploads/complete"), env, context, { fetcher: async () => new Response("<Error><Code>InternalError</Code></Error>") })).status, 503);
  assert.equal(map.has(stagingKey(containerId, key)), true);
});

const ticket = { mediaId: id, uploadUrl: `https://${"b".repeat(32)}.r2.cloudflarestorage.com/meadow-media/direct-uploads/file?X-Amz-Signature=fixture`, method: "PUT" };
test("browser uploads the raw file without session credentials, then waits for verified media", async () => {
  const file = new File(["video"], "video.mp4"), stages = [], paths = [];
  let transfers = 0, polls = 0;
  const api = new BridgeApi({ getToken: async () => "session", track: () => {}, waitForPreparation: async () => {}, fetcher: async (path, options) => {
    paths.push(path);
    assert.equal(options.headers.Authorization, "Bearer session");
    if (path.endsWith("/uploads")) return Response.json({ directUpload: ticket });
    if (path.endsWith("/complete")) return Response.json({ media: { id, status: "processing" } }, { status: 202 });
    polls++;
    return Response.json({ media: { id, status: polls === 1 ? "processing" : "ready" } });
  }, uploader: async (url, options) => {
    transfers++;
    assert.equal(url, ticket.uploadUrl);
    assert.equal(options.body, file);
    assert.equal(options.method, "PUT");
    assert.equal(options.token, undefined);
    assert.equal(options.headers.Authorization, undefined);
    return { ok: true, status: 200, data: {} };
  } });
  assert.equal((await api.uploadMedia("project", file, { onProgress: event => stages.push(event.stage) })).media.status, "ready");
  assert.equal(transfers, 1);
  assert.equal(polls, 2);
  assert.deepEqual(stages, ["authorizing", "uploading", "processing"]);
  assert.equal(paths.some(path => path === "/api/bridge/projects/project/media"), false);
});

test("failed direct transfers and invalid ticket hosts never send a second copy", async () => {
  for (const invalid of [false, true]) {
    let transfers = 0, completions = 0;
    const api = new BridgeApi({ getToken: async () => "session", track: () => {}, fetcher: async path => {
      if (!path.endsWith("/uploads")) completions++;
      return Response.json({ directUpload: { ...ticket, ...(invalid ? { uploadUrl: "https://attacker.example/upload" } : {}) } });
    }, uploader: async () => { transfers++; return { ok: false, status: 403 }; } });
    await assert.rejects(api.uploadMedia("project", new File(["file"], "file.mp4")));
    assert.equal(transfers, invalid ? 0 : 1);
    assert.equal(completions, 0);
  }
});

test("lost completion acknowledgements recover by polling without reuploading", async () => {
  let transfers = 0, completions = 0;
  const api = new BridgeApi({ getToken: async () => "session", track: () => {}, fetcher: async path => {
    if (path.endsWith("/uploads")) return Response.json({ directUpload: ticket });
    if (path.endsWith("/complete")) { completions++; throw new TypeError("dropped acknowledgement"); }
    return Response.json({ media: { id, status: "ready" } });
  }, uploader: async () => { transfers++; return { ok: true }; } });
  assert.equal((await api.uploadMedia("project", new File(["file"], "file.mp4"))).media.status, "ready");
  assert.equal(transfers, 1); assert.equal(completions, 1);
});

test("preparation failure and cancellation are visible, never acknowledged as ready", async () => {
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    const api = new BridgeApi({ getToken: async () => "session", track: () => {}, waitForPreparation: async () => controller.abort(), fetcher: async path => Response.json(path.endsWith("/uploads") ? { directUpload: ticket } : { media: { id, status: cancel ? "processing" : "failed", error: "Unsupported video" } }), uploader: async () => ({ ok: true }) });
    await assert.rejects(api.uploadMedia("project", new File(["file"], "file.mp4"), { signal: controller.signal }), cancel ? { name: "AbortError" } : /Unsupported video/);
  }
});

test("XHR sends one raw PUT with progress and no authorization header", async () => {
  const xhr = { upload: {}, headers: {}, open(method, url) { this.method = method; this.url = url; }, setRequestHeader(name, value) { this.headers[name] = value; }, send(body) { this.body = body; } };
  const file = new File(["file"], "file.mp4");
  const result = uploadWithProgress(ticket.uploadUrl, { method: "PUT", body: file, headers: ticket.headers || { "Content-Type": "application/octet-stream", "If-None-Match": "*" }, createRequest: () => xhr });
  assert.equal(xhr.method, "PUT"); assert.equal(xhr.body, file); assert.equal(xhr.headers.Authorization, undefined);
  xhr.status = 200; xhr.response = null; xhr.onload();
  assert.deepEqual(await result, { ok: true, status: 200, data: {} });
});
