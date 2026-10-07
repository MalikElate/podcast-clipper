import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VideoSourceDownloader } from "../src/bridge/services/VideoSourceDownloader.js";
import { YouTubeProvider } from "../src/bridge/platforms/GoogleProviders.js";
import { HttpTransport } from "../src/bridge/platforms/HttpTransport.js";

function setup(t, env = {}, { cobalt, ytdlp, direct } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-video-source-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const calls = { downloads: [], cobalt: [], ytdlp: [] };
  const downloader = new VideoSourceDownloader({
    env,
    downloadMedia: async (url, destination) => {
      calls.downloads.push(url);
      if (direct && url === direct.url && direct.fail) throw new Error("expired");
      await fs.promises.writeFile(destination, "video");
      return { filename: "clip.mp4", bytes: 5 };
    },
    fetcher: async (url, options) => { calls.cobalt.push({ url, options, body: JSON.parse(options.body) }); return Response.json(...(cobalt || [{ status: "tunnel", url: "/tunnel?id=1", filename: "tiktok.mp4" }])); },
    run: async (binary, args) => {
      calls.ytdlp.push({ binary, args });
      if (ytdlp?.fail) return { code: 1, stdout: "", stderr: ytdlp.fail };
      const output = args[args.indexOf("-o") + 1].replace("%(ext)s", "mp4");
      await fs.promises.writeFile(output, "video-bytes");
      return { code: 0, stdout: `${output}\n`, stderr: "" };
    },
  });
  return { dir, calls, downloader, target: path.join(dir, "target") };
}

test("a platform's own video file is used before any resolver", async t => {
  const h = setup(t, { COBALT_API_URL: "https://cobalt.example.com/" });
  const result = await h.downloader.download({ url: "https://facebook.com/reel/1", platform: "facebook", directUrl: "https://video.fbcdn.net/clip.mp4" }, h.target, { maxBytes: 1024 });
  assert.equal(result.resolver, "direct");
  assert.deepEqual(h.calls.downloads, ["https://video.fbcdn.net/clip.mp4"]);
  assert.equal(h.calls.cobalt.length, 0);
});

test("TikTok and YouTube go through Cobalt with H.264 video", async t => {
  const h = setup(t, { COBALT_API_URL: "https://cobalt.example.com/", COBALT_API_KEY: "secret" });
  assert.equal(h.downloader.supports("tiktok"), true);
  assert.equal(h.downloader.supports("linkedin"), false);
  const result = await h.downloader.download({ url: "https://www.tiktok.com/@me/video/123", platform: "tiktok" }, h.target, { maxBytes: 1024 });
  assert.equal(result.resolver, "cobalt");
  assert.equal(result.filename, "tiktok.mp4");
  const [request] = h.calls.cobalt;
  assert.equal(request.options.headers.Authorization, "Api-Key secret");
  assert.deepEqual({ url: request.body.url, mode: request.body.downloadMode, codec: request.body.youtubeVideoCodec }, { url: "https://www.tiktok.com/@me/video/123", mode: "auto", codec: "h264" });
  assert.deepEqual(h.calls.downloads, ["https://cobalt.example.com/tunnel?id=1"]);
});

test("a Cobalt failure falls back to yt-dlp, with the residential proxy only for YouTube", async t => {
  const env = { COBALT_API_URL: "https://cobalt.example.com/", YTDLP_PATH: "/usr/local/bin/yt-dlp", YTDLP_PROXY: "http://user:pass-session-{session}@proxy.example.com:12321" };
  const h = setup(t, env, { cobalt: [{ status: "error", error: { code: "error.api.fetch.fail" } }, { status: 400 }] });
  const youtube = await h.downloader.download({ url: "https://www.youtube.com/watch?v=abc123def45", platform: "youtube" }, h.target, { maxBytes: 1024 });
  assert.equal(youtube.resolver, "residential-ytdlp");
  assert.equal(fs.readFileSync(h.target, "utf8"), "video-bytes");
  const proxy = h.calls.ytdlp[0].args[h.calls.ytdlp[0].args.indexOf("--proxy") + 1];
  assert.match(proxy, /^http:\/\/user:pass-session-[0-9a-f]{12}@proxy\.example\.com:12321$/);
  assert.ok(h.calls.ytdlp[0].args.includes("--merge-output-format"));
  assert.equal(h.calls.ytdlp[0].args.at(-1), "https://www.youtube.com/watch?v=abc123def45");

  await h.downloader.download({ url: "https://www.tiktok.com/@me/video/9", platform: "tiktok" }, path.join(h.dir, "second"), { maxBytes: 1024 });
  assert.ok(!h.calls.ytdlp[1].args.includes("--proxy"));
});

test("download failures explain themselves and unsupported sources are refused", async t => {
  const h = setup(t, { YTDLP_PATH: "/usr/local/bin/yt-dlp" }, { ytdlp: { fail: "ERROR: [youtube] abc: Private video. Sign in if you've been granted access" } });
  await assert.rejects(h.downloader.download({ url: "https://www.youtube.com/watch?v=abc123def45", platform: "youtube" }, h.target, { maxBytes: 1024 }), /private/);
  await assert.rejects(h.downloader.download({ url: "https://www.linkedin.com/feed/update/1", platform: "linkedin" }, h.target, { maxBytes: 1024 }), /cannot download videos from this platform/);
  const unconfigured = setup(t);
  assert.equal(unconfigured.downloader.supports("tiktok"), false);
  await assert.rejects(unconfigured.downloader.download({ url: "https://www.tiktok.com/@me/video/1", platform: "tiktok" }, unconfigured.target, { maxBytes: 1024 }), /not configured/);
});

test("YouTube lists a channel's recent public and unlisted uploads", async () => {
  const requests = [];
  const http = new HttpTransport({ fetcher: async url => {
    requests.push(url);
    if (url.includes("/channels?")) return Response.json({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }] });
    if (url.includes("/videos?")) return Response.json({ items: [{ id: "publicVid01", statistics: { viewCount: "1520", likeCount: "84", commentCount: "6" } }] });
    return Response.json({ items: [
      { contentDetails: { videoId: "publicVid01", videoPublishedAt: "2026-10-01T10:00:00Z" }, snippet: { title: "Launch", description: "Full caption", thumbnails: { high: { url: "https://i.ytimg.com/vi/publicVid01/hq.jpg" } } }, status: { privacyStatus: "public" } },
      { contentDetails: { videoId: "privateVid1" }, snippet: { title: "Secret" }, status: { privacyStatus: "private" } },
    ] });
  } });
  const videos = await new YouTubeProvider({ transport: http, env: {} }).recentVideos({ account: { remoteId: "UC123" }, credentials: { accessToken: "token" } });
  assert.deepEqual(videos, [{ id: "publicVid01", title: "Launch", caption: "Full caption", publishedAt: Date.parse("2026-10-01T10:00:00Z"), thumbnailUrl: "https://i.ytimg.com/vi/publicVid01/hq.jpg", url: "https://www.youtube.com/watch?v=publicVid01", metrics: { views: 1520, likes: 84, comments: 6 } }]);
  assert.match(requests[0], /channels\?part=contentDetails&id=UC123/);
  assert.match(requests[1], /playlistId=UU123/);
  assert.match(requests[2], /videos\?part=statistics&id=publicVid01$/);
});
