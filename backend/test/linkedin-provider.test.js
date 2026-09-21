import test from "node:test";
import assert from "node:assert/strict";
import { LinkedInProvider } from "../src/bridge/platforms/LinkedInProvider.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";

const image = { id: "image1", filename: "image.jpg", kind: "image", mime: "image/jpeg", status: "ready", bytes: 500 };
function context(media) {
  const ctx = {
    account: { remoteId: "urn:li:person:member" },
    credentials: { accessToken: "test-access-token" },
    content: { title: "Image", caption: "Caption", media },
    progress: {},
    media: { prepare: async item => ({ ...item, key: item.id }), storage: { stream: () => new Blob(["bytes"]).stream() } },
  };
  ctx.checkpoint = async patch => { ctx.progress = { ...ctx.progress, ...patch }; };
  return ctx;
}
function transport(handler) {
  const calls = [];
  return { calls, request: async (url, options = {}) => { calls.push({ url, options }); return handler(url, options); } };
}

test("LinkedIn profile images wait for processing with write-only member access", async () => {
  let imageReads = 0, uploads = 0, publications = 0;
  const http = new HttpTransport({ fetcher: async (url, options) => {
    if (url.includes("initializeUpload")) return Response.json({ value: { image: "urn:li:image:1", uploadUrl: "https://www.linkedin.com/upload" } });
    if (url.endsWith("/upload")) { uploads++; return new Response(null, { status: 201 }); }
    if (url.includes("/images/")) {
      if (options.headers["LinkedIn-Version"]) return Response.json({ message: "Write-only permission" }, { status: 403 });
      assert.equal(options.headers.Authorization, "Bearer test-access-token");
      assert.equal(options.headers["X-Restli-Protocol-Version"], "2.0.0");
      return Response.json({ status: ++imageReads === 1 ? "PROCESSING" : "AVAILABLE" });
    }
    assert.ok(url.endsWith("/posts"));
    assert.equal(options.headers["LinkedIn-Version"], "202607");
    assert.equal(JSON.parse(options.body).content.media.id, "urn:li:image:1");
    publications++;
    return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:5" } });
  } });
  const provider = new LinkedInProvider({ transport: http }), ctx = context([image]);
  ctx.account.remoteId = "urn:li:person:member";
  assert.equal((await provider.publish(ctx)).status, "processing");
  assert.equal(publications, 0);
  const result = await provider.poll(ctx);
  assert.equal(result.status, "published");
  assert.equal(result.externalId, "urn:li:share:5");
  assert.equal(uploads, 1);
  assert.equal(publications, 1);
});

test("LinkedIn organization images retain versioned processing checks", async () => {
  const http = transport((url, options) => {
    assert.equal(options.headers["LinkedIn-Version"], "202607");
    return { status: "PROCESSING" };
  });
  const provider = new LinkedInProvider({ transport: http }), ctx = context([image]);
  ctx.account.remoteId = "urn:li:organization:company";
  ctx.progress.uploads = [{ urn: "urn:li:image:1", collection: "images", kind: "image" }];
  assert.equal((await provider.poll(ctx)).status, "processing");
  assert.equal(http.calls.length, 1);
});
