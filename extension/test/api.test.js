import test from "node:test";
import assert from "node:assert/strict";
import { BridgeApi, MAX_UPLOAD_BYTES } from "../src/api.js";

const key = "test-account-key";
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const auth = () => ({ invalidated: [], async getKey() { return key; }, async invalidateKey(value) { this.invalidated.push(value); } });

test("REST calls use the fixed API origin and owned-project path, without cookies or redirects", async () => {
  const calls = [], authClient = auth();
  const api = new BridgeApi({ authClient, fetcher: async (url, options) => { calls.push({ url, options }); return response({ accounts: [{ id: "tt", platform: "tiktok" }, { id: "ig", platform: "instagram" }] }); } });
  const data = await api.project("workspace/other", "/accounts");
  assert.equal(calls[0].url, "https://findmeadow.com/api/bridge/projects/workspace%2Fother/accounts");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${key}`);
  assert.equal(calls[0].options.credentials, "omit");
  assert.equal(calls[0].options.redirect, "error");
  assert.deepEqual(data.accounts.map(item => item.id), ["ig", "tt"]);
  for (const path of ["https://other.example", "//other.example/api", "/../../../outside", "/config#fragment"]) await assert.rejects(api.request(path), /Invalid Meadow API/);
  assert.equal(calls.length, 1);
});

test("a failed publication is never replayed automatically and server validation remains visible", async () => {
  let requests = 0;
  const api = new BridgeApi({ authClient: auth(), fetcher: async () => { requests++; throw new TypeError("Connection lost"); } });
  const body = { requestId: "stable-post-request", items: [{ caption: "Reviewed caption", accountIds: ["ig"], mediaIds: [] }] };
  await assert.rejects(api.project("p", "/posts", { method: "POST", body }), error => error.code === "network_error");
  assert.equal(requests, 1);
  const details = [{ destinations: [{ errors: ["Choose TikTok privacy"] }] }];
  const validation = new BridgeApi({ authClient: auth(), fetcher: async () => response({ error: "Review this post", code: "invalid_content", details }, 422) });
  await assert.rejects(validation.project("p", "/posts", { method: "POST", body }), error => error.code === "invalid_content" && error.status === 422 && JSON.stringify(error.details) === JSON.stringify(details));
});

test("a rejected account key clears authentication, but validation errors do not", async () => {
  const authClient = auth();
  const api = new BridgeApi({ authClient, fetcher: async () => response({ error: "Revoked", code: "invalid_api_key" }, 401) });
  await assert.rejects(api.getProjects(), error => error.status === 401);
  assert.deepEqual(authClient.invalidated, [key]);
  const validation = new BridgeApi({ authClient, fetcher: async () => response({ error: "Invalid" }, 400) });
  await assert.rejects(validation.getProjects());
  assert.equal(authClient.invalidated.length, 1);
});

test("files use a same-origin single-use grant rather than the account key or direct R2 upload", async () => {
  const calls = [], transfers = [], file = new File(["small fake image"], "picture.png", { type: "image/png" });
  const grant = `meadow_upload_${"U".repeat(43)}`;
  const api = new BridgeApi({ authClient: auth(), fetcher: async (url, options) => { calls.push({ url, options }); return response({ uploadToken: grant }); }, uploader: async (url, options) => { transfers.push({ url, options }); return { ok: true, status: 201, data: { media: { id: "media1", status: "ready", kind: "image", url: "/media/media1/original?expires=123&signature=signed", thumbnailUrl: "/media/media1/thumbnail?expires=123&signature=signed" } } }; } });
  const progress = [];
  const data = await api.uploadMedia("p", file, { onProgress: value => progress.push(value) });
  assert.deepEqual(JSON.parse(calls[0].options.body), { bytes: file.size, filename: "picture.png", direct: false });
  assert.equal(transfers[0].url, "https://findmeadow.com/api/bridge/projects/p/media");
  assert.equal(transfers[0].options.token, grant);
  assert.notEqual(transfers[0].options.token, key);
  assert.equal(transfers[0].options.body.get("file").name, file.name);
  assert.equal(data.media.id, "media1");
  assert.equal(data.media.url, "https://findmeadow.com/media/media1/original?expires=123&signature=signed");
  assert.equal(data.media.thumbnailUrl, "https://findmeadow.com/media/media1/thumbnail?expires=123&signature=signed");
  assert.deepEqual(progress.map(item => item.stage), ["authorizing", "uploading"]);
});

test("owned media previews resolve only Meadow media paths and external creator avatars are omitted", async () => {
  const data = {
    media: [{ id: "m1", url: "/media/m1/original?signature=a", thumbnailUrl: "https://external.example/thumb.png", downloadUrl: "https://user:password@findmeadow.com/media/m1/original" }],
    posts: [{ media: [{ id: "m2", url: "https://findmeadow.com/media/m2/original", thumbnailUrl: "/media/m2/thumbnail", downloadUrl: "/media/m2/original?download=1" }] }],
    options: { creator: { nickname: "Creator", username: "creator", privacyOptions: ["SELF_ONLY"], avatar: "https://external.example/avatar.png" } },
    accounts: [{ options: { creator: { nickname: "Connected creator", avatar: "https://findmeadow.com/avatar.png" } } }],
  };
  const api = new BridgeApi({ authClient: auth(), fetcher: async () => response(data) });
  const result = await api.project("p", "/media");
  assert.equal(result.media[0].url, "https://findmeadow.com/media/m1/original?signature=a");
  assert.equal(result.media[0].thumbnailUrl, null); assert.equal(result.media[0].downloadUrl, null);
  assert.equal(result.posts[0].media[0].thumbnailUrl, "https://findmeadow.com/media/m2/thumbnail");
  assert.equal(result.posts[0].media[0].downloadUrl, "https://findmeadow.com/media/m2/original?download=1");
  assert.equal(result.options.creator.nickname, "Creator");
  assert.deepEqual(result.options.creator.privacyOptions, ["SELF_ONLY"]);
  assert.equal("avatar" in result.options.creator, false); assert.equal("avatar" in result.accounts[0].options.creator, false);
});

test("oversized files and unexpected direct uploads fail before any transfer", async () => {
  let requests = 0, transfers = 0;
  const api = new BridgeApi({ authClient: auth(), fetcher: async () => { requests++; return response({ directUpload: { uploadUrl: "https://other.example" } }); }, uploader: async () => { transfers++; } });
  const oversized = new File(["x"], "large.mp4"); Object.defineProperty(oversized, "size", { value: MAX_UPLOAD_BYTES + 1 });
  await assert.rejects(api.uploadMedia("p", oversized), /90 MiB/);
  assert.equal(requests, 0);
  await assert.rejects(api.uploadMedia("p", new File(["x"], "small.mp4")), /authorize this upload/);
  assert.equal(requests, 1);
  assert.equal(transfers, 0);
});

test("the upload limit respects smaller server limits and never exceeds the extension transport cap", async () => {
  let requests = 0, serverLimit = 5 * 1024 ** 2;
  const api = new BridgeApi({ authClient: auth(), fetcher: async () => { requests++; return response({ maxUploadBytes: serverLimit }); } });
  assert.equal((await api.request("/config")).maxUploadBytes, serverLimit);
  const file = new File(["x"], "large.mp4"); Object.defineProperty(file, "size", { value: 6 * 1024 ** 2 });
  await assert.rejects(api.uploadMedia("p", file), /5 MiB/);
  assert.equal(requests, 1, "reject before requesting an upload grant");
  serverLimit = 1024 * 1024 ** 2;
  assert.equal((await api.request("/config")).maxUploadBytes, MAX_UPLOAD_BYTES);
});

test("failed or aborted uploads are not repeated or mistaken for ready media", async () => {
  let transfers = 0;
  const api = new BridgeApi({ authClient: auth(), fetcher: async () => response({ uploadToken: `meadow_upload_${"U".repeat(43)}` }), uploader: async () => { transfers++; throw new Error("Upload interrupted"); } });
  const file = new File(["x"], "small.mp4");
  await assert.rejects(api.uploadMedia("p", file), /interrupted/);
  assert.equal(transfers, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api.uploadMedia("p", file, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(transfers, 1);
  const notReady = new BridgeApi({ authClient: auth(), fetcher: async () => response({ uploadToken: `meadow_upload_${"U".repeat(43)}` }), uploader: async () => ({ ok: true, data: { media: { id: "m", status: "processing" } } }) });
  await assert.rejects(notReady.uploadMedia("p", file), /could not be confirmed/);
});
