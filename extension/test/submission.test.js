import test from "node:test";
import assert from "node:assert/strict";
import { BridgeApi } from "../src/api.js";
import { submitComposerPosts } from "../src/submission.js";

const response = data => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
const options = { projectId: "p", requestId: "stable-request-identifier", items: [{ caption: "Reviewed post", accountIds: ["ig"], mediaIds: [] }] };

test("a connection changed during preview cannot publish under a newly approved identity", async () => {
  let key = "first-test-key", deliver, previewStarted;
  const started = new Promise(resolve => { previewStarted = resolve; }), requests = [];
  const apiClient = new BridgeApi({ authClient: { getKey: async () => key, invalidateKey: async () => {} }, fetcher: async (url, request) => {
    requests.push({ url, request }); previewStarted();
    return new Promise(resolve => { deliver = resolve; });
  } });
  const submitting = submitComposerPosts({ ...options, apiClient });
  await started; key = "new-test-key"; deliver(response({ valid: true, rows: [] }));
  await assert.rejects(submitting, error => error.code === "connection_changed");
  assert.equal(requests.length, 1); assert.ok(requests[0].url.endsWith("/posts/preview"));
});

test("the original preview validation and stable submission body are preserved for an unchanged connection", async () => {
  const requests = [];
  const apiClient = new BridgeApi({ authClient: { getKey: async () => "test-key", invalidateKey: async () => {} }, fetcher: async (url, request) => {
    requests.push({ url, request }); return response(url.endsWith("/preview") ? { valid: true, rows: [] } : { posts: [{ id: "queued-post", status: "scheduled" }] });
  } });
  const result = await submitComposerPosts({ ...options, apiClient });
  assert.equal(result.posts[0].id, "queued-post");
  assert.deepEqual(JSON.parse(requests[1].request.body), { items: options.items, requestId: options.requestId });
  assert.ok(requests.every(item => item.request.headers.Authorization === "Bearer test-key"));
});

test("a rejected server preview blocks publication and surfaces the actual platform error", async () => {
  let requests = 0;
  const apiClient = new BridgeApi({ authClient: { getKey: async () => "test-key", invalidateKey: async () => {} }, fetcher: async () => {
    requests++; return response({ valid: false, rows: [{ destinations: [{ errors: ["Choose TikTok privacy"] }] }] });
  } });
  await assert.rejects(submitComposerPosts({ ...options, apiClient }), error => error.code === "invalid_content" && /Choose TikTok privacy/.test(error.message));
  assert.equal(requests, 1);
});
