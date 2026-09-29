import assert from "node:assert/strict";
import test from "node:test";
import { previewErrors, submitComposerPosts } from "../src/bridge/composerSubmission.js";

test("one composer action validates and immediately queues a valid post", async () => {
  const calls = [];
  const apiClient = { project: async (projectId, path, options) => {
    calls.push({ projectId, path, options });
    return path === "/posts/preview" ? { valid: true, rows: [], delayed: 0 } : { posts: [{ id: "post-1" }] };
  } };
  const items = [{ caption: "Ready to publish" }];
  const result = await submitComposerPosts({ projectId: "project-1", items, requestId: "request-12345678", apiClient });
  assert.deepEqual(calls.map(call => call.path), ["/posts/preview", "/posts"]);
  assert.deepEqual(calls[1].options.body, { items, requestId: "request-12345678" });
  assert.equal(result.posts[0].id, "post-1");
});

test("validation errors stay in the composer and stop submission", async () => {
  const calls = [];
  const preview = { valid: false, rows: [{ destinations: [
    { errors: ["Choose an audience.", "Accept the music confirmation."] },
    { errors: ["Choose an audience."] },
  ] }] };
  const apiClient = { project: async (_projectId, path) => { calls.push(path); return preview; } };
  await assert.rejects(
    submitComposerPosts({ projectId: "project-1", items: [{}], requestId: "request-12345678", apiClient }),
    /Choose an audience\. · Accept the music confirmation\./,
  );
  assert.deepEqual(calls, ["/posts/preview"]);
  assert.equal(previewErrors(preview), "Choose an audience. · Accept the music confirmation.");
});
