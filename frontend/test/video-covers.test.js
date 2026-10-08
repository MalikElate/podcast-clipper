import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { coverVideo, selectedCover, removeStaleCovers } from "../src/bridge/videoCover.js";

const video = { id: "video", filename: "clip.mp4", kind: "video", status: "ready", durationSec: 10, url: "/clip.mp4" };
test("cover eligibility, zero timestamp, and stale media cleanup preserve other account settings", () => {
  for (const platform of ["tiktok", "youtube", "instagram"]) assert.equal(coverVideo(platform, "video", {}, [video]), video);
  for (const format of ["story", "carousel", "image"]) assert.equal(coverVideo("instagram", format, {}, [video]), null);
  assert.equal(coverVideo("tiktok", "video", { deliveryMode: "inbox" }, [video]), null);
  assert.equal(coverVideo("facebook", "video", {}, [video]), null);
  assert.equal(coverVideo("youtube", "video", {}, [{ ...video, status: "processing" }]), null);
  assert.equal(selectedCover({ videoCover: { mediaId: "video", timestampMs: 0 } }, video).timestampMs, 0);
  assert.equal(selectedCover({ videoCover: { mediaId: "old", timestampMs: 0 } }, video), null);
  const overrides = { yt: { title: "Keep title", settings: { privacy: "private", videoCover: { mediaId: "video", timestampMs: 1000 } } }, ig: { settings: { other: true } } };
  assert.equal(removeStaleCovers(overrides, ["video"]), overrides);
  const next = removeStaleCovers(overrides, ["replacement"]);
  assert.deepEqual(next.yt, { title: "Keep title", settings: { privacy: "private" } });
  assert.equal(next.ig, overrides.ig);
  assert.ok(overrides.yt.settings.videoCover);
  assert.equal(removeStaleCovers(overrides, ["replacement"], ["yt"]), overrides, "already published destinations keep their saved settings");
});

test("composer and draft editor render cover controls for eligible selected destinations", async () => {
  const server = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  try {
    const { PostEditor, draftPost } = await server.ssrLoadModule("/src/bridge/Composer.jsx");
    const post = { key: "draft", mediaIds: ["video"], accountIds: ["tiktok", "instagram", "youtube"], format: "video", caption: "Caption", overrides: { youtube: { settings: { videoCover: { mediaId: "video", timestampMs: 3500 } } } }, schedule: { mode: "now" } };
    const accounts = post.accountIds.map(platform => ({ id: platform, platform, label: platform, status: "connected" }));
    const catalog = accounts.map(account => ({ id: account.platform, formats: ["video", "story"] }));
    const render = input => renderToStaticMarkup(createElement(PostEditor, { post: input, accounts, catalog, media: [video], onChange() {} }));
    const html = render(post);
    assert.equal((html.match(/Choose cover/g) || []).length, 2);
    assert.match(html, /Change cover/);
    assert.match(html, /Selected frame at 3.5s/);
    assert.match(html, /YouTube channel must allow custom thumbnails/);
    const draft = draftPost(post, { timeZone: "UTC" });
    assert.deepEqual(draft.overrides, post.overrides);
    draft.overrides.youtube.settings.videoCover.timestampMs = 5000;
    assert.equal(post.overrides.youtube.settings.videoCover.timestampMs, 3500);
    const hidden = structuredClone(post); hidden.overrides.tiktok = { settings: { deliveryMode: "inbox" } }; hidden.overrides.instagram = { format: "story" };
    assert.doesNotMatch(render(hidden), /Choose cover/);
  } finally { await server.close(); }
});
