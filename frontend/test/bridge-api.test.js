import assert from "node:assert/strict";
import test from "node:test";
import { BridgeApi } from "../src/bridge/BridgeApi.js";

const rejectedSession = () => Response.json({ error: "Authentication required.", code: "authentication_required" }, { status: 401 });

test("uploads authorize first, refresh only the small grant request, then send the file once with its grant", async () => {
  const tokens = [], requests = [], progress = [];
  const file = new File(["fixture video bytes"], "recording.MP4", { type: "video/mp4" });
  let uploads = 0;
  const api = new BridgeApi({
    getToken: async options => { tokens.push(options); return `token-${tokens.length}`; },
    fetcher: async (path, options) => {
      assert.equal(path, "/api/bridge/projects/project/media/uploads");
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), { bytes: file.size });
      requests.push(options.headers.Authorization);
      assert.equal(uploads, 0, "No file bytes may be sent before authorization succeeds");
      return requests.length === 1 ? rejectedSession() : Response.json({ uploadToken: "meadow_upload_fixture", expiresAt: Date.now() + 1800000 }, { status: 201 });
    },
    uploader: async (path, options) => {
      uploads++;
      assert.equal(path, "/api/bridge/projects/project/media");
      assert.equal(options.token, "meadow_upload_fixture");
      assert.equal(options.body.get("file").name, file.name);
      assert.equal(await options.body.get("file").text(), await file.text());
      options.onProgress({ stage: "processing" });
      return { ok: true, status: 201, data: { media: { id: "uploaded" } } };
    },
  });
  assert.deepEqual(await api.uploadMedia("project", file, { onProgress: event => progress.push(event.stage) }), { media: { id: "uploaded" } });
  assert.deepEqual(tokens, [{ skipCache: false }, { skipCache: true }]);
  assert.deepEqual(requests, ["Bearer token-1", "Bearer token-2"]);
  assert.equal(uploads, 1);
  assert.deepEqual(progress, ["authorizing", "uploading", "processing"]);
});

test("failed authorization prevents sending the file", async () => {
  const api = new BridgeApi({ getToken: async () => null, fetcher: async () => assert.fail("No anonymous grant request"), uploader: async () => assert.fail("No unauthorized file transfer") });
  await assert.rejects(api.uploadMedia("project", new File(["video"], "video.mp4")), error => error.code === "authentication_required");
});

test("file transfers never replay after authentication, server, or network failure", async () => {
  for (const failure of [
    () => ({ ok: false, status: 401, data: { error: "Retry your upload.", code: "invalid_upload_token" } }),
    () => ({ ok: false, status: 500, data: { error: "Processing failed." } }),
    () => { throw new TypeError("Network interrupted"); },
  ]) {
    let grants = 0, uploads = 0;
    const api = new BridgeApi({ getToken: async () => "session", fetcher: async () => { grants++; return Response.json({ uploadToken: "meadow_upload_fixture" }); }, uploader: async () => { uploads++; return failure(); } });
    await assert.rejects(api.uploadMedia("project", new File(["video"], "video.mp4")));
    assert.equal(grants, 1);
    assert.equal(uploads, 1);
  }
});

test("legacy multipart requests also stop after a rejected session without replaying the file", async () => {
  let attempts = 0;
  const api = new BridgeApi({ getToken: async () => "session", fetcher: async () => { attempts++; return rejectedSession(); } });
  await assert.rejects(api.project("project", "/media", { method: "POST", body: new FormData() }), error => error.code === "authentication_required");
  assert.equal(attempts, 1);
});

test("cancelling during grant issuance stops the file transfer", async () => {
  const controller = new AbortController();
  const api = new BridgeApi({ getToken: async () => "session", fetcher: async () => { controller.abort(); return Response.json({ uploadToken: "meadow_upload_fixture" }); }, uploader: async () => assert.fail("Cancelled upload must not start") });
  await assert.rejects(api.uploadMedia("project", new File(["video"], "video.mp4"), { signal: controller.signal }), { name: "AbortError" });
});

test("JSON requests refresh a cached session token after the authentication gate rejects it", async () => {
  const tokens = [], bodies = [];
  const api = new BridgeApi({
    getToken: async options => { tokens.push(options); return options.skipCache ? "fresh" : "cached"; },
    fetcher: async (path, options) => {
      bodies.push(JSON.parse(options.body));
      return options.headers.Authorization === "Bearer cached" ? rejectedSession() : Response.json({ saved: true });
    },
  });
  assert.deepEqual(await api.updateProject("project", { name: "Meadow" }), { saved: true });
  assert.deepEqual(tokens, [{ skipCache: false }, { skipCache: true }]);
  assert.deepEqual(bodies, [{ name: "Meadow" }, { name: "Meadow" }]);
});

test("repeated authentication rejection stops after one retry with an actionable session error", async () => {
  let requests = 0;
  const api = new BridgeApi({ getToken: async () => "rejected", fetcher: async () => { requests++; return rejectedSession(); } });
  await assert.rejects(api.getProjects(), error => error.status === 401 && error.code === "authentication_required" && /sign in again/i.test(error.message));
  assert.equal(requests, 2);
});

test("a missing cached token is refreshed before any authenticated request is sent", async () => {
  const options = [];
  const api = new BridgeApi({ getToken: async value => { options.push(value); return value.skipCache ? "fresh" : null; }, fetcher: async (path, request) => {
    assert.equal(request.headers.Authorization, "Bearer fresh");
    return Response.json({ projects: [] });
  } });
  assert.deepEqual(await api.getProjects(), { projects: [] });
  assert.deepEqual(options, [{ skipCache: false }, { skipCache: true }]);
});

test("an ended session never sends an anonymous upload", async () => {
  const api = new BridgeApi({ getToken: async () => null, fetcher: async () => assert.fail("Anonymous requests must not be sent") });
  await assert.rejects(api.project("project", "/media", { method: "POST", body: new FormData() }), error => error.code === "authentication_required" && /sign in again/i.test(error.message));
});

test("authorization, provider, server and network failures never replay a write", async () => {
  for (const failure of [
    () => Response.json({ error: "Provider rejected credentials", code: "provider_auth" }, { status: 401 }),
    () => Response.json({ error: "Unknown unauthorized response" }, { status: 401 }),
    () => Response.json({ error: "Access denied" }, { status: 403 }),
    () => Response.json({ error: "Request failed" }, { status: 500 }),
    () => { throw new TypeError("Network interrupted"); },
  ]) {
    let requests = 0;
    const api = new BridgeApi({ getToken: async () => "token", fetcher: async () => { requests++; return failure(); } });
    await assert.rejects(api.project("project", "/posts", { method: "POST", body: { caption: "Publish this once" } }));
    assert.equal(requests, 1);
  }
});

test("cancelling a request during token refresh prevents the retry", async () => {
  const controller = new AbortController();
  let requests = 0;
  const api = new BridgeApi({ getToken: async ({ skipCache }) => { if (skipCache) controller.abort(); return "token"; }, fetcher: async () => { requests++; return rejectedSession(); } });
  await assert.rejects(api.getProjects(controller.signal), { name: "AbortError" });
  assert.equal(requests, 1);
});

test("local preview uses its preview header without calling Clerk", async () => {
  const api = new BridgeApi({ preview: true, getToken: async () => assert.fail("Preview does not use Clerk"), fetcher: async (path, options) => {
    assert.equal(options.headers["X-Bridge-Preview"], "1");
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ projects: [] });
  } });
  assert.deepEqual(await api.getProjects(), { projects: [] });
});
