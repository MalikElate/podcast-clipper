import test from "node:test";
import assert from "node:assert/strict";
import { VideoSourceService } from "../src/bridge/services/VideoSourceService.js";
import { isoSeconds } from "../src/bridge/platforms/GoogleProviders.js";

test("Dropper video sources include only the owner's connected accounts and keep Zernio video files", async () => {
  const accounts = [
    { id: "own", ownerUid: "alice", projectId: "creator", status: "connected" },
    { id: "other", ownerUid: "bob", projectId: "creator", status: "connected" },
    { id: "removed", ownerUid: "alice", projectId: "creator", status: "disconnected" },
  ];
  const source = new VideoSourceService({
    store: { list: () => accounts },
    accounts: {},
    registry: {},
    analytics: { async syncAccount() { return { posts: [
      { id: "1", url: "https://www.tiktok.com/@creator/video/123", title: "Video", values: { views: 12, comments: null }, media: { type: "carousel", items: [{ type: "video", url: "https://cdn.example/video.mp4" }] } },
      { id: "2", url: "https://www.tiktok.com/@creator/photo/456", media: { type: "carousel", items: [{ type: "image", url: "https://cdn.example/photo.jpg" }] } },
    ] }; } },
    downloader: {},
  });
  assert.deepEqual(source.connectedAccounts("alice", "creator").map(account => account.id), ["own"]);
  const result = await source.sourceVideos({ platform: "tiktok", remoteId: "zernio:creator" });
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].directUrl, "https://cdn.example/video.mp4");
  assert.deepEqual(result.others.map(post => [post.externalId, post.format, post.thumbnailUrl]), [["2", "photo", "https://cdn.example/photo.jpg"]]);
  assert.deepEqual(result.videos[0].metrics, { views: 12 });
});

test("Dropper video source cache refreshes when an account is disconnected or reauthorized", async () => {
  let now = 1000000, calls = 0;
  const source = new VideoSourceService({
    store: {},
    accounts: { withCredentials: async (_account, callback) => callback({ accessToken: "token" }) },
    registry: { get: () => ({ recentVideos: async () => [{ id: String(++calls), title: "Video", url: "https://www.youtube.com/watch?v=abc123", metrics: { views: 3 } }] }) },
    analytics: {},
    downloader: {},
    clock: () => now,
  });
  const account = { id: "channel", ownerUid: "alice", platform: "youtube", authorizationId: "grant-1" };
  assert.equal((await source.sourceVideos(account)).videos[0].externalId, "1");
  assert.equal((await source.sourceVideos(account)).videos[0].externalId, "1");
  source.invalidateAccount(account.id);
  assert.equal((await source.sourceVideos(account)).videos[0].externalId, "2");
  assert.equal((await source.sourceVideos({ ...account, authorizationId: "grant-2" })).videos[0].externalId, "3");
  source.removeOwner("alice");
  assert.equal((await source.sourceVideos(account)).videos[0].externalId, "4");
  now += 15 * 60000 + 1;
  assert.equal((await source.sourceVideos(account)).videos[0].externalId, "5");
});

test("native source videos carry their length so Dropper can reject ones that fit no destination", async () => {
  const source = new VideoSourceService({
    store: { list: () => [] },
    accounts: { withCredentials: (account, use) => use({}) },
    registry: { get: () => ({ recentVideos: async () => [{ id: "1", title: "Clip", caption: "Clip", publishedAt: 1, url: "https://www.tiktok.com/@a/video/1", duration: 42, width: 1080, height: 1920 }, { id: "2", url: "https://www.tiktok.com/@a/video/2" }] }) },
    downloader: {},
  });
  const result = await source.sourceVideos({ id: "own", platform: "tiktok", authorizationId: "grant" });
  assert.deepEqual(result.videos.map(video => [video.duration, video.width, video.height]), [[42, 1080, 1920], [null, null, null]]);
  assert.deepEqual(result.others, []);
  assert.deepEqual(["PT1H2M3S", "PT45S", "P1DT1S", "P0D", "", "bad"].map(isoSeconds), [3723, 45, 86401, null, null, null]);
});
