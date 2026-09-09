import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { ProcessRunner } from "../src/bridge/core/ProcessRunner.js";

function fixture(t, pipeline = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-clipping-test-"));
  const env = { NODE_ENV: "test", BRIDGE_DATA_DIR: dir, BRIDGE_MEDIA_SIGNING_KEY: "test-key", BRIDGE_CLIPPING_ENABLED: "false", BRIDGE_PUBLISHING_ENABLED: "false" };
  const app = new BridgeApplication({ env, pipeline });
  const project = app.projects.create("alice", { name: "Clips", timeZone: "UTC" });
  t.after(async () => { await app.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { app, project, dir };
}
const input = { youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", numClips: 2, clipLengthSec: 10, ownsContent: true };

test("clipping renders real captioned vertical video and keeps independent, durable downloads", async t => {
  let source;
  const words = [{ word: "Hello", start: 0.1, end: 0.6 }, { word: "world", start: 0.7, end: 1.2 }, { word: "Another", start: 2.1, end: 2.7 }, { word: "moment", start: 2.8, end: 3.4 }];
  const h = fixture(t, {
    getVideoInfo: async () => ({ title: "Synthetic source", durationSec: 4 }),
    downloadVideo: async (url, dir) => { const output = path.join(dir, "source.mp4"); fs.copyFileSync(source, output); return output; },
    transcribeAudio: async audio => { assert.ok(fs.statSync(audio).size > 0); return words; },
    pickClips: async transcript => { assert.match(transcript, /Hello world/); return [{ title: "First moment", start: 0, end: 1.5, viralityScore: 72 }, { title: "Second moment", start: 2, end: 3.5, viralityScore: 91 }]; },
  });
  source = path.join(h.dir, "source.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=4:r=12", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", source]);
  const job = h.app.clipping.create("alice", h.project.id, input);
  assert.throws(() => h.app.clipping.get("bob", h.project.id, job.id), /not found/i);
  await h.app.clipping.tick();
  const result = h.app.clipping.get("alice", h.project.id, job.id);
  assert.equal(result.status, "done", result.error);
  assert.equal(result.clips.length, 2);
  assert.equal(result.clips[0].viralityScore, 91);
  for (const clip of result.clips) {
    assert.equal(clip.media.width, 1080); assert.equal(clip.media.height, 1920);
    assert.ok(clip.media.durationSec > 1); assert.ok(clip.transcript.length > 0);
    assert.match(clip.downloadUrl, /download=1/);
    assert.ok(fs.statSync(h.app.storage.path(h.app.media.require("alice", h.project.id, clip.mediaId).storageKey)).size > 0);
  }
  assert.equal(fs.existsSync(path.join(h.dir, "clipping", job.id)), false);
  const ticket = h.app.downloads.create("alice", h.project.id, result.clips.map(clip => clip.mediaId));
  assert.equal(h.app.downloads.consume(ticket.url.split("/").at(-1)).ids.length, 2);
  const reopened = new SqliteStore(path.join(h.dir, "bridge.sqlite"));
  assert.equal(reopened.get("clipJob", job.id).status, "done");
  assert.equal(reopened.list("media", { projectId: h.project.id }).length, 2);
  reopened.close();
  assert.equal(h.app.posts.list("alice", h.project.id).length, 0, "Downloading clips does not require publishing a post");
});

test("invalid sources return a client error and expired clipping claims recover", async t => {
  const h = fixture(t);
  assert.throws(() => h.app.clipping.create("alice", h.project.id, { ...input, youtubeUrl: "https://example.com/video" }), error => error.status === 400 && /YouTube/.test(error.message));
  const job = h.app.clipping.create("alice", h.project.id, input);
  h.app.store.put("clipJob", { ...job, status: "running", leaseUntil: Date.now() - 1 });
  await h.app.clipping.tick();
  assert.equal(h.app.clipping.get("alice", h.project.id, job.id).status, "error");
  assert.match(h.app.clipping.get("alice", h.project.id, job.id).error, /interrupted/i);
});

test("shutdown drains active jobs before closing durable storage", async t => {
  const h = fixture(t);
  h.app.worker.running = true;
  const drained = h.app.shutdown({ timeoutMs: 2000 });
  h.app.store.put("probe", { id: "still-open" });
  setTimeout(() => { h.app.worker.running = false; }, 30);
  assert.equal(await drained, true);
  assert.equal(h.app.store.db.open, false);
  // Teardown may close an already closed database safely.
  h.app.shutdown = async () => true;
});

test("media processes are bounded and report unavailable tools clearly", async () => {
  const runner = new ProcessRunner();
  await assert.rejects(runner.run(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 30 }), error => error.code === "media_processing_failed");
  await assert.rejects(runner.run("bridge-test-no-such-executable", []), error => error.code === "media_tools_unavailable");
});
