import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";
import { InstagramProvider } from "../src/bridge/platforms/MetaProviders.js";
import { YouTubeProvider } from "../src/bridge/platforms/GoogleProviders.js";
import { withZernio } from "../src/bridge/platforms/ZernioProvider.js";
import { videoCoverErrors, videoCoverTimestamp } from "../src/bridge/platforms/videoCover.js";
import { MediaService } from "../src/bridge/services/MediaService.js";
import { LocalMediaStorage } from "../src/bridge/storage/LocalMediaStorage.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { ProviderError } from "../src/bridge/core/errors.js";

const video = { id: "video", kind: "video", status: "ready", mime: "video/mp4", bytes: 20, durationSec: 2 };
const content = timestampMs => ({ caption: "A caption", title: "A title", format: "video", media: [video], settings: { videoCover: { mediaId: video.id, timestampMs } } });
function context(timestampMs) {
  const ctx = { content: content(timestampMs), progress: {}, account: { remoteId: "account" }, credentials: { accessToken: "token" }, media: { prepare: async () => ({ variant: "original", bytes: video.bytes }), url: () => "https://media.example/video" } };
  ctx.checkpoint = async patch => { Object.assign(ctx.progress, patch); };
  return ctx;
}

test("cover validation preserves zero and rejects invalid or stale selections", () => {
  for (const platform of ["tiktok", "instagram", "youtube"]) {
    assert.equal(videoCoverTimestamp(platform, content(0)), 0);
    assert.equal(videoCoverTimestamp(platform, content(1500)), 1500);
    for (const timestamp of [-1, 2000, 3000, NaN, Infinity, "100", 1.5]) assert.equal(videoCoverErrors(platform, content(timestamp)).length, 1);
    for (const cover of [null, [], "cover", { mediaId: "old-video", timestampMs: 0 }]) {
      const post = content(0); post.settings.videoCover = cover;
      assert.equal(videoCoverErrors(platform, post).length, 1);
    }
    const unknownDuration = content(0); unknownDuration.media = [{ ...video, durationSec: null }];
    assert.equal(videoCoverErrors(platform, unknownDuration).length, 1);
    const automatic = content(0); delete automatic.settings.videoCover;
    assert.equal(videoCoverTimestamp(platform, automatic), undefined);
  }
});

test("covers are not sent to Stories, carousels, photos, other platforms, or TikTok inbox", () => {
  for (const platform of ["tiktok", "instagram", "youtube", "facebook"]) {
    for (const format of ["story", "carousel", "image"]) assert.equal(videoCoverTimestamp(platform, { ...content(0), format }), undefined);
  }
  assert.equal(videoCoverTimestamp("tiktok", { ...content(0), settings: { ...content(0).settings, deliveryMode: "inbox" } }), undefined);
});

test("native TikTok and Instagram send the selected cover timestamp, including first frame", async () => {
  for (const timestamp of [0, 1500]) {
    const calls = [], transport = { request: async (url, options) => { calls.push({ url, options }); return { data: { publish_id: "published" }, id: "container" }; } };
    await new TikTokProvider({ transport }).publish(context(timestamp));
    assert.equal(calls[0].options.json.post_info.video_cover_timestamp_ms, timestamp);
    calls.length = 0;
    await new InstagramProvider({ transport }).publish(context(timestamp));
    assert.equal(calls[0].options.form.thumb_offset, String(timestamp));
    assert.equal(calls[0].options.form.media_type, "REELS");
    calls.length = 0;
    const story = context(timestamp); story.content.format = "story";
    await new InstagramProvider({ transport }).publish(story);
    assert.equal(calls[0].options.form.thumb_offset, undefined);
  }
});

test("Zernio TikTok and Instagram use their supported cover field names", () => {
  for (const [Base, field] of [[TikTokProvider, "videoCoverTimestampMs"], [InstagramProvider, "thumbOffset"]]) {
    const provider = new (withZernio(Base))({ env: { ZERNIO_API_KEY: "test" } });
    for (const timestamp of [0, 1500]) assert.equal(provider.postFields("video", content(timestamp)).data[field], timestamp);
    const story = { ...content(0), format: "story" };
    assert.equal(provider.postFields("story", story).data[field], undefined);
  }
});

test("YouTube uploads the extracted JPEG once and retains its thumbnail checkpoint", async () => {
  const calls = [], prepared = [], ctx = context(1500);
  ctx.media.prepareVideoCover = async (item, timestamp) => { prepared.push({ item, timestamp }); return { key: "frame.jpg", mime: "image/jpeg", bytes: 99 }; };
  ctx.media.storage = { stream: key => key };
  const provider = new YouTubeProvider({ transport: { request: async (url, options) => { calls.push({ url, options }); } } });
  await provider.setThumbnail(ctx, "youtube-video");
  assert.deepEqual(prepared, [{ item: video, timestamp: 1500 }]);
  assert.match(calls[0].url, /thumbnails\/set\?videoId=youtube-video/);
  assert.equal(calls[0].options.body, "frame.jpg");
  assert.equal(calls[0].options.headers["Content-Type"], "image/jpeg");
  assert.equal(ctx.progress.thumbnailSet, true);
  await provider.setThumbnail(ctx, "youtube-video");
  assert.equal(calls.length, 1);
});

test("a YouTube cover permission failure requires checking the existing video, and automatic retries resume it", async () => {
  const ctx = context(0), calls = [];
  ctx.progress = { phase: "video_processing", videoId: "existing-video" };
  ctx.content.settings.privacy = "private";
  ctx.media.prepareVideoCover = async () => ({ key: "cover.jpg", mime: "image/jpeg", bytes: 20 });
  ctx.media.storage = { stream: () => "image" };
  const rejected = new YouTubeProvider({ transport: { request: async () => { throw new ProviderError("Forbidden", { code: "provider_rejected" }); } } });
  await assert.rejects(rejected.setThumbnail(ctx, "existing-video"), error => error.code === "thumbnail_rejected" && error.uncertain && /YouTube received the video/.test(error.message));
  assert.equal(ctx.progress.thumbnailSet, undefined);
  const resumed = new YouTubeProvider({ transport: { request: async url => { calls.push(url); return { items: [{ status: { uploadStatus: "processed", privacyStatus: "private" } }] }; } } });
  const result = await resumed.publish(ctx);
  assert.equal(result.status, "published");
  assert.equal(result.externalId, "existing-video");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /thumbnails\/set/);
  assert.doesNotMatch(calls[1], /uploadType=resumable/);
});

test("FFmpeg extracts the selected frame, caches it, and removes it with its video", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-cover-test-")), store = new SqliteStore(), storage = new LocalMediaStorage(path.join(dir, "media"));
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const input = path.join(dir, "two-colors.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=red:s=320x180:d=1", "-f", "lavfi", "-i", "color=blue:s=320x180:d=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0", "-c:v", "libx264", "-pix_fmt", "yuv420p", input]);
  const service = new MediaService({ store, storage, signingKey: "test", projects: { require() {}, requireRecord: (uid, project, kind, id) => store.get(kind, id) } });
  const record = await service.ingest("alice", "project", { path: input, originalname: "two-colors.mp4" });
  const cover = await service.prepareVideoCover(record, 1500);
  assert.equal(cover.mime, "image/jpeg");
  const pixel = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", storage.path(cover.key), "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  assert.ok(pixel[2] > 150 && pixel[0] < 100, "the cover must be the later blue frame, not the first red frame");
  assert.equal((await service.prepareVideoCover(record, 1500)).key, cover.key);
  await assert.rejects(service.prepareVideoCover(record, 2000), /duration/);
  const url = new URL(service.url(record, { variant: cover.variant }), "https://meadow.example");
  assert.equal(service.verify(record.id, cover.variant, url.searchParams.get("expires"), url.searchParams.get("signature"), false).key, cover.key);
  await service.remove("alice", "project", record.id);
  assert.equal(fs.existsSync(storage.path(cover.key)), false);
});
