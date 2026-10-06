import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { handleDirectUpload, DIRECT_UPLOAD_PART_SIZE } from "../../cloudflare/directUploads.js";

const key = "12345678-1234-4234-9234-123456789abc.upload";
const containerId = "container-fixture";
const now = Date.UTC(2026, 9, 6, 12);
const md5 = value => createHash("md5").update(value).digest("hex");
const multipartEtag = parts => `${md5(Buffer.concat(parts.map(part => Buffer.from(part.etag.replaceAll('"', ""), "hex"))))}-${parts.length}`;
const part = (partNumber, content) => ({ partNumber, etag: md5(content) });

function harness() {
  const objects = new Map(), sessions = new Map(), calls = [];
  const state = { failCompleteAfterCommit: false, failAbort: null, completedSize: null };
  const bucket = {
    async head(objectKey) { calls.push(["head", objectKey]); return objects.get(objectKey) || null; },
    async createMultipartUpload(objectKey, options) {
      const uploadId = `upload-${sessions.size + 1}`;
      calls.push(["create", objectKey, options]); sessions.set(uploadId, { objectKey, options });
      return this.resumeMultipartUpload(objectKey, uploadId);
    },
    resumeMultipartUpload(objectKey, uploadId) {
      return {
        uploadId,
        async complete(parts) {
          calls.push(["complete", objectKey, uploadId, parts]);
          const session = sessions.get(uploadId);
          if (!session || session.objectKey !== objectKey) throw new Error("The specified multipart upload does not exist. (10024)");
          const object = { key: objectKey, customMetadata: session.options.customMetadata, size: state.completedSize ?? Number(session.options.customMetadata.expectedBytes), etag: multipartEtag(parts) };
          objects.set(objectKey, object); sessions.delete(uploadId);
          if (state.failCompleteAfterCommit) throw new Error("Response lost after commit");
          return object;
        },
        async abort() {
          calls.push(["abort", objectKey, uploadId]);
          if (state.failAbort) throw state.failAbort;
          if (!sessions.delete(uploadId)) throw Object.assign(new Error("NoSuchUpload"), { code: 10024 });
        },
      };
    },
    async delete(objectKey) { calls.push(["delete", objectKey]); objects.delete(objectKey); },
  };
  const env = { MEADOW_MEDIA: bucket, R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_BUCKET_NAME: "fixture-bucket", R2_ACCESS_KEY_ID: "fixture-access", R2_SECRET_ACCESS_KEY: "fixture-secret" };
  const send = async (body, options = {}) => {
    const response = await handleDirectUpload(new Request("http://meadow.storage/uploads/" + key, { method: options.method || "POST", ...(options.method === "GET" ? {} : { body: JSON.stringify(body) }) }), env, { containerId, key, now, ...options });
    return { status: response.status, data: await response.json() };
  };
  const create = bytes => send({ action: "create", bytes, expiresAt: now + 30 * 60000, partSize: DIRECT_UPLOAD_PART_SIZE });
  return { objects, sessions, calls, state, env, send, create };
}

// Independently verify SigV4 using the request the browser will actually send.
// This catches a URL that lists Content-Length but fails to bind its value.
function validSignature(input, { method = "PUT", bytes, contentType = "application/octet-stream" }) {
  const url = new URL(input), signature = url.searchParams.get("X-Amz-Signature");
  url.searchParams.delete("X-Amz-Signature");
  const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  const sortedQuery = [...url.searchParams].map(([name, value]) => `${encode(name)}=${encode(value)}`).sort().join("&");
  const names = url.searchParams.get("X-Amz-SignedHeaders");
  const headers = `content-length:${bytes}\ncontent-type:${contentType}\nhost:${url.host}\n`;
  const canonical = [method, url.pathname, sortedQuery, headers, names, "UNSIGNED-PAYLOAD"].join("\n");
  const dateTime = url.searchParams.get("X-Amz-Date"), date = dateTime.slice(0, 8), scope = `${date}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", dateTime, scope, createHash("sha256").update(canonical).digest("hex")].join("\n");
  const hmac = (secret, value) => createHmac("sha256", secret).update(value).digest();
  const secret = hmac(hmac(hmac(hmac("AWS4fixture-secret", date), "auto"), "s3"), "aws4_request");
  return createHmac("sha256", secret).update(toSign).digest("hex") === signature;
}

test("direct grants sign exact part bytes, content type, upload session and part number", async () => {
  const h = harness(), bytes = DIRECT_UPLOAD_PART_SIZE + 123;
  const { status, data } = await h.create(bytes);
  assert.equal(status, 201); assert.equal(data.parts.length, 2);
  assert.deepEqual(data.parts.map(item => item.bytes), [DIRECT_UPLOAD_PART_SIZE, 123]);
  assert.equal(data.partSize, DIRECT_UPLOAD_PART_SIZE); assert.equal(data.expiresAt, now + 1800000);
  const create = h.calls.find(([action]) => action === "create");
  assert.equal(create[1], `${containerId}/${key}`);
  assert.deepEqual(create[2].customMetadata, { sessionKey: key, expectedBytes: String(bytes) });
  for (const item of data.parts) {
    const url = new URL(item.url);
    assert.equal(url.hostname, `${h.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    assert.equal(url.pathname, `/fixture-bucket/${containerId}/${key}`);
    assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "content-length;content-type;host");
    assert.equal(url.searchParams.get("partNumber"), String(item.partNumber));
    assert.equal(url.searchParams.get("uploadId"), data.uploadId);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "1800");
    assert.equal(validSignature(url, { bytes: item.bytes }), true);
    assert.equal(validSignature(url, { bytes: item.bytes + 1 }), false);
    assert.equal(validSignature(url, { bytes: item.bytes, contentType: "image/png" }), false);
    assert.equal(validSignature(url, { bytes: item.bytes, method: "GET" }), false);
    url.searchParams.set("partNumber", "99");
    assert.equal(validSignature(url, { bytes: item.bytes }), false);
    assert.equal(item.url.includes(h.env.R2_SECRET_ACCESS_KEY), false);
  }
});

test("small files use a single multipart part and invalid grants never create sessions", async () => {
  const h = harness();
  const small = await h.create(7);
  assert.equal(small.status, 201); assert.equal(small.data.parts.length, 1); assert.equal(small.data.parts[0].bytes, 7);
  const invalid = [
    { bytes: 0 }, { bytes: 1024 ** 3 + 1 }, { bytes: 1.5 },
    { expiresAt: now - 1 }, { expiresAt: now + 1800001 }, { partSize: 123 },
  ];
  for (const override of invalid) {
    const result = await h.send({ action: "create", bytes: 7, partSize: DIRECT_UPLOAD_PART_SIZE, expiresAt: now + 1800000, ...override });
    assert.equal(result.status, 400);
  }
  assert.equal(h.calls.filter(([action]) => action === "create").length, 1);
  delete h.env.R2_SECRET_ACCESS_KEY;
  assert.equal((await h.create(7)).status, 503);
});

test("completion is idempotent only for the exact completed session and manifest", async () => {
  const h = harness(), bytes = DIRECT_UPLOAD_PART_SIZE + 123;
  const { data } = await h.create(bytes);
  const parts = [part(1, "first part"), part(2, "last part")];
  const body = { action: "complete", uploadId: data.uploadId, bytes, parts };
  const result = await h.send(body);
  assert.deepEqual(result, { status: 200, data: { key, bytes, etag: multipartEtag(parts) } });
  assert.deepEqual(await h.send(body), result);
  assert.equal(h.calls.filter(([action]) => action === "complete").length, 1);
  const different = await h.send({ ...body, parts: [part(1, "different"), parts[1]] });
  assert.equal(different.status, 409); assert.equal(different.data.code, "upload_parts_mismatch");
  assert.equal((await h.send({ ...body, bytes: bytes + 1 })).data.code, "upload_session_mismatch");
  assert.equal(h.calls.filter(([action]) => action === "delete").length, 0);
  assert.equal(h.objects.size, 1);
});

test("a lost multipart-complete response is recovered from verified object metadata", async () => {
  const h = harness(), { data } = await h.create(7);
  h.state.failCompleteAfterCommit = true;
  const result = await h.send({ action: "complete", uploadId: data.uploadId, bytes: 7, parts: [part(1, "content")] });
  assert.equal(result.status, 200); assert.equal(h.objects.size, 1); assert.equal(h.sessions.size, 0);
});

test("invalid part lists, missing sessions and wrong committed size cannot become successful uploads", async () => {
  const h = harness(), { data } = await h.create(7);
  const body = { action: "complete", uploadId: data.uploadId, bytes: 7 };
  for (const parts of [[], [part(2, "content")], [{ partNumber: 1, etag: "not-an-etag" }], [part(1, "a"), part(1, "b")]]) {
    assert.equal((await h.send({ ...body, parts })).data.code, "upload_parts_invalid");
  }
  assert.equal(h.calls.filter(([action]) => action === "complete").length, 0);
  assert.equal((await h.send({ ...body, uploadId: "missing", parts: [part(1, "content")] })).data.code, "upload_missing");
  h.state.completedSize = 8;
  const result = await h.send({ ...body, parts: [{ partNumber: 1, etag: `"${md5("content")}"` }] });
  assert.equal(result.status, 409); assert.equal(result.data.code, "upload_size_mismatch");
  assert.equal(h.calls.filter(([action]) => action === "delete").length, 0, "the durable backend manifest owns cleanup");
});

test("foreign metadata or failed storage cannot be mistaken for a completed upload", async () => {
  const h = harness();
  h.objects.set(`${containerId}/${key}`, { size: 7, etag: multipartEtag([part(1, "content")]), customMetadata: { sessionKey: "other", expectedBytes: "7" } });
  const result = await h.send({ action: "complete", uploadId: "unknown", bytes: 7, parts: [part(1, "content")] });
  assert.equal(result.status, 409); assert.equal(result.data.code, "upload_session_mismatch");
  assert.equal((await h.create(7)).data.code, "upload_session_exists");
  h.env.MEADOW_MEDIA.head = async () => { throw new Error("R2 unavailable with internal credentials"); };
  const outage = await h.create(7);
  assert.equal(outage.status, 503); assert.equal(outage.data.code, "media_storage_unavailable");
  assert.equal(outage.data.error.includes("credentials"), false);
});

test("abort works without signing credentials, treats missing sessions as done, and retains storage errors", async () => {
  const h = harness(), { data } = await h.create(7);
  delete h.env.R2_SECRET_ACCESS_KEY;
  const body = { action: "abort", uploadId: data.uploadId };
  assert.deepEqual(await h.send(body), { status: 200, data: { aborted: true } });
  assert.equal((await h.send(body)).status, 200);
  h.state.failAbort = new Error("storage outage");
  assert.equal((await h.send(body)).status, 503);
  assert.equal(h.calls.filter(([action]) => action === "delete").length, 0);
});

test("only the internal upload control actions and UUID keys are accepted", async () => {
  const h = harness();
  for (const invalidKey of ["../escape", "/other/key.upload", key + "/nested", "arbitrary.upload"]) {
    assert.equal((await h.send({ action: "create" }, { key: invalidKey })).status, 400);
  }
  assert.equal((await h.send({}, { method: "GET" })).status, 405);
  assert.equal((await h.send({ action: "delete", uploadId: "session" })).status, 400);
  assert.equal(h.calls.length, 0);
});
