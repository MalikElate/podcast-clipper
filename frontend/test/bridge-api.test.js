import assert from "node:assert/strict";
import test from "node:test";
import { BridgeApi } from "../src/bridge/BridgeApi.js";

const rejectedSession = () => Response.json({ error: "Authentication required.", code: "authentication_required" }, { status: 401 });

test("uploads refresh authentication and replay the complete file once after a rejected session", async () => {
  const tokens = [], requests = [], body = new FormData();
  body.append("file", new Blob(["fixture video bytes"], { type: "video/mp4" }), "recording.MP4");
  const api = new BridgeApi({
    getToken: async options => { tokens.push(options); return `token-${tokens.length}`; },
    fetcher: async (path, options) => {
      const request = new Request(`https://meadow.example${path}`, options);
      const file = (await request.formData()).get("file");
      requests.push({ path, authorization: request.headers.get("authorization"), method: request.method, filename: file.name, type: file.type, content: await file.text() });
      assert.equal(options.headers["Content-Type"], undefined, "The browser must generate each multipart boundary");
      return requests.length === 1 ? rejectedSession() : Response.json({ media: { id: "uploaded" } }, { status: 201 });
    },
  });
  assert.deepEqual(await api.project("project", "/media", { method: "POST", body }), { media: { id: "uploaded" } });
  assert.deepEqual(tokens, [{ skipCache: true }, { skipCache: true }]);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ authorization, ...upload }) => upload), Array(2).fill({ path: "/api/bridge/projects/project/media", method: "POST", filename: "recording.MP4", type: "video/mp4", content: "fixture video bytes" }));
  assert.deepEqual(requests.map(item => item.authorization), ["Bearer token-1", "Bearer token-2"]);
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
