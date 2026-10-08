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
import { PostService } from "../src/bridge/services/PostService.js";

const video = { id: "video", kind: "video", status: "ready", mime: "video/mp4", bytes: 20, durationSec: 2 };
const image = { id: "cover", kind: "image", status: "ready", mime: "image/png", bytes: 99 };
function customContent() { return { ...content(1500), settings: { thumbnailMediaId: image.id, thumbnailVideoId: video.id }, thumbnail: image }; }
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

test("custom covers are validated and take precedence over a frame", () => {
  for (const platform of ["tiktok", "youtube", "instagram"]) {
    const post = customContent(); post.settings.videoCover = { mediaId: video.id, timestampMs: 1500 };
    assert.deepEqual(videoCoverErrors(platform, post), []);
    assert.equal(videoCoverTimestamp(platform, post), undefined);
    for (const thumbnail of [null, { ...image, status: "processing" }, { ...image, mime: "image/gif" }, { ...image, bytes: 10 * 1024 ** 2 + 1 }]) assert.equal(videoCoverErrors(platform, { ...post, thumbnail }).length, 1);
    assert.match(videoCoverErrors(platform, { ...post, settings: { ...post.settings, thumbnailVideoId: "another-video" } })[0], /selected video/);
  }
});

test("native Instagram sends a JPEG cover URL, TikTok uses a derived video, and YouTube uploads the image once", async () => {
  const calls = [], preparations = [], ctx = context(0); ctx.content = customContent();
  ctx.media.prepare = async (item, variant) => { preparations.push([item.id, variant]); return { key: "cover.jpg", mime: "image/jpeg", bytes: 99, variant }; };
  ctx.media.url = (item, { variant }) => `https://media.example/${item.id}/${variant}`;
  ctx.media.prepareTikTokCover = async (item, cover) => { assert.equal(item.id, video.id); assert.equal(cover.id, image.id); return { variant: "tiktok-cover-cover", bytes: 99 }; };
  ctx.media.storage = { stream: key => key };
  const transport = { request: async (url, options) => { calls.push({ url, options }); return { data: { publish_id: "published" }, id: "container" }; } };
  await new InstagramProvider({ transport }).publish(ctx);
  assert.equal(calls[0].options.form.cover_url, "https://media.example/cover/video-thumbnail");
  assert.equal(calls[0].options.form.thumb_offset, undefined);
  ctx.progress = {}; calls.length = 0;
  await new TikTokProvider({ transport }).publish(ctx);
  assert.equal(calls[0].options.json.source_info.video_url, "https://media.example/video/tiktok-cover-cover");
  assert.equal(calls[0].options.json.post_info.video_cover_timestamp_ms, 0);
  ctx.progress = {}; calls.length = 0;
  const youtube = new YouTubeProvider({ transport });
  await youtube.setThumbnail(ctx, "yt"); await youtube.setThumbnail(ctx, "yt");
  assert.equal(calls.length, 1); assert.equal(calls[0].options.body, "cover.jpg");
  assert.ok(preparations.some(([id, variant]) => id === image.id && variant === "video-thumbnail"));
});

test("Zernio sends custom cover URLs without frame offsets or adding an image to video content", async () => {
  for (const [Base, field] of [[TikTokProvider, "videoCoverImageUrl"], [InstagramProvider, "instagramThumbnail"]]) {
    const calls = [], ctx = context(0); ctx.content = customContent(); ctx.credentials.zernioAccountId = "zernio-account";
    ctx.media.url = (item, { variant }) => `https://media.example/${item.id}/${variant}`;
    ctx.media.prepare = async (item, variant) => ({ variant });
    const provider = new (withZernio(Base))({ env: { ZERNIO_API_KEY: "test" }, transport: { request: async (url, options) => { calls.push({ url, options }); return Response.json({ post: { _id: "post" } }); } } });
    await provider.publish(ctx);
    const body = calls[0].options.json;
    assert.equal(body.mediaItems.length, 1); assert.equal(body.mediaItems[0].type, "video");
    assert.equal(body.platforms[0].platformSpecificData[field], "https://media.example/cover/video-thumbnail");
    assert.equal(body.platforms[0].platformSpecificData.thumbOffset, undefined);
    assert.equal(body.platforms[0].platformSpecificData.videoCoverTimestampMs, undefined);
  }
});

test("draft normalization requires an owned, ready cover and keeps it separate from the post media", () => {
  const covers = new Map([[image.id, image], ["other-owner", { ...image, id: "other-owner" }]]);
  const service = new PostService({ projects: {}, accounts: { require: () => ({ id: "yt" }) }, media: { require(uid, projectId, id) { assert.equal(uid, "alice"); assert.equal(projectId, "project"); if (id === "other-owner") throw new Error("Media not found"); return id === video.id ? video : covers.get(id); } } });
  const post = { mediaIds: [video.id], accountIds: ["yt"], overrides: { yt: { settings: customContent().settings } } };
  assert.deepEqual(service.normalizeFields("alice", "project", post).record.mediaIds, [video.id]);
  const completed = { ...post, overrides: { yt: { settings: { ...customContent().settings, thumbnailVideoId: "original-completed-video" } } } };
  assert.equal(service.normalizeFields("alice", "project", completed).record.overrides.yt.settings.thumbnailVideoId, "original-completed-video", "normalization preserves completed destination settings; providers validate only pending destinations");
  assert.throws(() => service.normalizeFields("alice", "project", { ...post, overrides: { yt: { settings: { thumbnailMediaId: "other-owner" } } } }), /not found/);
  covers.set(image.id, { ...image, status: "processing" });
  assert.throws(() => service.normalizeFields("alice", "project", post), /ready image/);
});

test("FFmpeg puts a custom image in only the first TikTok frame, preserves audio and duration, and protects active covers", async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-custom-cover-")), store = new SqliteStore(), storage = new LocalMediaStorage(path.join(dir, "media"));
  t.after(() => { store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const input = path.join(dir, "video.mp4"), coverPath = path.join(dir, "cover.png");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=blue:s=320x180:r=30:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", input]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=red:s=320x180", "-frames:v", "1", coverPath]);
  const service = new MediaService({ store, storage, signingKey: "test", projects: { require() {}, requireRecord: (uid, project, kind, id) => store.get(kind, id) } });
  const record = await service.ingest("alice", "project", { path: input, originalname: "video.mp4" });
  const cover = await service.ingest("alice", "project", { path: coverPath, originalname: "cover.png" });
  const original = fs.readFileSync(storage.path(record.storageKey));
  const asset = await service.prepareTikTokCover(record, cover);
  const pixels = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", storage.path(asset.key), "-frames:v", "3", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
  assert.ok(pixels[0] > 150 && pixels[2] < 100, "first frame must be the uploaded red cover");
  assert.ok(pixels[5] > 150 && pixels[3] < 100, "second frame must return to the original blue video");
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", storage.path(asset.key)]));
  assert.ok(probe.streams.some(stream => stream.codec_type === "audio"));
  assert.ok(Math.abs(Number(probe.format.duration) - record.durationSec) < .1);
  assert.deepEqual(fs.readFileSync(storage.path(record.storageKey)), original);
  assert.equal((await service.prepareTikTokCover(record, cover)).key, asset.key);
  await assert.rejects(service.prepareTikTokCover(record, { ...cover, projectId: "other" }), /this project/);
  store.put("post", { id: "draft", projectId: "project", mediaIds: [record.id], overrides: { tt: { settings: { thumbnailMediaId: cover.id } } } });
  await assert.rejects(service.remove("alice", "project", cover.id), /active post/);
  store.remove("post", "draft");
  store.put("post", { id: "queued", projectId: "project", mediaIds: [record.id], overrides: {} });
  store.put("delivery", { id: "delivery", projectId: "project", postId: "queued", status: "processing", contentSnapshot: { thumbnailMediaId: cover.id } });
  await assert.rejects(service.remove("alice", "project", cover.id), /active post/);
  store.remove("post", "queued"); store.remove("delivery", "delivery");
  await service.remove("alice", "project", record.id);
  assert.equal(fs.existsSync(storage.path(asset.key)), false);
});
