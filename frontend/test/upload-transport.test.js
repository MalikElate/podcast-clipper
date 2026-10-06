import assert from "node:assert/strict";
import test from "node:test";
import { uploadPartWithProgress, uploadWithProgress } from "../src/bridge/uploadTransport.js";

function requestFixture() {
  return { upload: {}, headers: {}, open(method, url) { this.method = method; this.url = url; }, setRequestHeader(name, value) { this.headers[name] = value; }, send(body) { this.body = body; }, abort() { this.onabort(); } };
}

test("upload progress reports bytes, then preparation, and resolves only on the server response", async () => {
  const xhr = requestFixture(), progress = [], body = new FormData();
  let completed = false;
  const result = uploadWithProgress("/api/bridge/projects/project/media", { body, token: "meadow_upload_fixture", createRequest: () => xhr, onProgress: event => progress.push(event) });
  result.then(() => { completed = true; });
  assert.equal(xhr.method, "POST");
  assert.equal(xhr.body, body);
  assert.deepEqual(xhr.headers, { Authorization: "Bearer meadow_upload_fixture" }, "The browser sets the multipart content type and boundary");
  xhr.upload.onprogress({ loaded: 25, total: 100, lengthComputable: true });
  xhr.upload.onload();
  await Promise.resolve();
  assert.equal(completed, false, "Sending bytes is not upload completion");
  assert.deepEqual(progress, [{ stage: "uploading", loaded: 25, total: 100 }, { stage: "processing" }]);
  xhr.status = 201; xhr.response = { media: { id: "media" } }; xhr.onload();
  assert.deepEqual(await result, { ok: true, status: 201, data: { media: { id: "media" } } });
});

test("upload transport surfaces failures and cancellation without another send", async () => {
  for (const event of ["error", "timeout", "abort"]) {
    const xhr = requestFixture(), controller = new AbortController();
    const result = uploadWithProgress("/media", { body: new FormData(), token: "grant", signal: controller.signal, createRequest: () => xhr });
    const rejection = assert.rejects(result, event === "abort" ? { name: "AbortError" } : /upload/i);
    if (event === "abort") controller.abort(); else xhr[`on${event}`]();
    await rejection;
  }
  const controller = new AbortController(); controller.abort();
  assert.throws(() => uploadWithProgress("/media", { signal: controller.signal, createRequest: () => assert.fail("No request after cancellation") }), { name: "AbortError" });
});

test("direct parts send raw bytes without Meadow authorization or cookies and return the exposed ETag", async () => {
  const xhr = requestFixture(), progress = [], body = new Blob(["part bytes"]);
  xhr.getResponseHeader = name => name === "ETag" ? '"part-etag"' : null;
  const result = uploadPartWithProgress("https://account.r2.cloudflarestorage.com/bucket/key?signature=fixture", {
    body, token: "must-not-be-sent", createRequest: () => xhr, onProgress: event => progress.push(event),
  });
  assert.equal(xhr.method, "PUT");
  assert.equal(xhr.body, body, "No FormData envelope may be added to a signed part");
  assert.equal(xhr.withCredentials, false);
  assert.deepEqual(xhr.headers, { "Content-Type": "application/octet-stream" });
  xhr.upload.onprogress({ loaded: 4, total: body.size, lengthComputable: true });
  xhr.upload.onload();
  assert.deepEqual(progress, [{ stage: "uploading", loaded: 4, total: body.size }], "Finishing one part must not show media preparation");
  xhr.status = 200; xhr.onload();
  assert.deepEqual(await result, { ok: true, status: 200, etag: '"part-etag"' });
});

test("direct part failures identify retryable network errors and preserve cancellation", async () => {
  for (const [event, code] of [["error", "network_error"], ["timeout", "upload_timeout"], ["abort", null]]) {
    const xhr = requestFixture(), controller = new AbortController();
    const result = uploadPartWithProgress("https://account.r2.cloudflarestorage.com/bucket/key", { body: new Blob(["part"]), signal: controller.signal, createRequest: () => xhr });
    const rejection = assert.rejects(result, error => event === "abort" ? error === controller.signal.reason : error.code === code);
    if (event === "abort") controller.abort(); else xhr[`on${event}`]();
    await rejection;
  }
});
