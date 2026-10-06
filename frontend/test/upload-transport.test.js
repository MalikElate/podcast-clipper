import assert from "node:assert/strict";
import test from "node:test";
import { uploadWithProgress } from "../src/bridge/uploadTransport.js";

function requestFixture() {
  return { upload: {}, headers: {}, sends: 0, aborts: 0, open(method, url) { this.method = method; this.url = url; }, setRequestHeader(name, value) { this.headers[name] = value; }, send(body) { this.body = body; this.sends++; }, abort() { this.aborts++; this.onabort(); } };
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

test("mobile browsers receive upload listeners before open, including raw PUT uploads", async () => {
  const xhr = requestFixture(), open = xhr.open;
  xhr.open = function (...args) {
    assert.equal(typeof this.upload.onprogress, "function");
    assert.equal(typeof this.upload.onload, "function");
    assert.equal(typeof this.onreadystatechange, "function");
    open.apply(this, args);
  };
  const body = new Blob(["video"]);
  const result = uploadWithProgress("https://example.r2.cloudflarestorage.com/video", { body, method: "PUT", headers: { "Content-Type": "application/octet-stream", "If-None-Match": "*" }, createRequest: () => xhr });
  assert.equal(xhr.method, "PUT");
  assert.equal(xhr.body, body);
  assert.deepEqual(xhr.headers, { "Content-Type": "application/octet-stream", "If-None-Match": "*" });
  xhr.status = 200; xhr.onload(); await result;
});

test("a transfer with no first byte stops once and ignores late progress and success", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const xhr = requestFixture(), progress = [];
  const result = uploadWithProgress("/media", { body: new FormData(), createRequest: () => xhr, onProgress: event => progress.push(event) });
  const rejection = assert.rejects(result, error => error.code === "upload_stalled" && /has not started/.test(error.message));
  t.mock.timers.tick(119999);
  assert.equal(xhr.aborts, 0);
  t.mock.timers.tick(1); await rejection;
  assert.equal(xhr.aborts, 1);
  assert.equal(xhr.sends, 1);
  xhr.upload.onprogress({ loaded: 100, total: 100, lengthComputable: true });
  xhr.status = 201; xhr.onload();
  assert.deepEqual(progress, []);
});

test("new bytes renew the stall deadline but repeated byte counts cannot hide a stall", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const xhr = requestFixture();
  const result = uploadWithProgress("/media", { body: new FormData(), createRequest: () => xhr });
  const rejection = assert.rejects(result, error => error.code === "upload_stalled" && /stopped making progress/.test(error.message));
  t.mock.timers.tick(100000);
  xhr.upload.onprogress({ loaded: 10, total: 100, lengthComputable: true });
  t.mock.timers.tick(100000);
  assert.equal(xhr.aborts, 0);
  xhr.upload.onprogress({ loaded: 10, total: 100, lengthComputable: true });
  t.mock.timers.tick(20000); await rejection;
  assert.equal(xhr.aborts, 1);
  assert.equal(xhr.sends, 1);
});

test("server preparation is not treated as an inactive transfer when upload events are missing", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const finish of [
    xhr => xhr.upload.onprogress({ loaded: 100, total: 100, lengthComputable: true }),
    xhr => xhr.upload.onload(),
    xhr => { xhr.readyState = 2; xhr.onreadystatechange(); },
  ]) {
    const xhr = requestFixture(), progress = [];
    const result = uploadWithProgress("/media", { body: new FormData(), createRequest: () => xhr, onProgress: event => progress.push(event) });
    finish(xhr);
    t.mock.timers.tick(120001);
    assert.equal(xhr.aborts, 0);
    assert.equal(progress.filter(event => event.stage === "processing").length, 1);
    xhr.status = 201; xhr.onload(); await result;
  }
});

test("cancellation and synchronous send failures clear the stall timer", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const xhr = requestFixture(), controller = new AbortController();
  const result = uploadWithProgress("/media", { body: new FormData(), signal: controller.signal, createRequest: () => xhr });
  const rejection = assert.rejects(result, { name: "AbortError" });
  controller.abort(); await rejection;
  t.mock.timers.tick(120001);
  assert.equal(xhr.aborts, 1);
  const failed = requestFixture(); failed.send = () => { throw new Error("Cannot read file"); };
  await assert.rejects(uploadWithProgress("/media", { body: new FormData(), createRequest: () => failed }), /Cannot read file/);
  t.mock.timers.tick(120001);
  assert.equal(failed.aborts, 0);
});
