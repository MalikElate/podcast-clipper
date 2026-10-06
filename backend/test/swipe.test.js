import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { BridgeApplication } from "../src/bridge/BridgeApplication.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { PlatformProvider } from "../src/bridge/platforms/PlatformProvider.js";
import { ProviderRegistry } from "../src/bridge/platforms/ProviderRegistry.js";
import { PUSH_SPACING_MS } from "../src/bridge/services/SwipeService.js";

class FakeProvider extends PlatformProvider {
  constructor(id, extra = {}) { super(id); Object.assign(this, extra); }
  get configured() { return true; }
  async options() { return { limits: [] }; }
}

const HOUR = 3600000;

function setup(t) {
  let now = Date.parse("2026-10-06T12:00:00Z");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-swipe-"));
  const clip = path.join(dir, "fixture.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x568:rate=10", "-f", "lavfi", "-i", "sine=frequency=440", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", clip]);
  const downloads = [];
  const videoDownloader = {
    failUrls: new Set(),
    supports: platform => ["tiktok", "youtube"].includes(platform),
    async download(source, destination) {
      downloads.push(source);
      if (this.failUrls.has(source.url)) throw new Error("download failed");
      await fs.promises.copyFile(clip, destination);
      return { filename: "source.mp4", bytes: fs.statSync(clip).size, resolver: "cobalt" };
    },
  };
  const youtube = new FakeProvider("youtube", {
    validate(content) { const errors = PlatformProvider.prototype.validate.call(this, content); if (!content.settings?.privacy) errors.push("Choose a YouTube visibility setting."); return errors; },
    recentVideos: async () => [{ id: "ytVideo0001", title: "Studio tour", caption: "Studio tour\nFull description", publishedAt: now - 2.5 * HOUR, thumbnailUrl: "https://i.ytimg.com/vi/ytVideo0001/hq.jpg", url: "https://www.youtube.com/watch?v=ytVideo0001" }] });
  const app = new BridgeApplication({
    store: new SqliteStore(), clock: () => now, videoDownloader,
    registry: new ProviderRegistry([new FakeProvider("tiktok"), youtube, new FakeProvider("x"), new FakeProvider("bluesky")]),
    env: { BRIDGE_DATA_DIR: dir, BRIDGE_ENCRYPTION_KEY: randomBytes(32).toString("base64"), BRIDGE_MEDIA_SIGNING_KEY: "test-signing-key", BRIDGE_PUBLIC_URL: "https://bridge.example", BRIDGE_APP_URL: "https://bridge.example", BRIDGE_PUBLISHING_ENABLED: "false" },
  });
  t.after(() => { app.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const project = app.projects.create("alice", { name: "Creator", timeZone: "America/Chicago" });
  const connect = (id, platform, remoteId = id) => app.store.put("account", { id, ownerUid: "alice", projectId: project.id, platform, remoteId, label: `@${id}`, rateKey: `${platform}:${id}`, status: "connected", authorizationId: `grant-${id}`, encryptedCredentials: app.vault.encrypt({ accessToken: `token-${id}` }, `account:${id}`) });
  connect("tiktok", "tiktok", "zernio:tiktok");
  connect("youtube", "youtube", "UC123");
  connect("x", "x");
  connect("bluesky", "bluesky");
  const tiktokPost = (id, extra = {}) => ({ id, externalId: id, title: `TikTok caption ${id} #meadow`, publishedAt: now - Number(id.at(-1)) * HOUR, url: `https://www.tiktok.com/@creator/video/${id}`, media: { type: "carousel", thumbnailUrl: null, items: [{ type: "image", url: `https://p16.tiktokcdn.com/${id}.webp`, thumbnail: null }] }, values: {}, ...extra });
  app.analytics.syncAccount = async account => account.platform === "tiktok" ? { posts: [tiktokPost("7000000001"), tiktokPost("7000000002"), tiktokPost("7000000003"), { ...tiktokPost("7000000004"), url: "https://www.tiktok.com/@creator/photo/7000000004" }] } : null;
  return { app, project, downloads, videoDownloader, now: () => now, advance: ms => { now += ms; } };
}

test("the deck lists recent videos from connected accounts, newest first", async t => {
  const h = setup(t);
  const deck = await h.app.swipe.deck("alice", h.project.id);
  assert.deepEqual(deck.cards.map(card => card.externalId), ["7000000001", "7000000002", "ytVideo0001", "7000000003"]);
  const tiktok = deck.cards[0];
  assert.equal(tiktok.platform, "tiktok");
  assert.equal(tiktok.embedUrl, "https://www.tiktok.com/embed/v2/7000000001");
  assert.equal(tiktok.thumbnailUrl, "https://p16.tiktokcdn.com/7000000001.webp");
  assert.equal(tiktok.pushable, true);
  assert.equal(deck.cards[2].embedUrl, "https://www.youtube.com/embed/ytVideo0001");
  assert.deepEqual(deck.sources.map(source => [source.platform, source.videos]).sort(), [["tiktok", 3], ["youtube", 1]]);
  assert.equal(deck.spacingHours, 8);
  await assert.rejects(h.app.swipe.deck("bob", h.project.id));
});

test("swiping right needs destinations, then queues pushes eight hours apart", async t => {
  const h = setup(t);
  const { cards } = await h.app.swipe.deck("alice", h.project.id);
  await assert.rejects(h.app.swipe.decide("alice", h.project.id, { cardId: cards[0].id, decision: "push" }), error => error.code === "swipe_settings_required");

  h.app.swipe.saveSettings("alice", h.project.id, { destinations: ["x", "youtube", "tiktok"], overrides: { youtube: { settings: { privacy: "public", madeForKids: false } } } });
  const first = await h.app.swipe.decide("alice", h.project.id, { cardId: cards[0].id, decision: "push" });
  assert.equal(first.decision.status, "queued");
  assert.equal(first.decision.slotAt, h.now());
  const second = await h.app.swipe.decide("alice", h.project.id, { cardId: cards[1].id, decision: "push" });
  assert.equal(second.decision.slotAt, h.now() + PUSH_SPACING_MS);
  const skipped = await h.app.swipe.decide("alice", h.project.id, { cardId: cards[3].id, decision: "skip" });
  assert.equal(skipped.decision.status, "skipped");
  const repeated = await h.app.swipe.decide("alice", h.project.id, { cardId: cards[0].id, decision: "push" });
  assert.equal(repeated.duplicate, true);

  const deck = await h.app.swipe.deck("alice", h.project.id);
  assert.deepEqual(deck.cards.map(card => card.externalId), ["ytVideo0001"]);
  assert.equal(deck.nextSlotAt, h.now() + 2 * PUSH_SPACING_MS);
  assert.deepEqual(deck.queue.map(item => item.status), ["queued", "queued"]);
});

test("pushes download the video and publish it to every other destination on schedule", async t => {
  const h = setup(t);
  const { cards } = await h.app.swipe.deck("alice", h.project.id);
  h.app.swipe.saveSettings("alice", h.project.id, { destinations: ["x", "youtube", "tiktok"], overrides: { youtube: { settings: { privacy: "public", madeForKids: false } } } });
  await h.app.swipe.decide("alice", h.project.id, { cardId: cards[0].id, decision: "push" });
  await h.app.swipe.decide("alice", h.project.id, { cardId: cards[2].id, decision: "push" });
  await h.app.swipe.tick();

  assert.deepEqual(h.downloads.map(source => source.url), ["https://www.tiktok.com/@creator/video/7000000001", "https://www.youtube.com/watch?v=ytVideo0001"]);
  const { queue } = await h.app.swipe.deck("alice", h.project.id);
  const [later, now] = queue;
  assert.equal(now.status, "scheduled", now.error);
  assert.equal(later.status, "scheduled", later.error);

  const firstPost = h.app.posts.get("alice", h.project.id, now.postId);
  // The TikTok source is not pushed back to itself.
  assert.deepEqual(firstPost.deliveries.map(item => item.accountId).sort(), ["x", "youtube"]);
  assert.ok(firstPost.deliveries.every(item => item.requestedAt === h.now()));
  assert.equal(firstPost.title, "TikTok caption 7000000001 #meadow");
  assert.equal(firstPost.media[0].kind, "video");

  const secondPost = h.app.posts.get("alice", h.project.id, later.postId);
  assert.deepEqual(secondPost.deliveries.map(item => item.accountId).sort(), ["tiktok", "x"]);
  assert.ok(secondPost.deliveries.every(item => item.requestedAt === h.now() + PUSH_SPACING_MS));
  // X allows 280 characters, so the long YouTube caption is shortened there only.
  assert.equal(secondPost.overrides.x?.caption, undefined);
  assert.equal(secondPost.caption, "Studio tour\nFull description");
});

test("destinations that reject a video are reported, and a failed push can be retried", async t => {
  const h = setup(t);
  const { cards } = await h.app.swipe.deck("alice", h.project.id);
  // YouTube without its required visibility settings rejects the video.
  h.app.swipe.saveSettings("alice", h.project.id, { destinations: ["x", "youtube"] });
  await h.app.swipe.decide("alice", h.project.id, { cardId: cards[0].id, decision: "push" });
  h.videoDownloader.failUrls.add(cards[1].url);
  await h.app.swipe.decide("alice", h.project.id, { cardId: cards[1].id, decision: "push" });
  await h.app.swipe.tick();
  const { queue } = await h.app.swipe.deck("alice", h.project.id);
  const done = queue.find(item => item.cardId === cards[0].id), failed = queue.find(item => item.cardId === cards[1].id);
  assert.equal(done.status, "scheduled");
  assert.deepEqual(done.rejected.map(item => item.accountId), ["youtube"]);
  assert.match(done.rejected[0].errors.join(" "), /visibility/);
  assert.equal(failed.status, "failed");
  assert.ok(failed.error);
  assert.equal(h.app.swipe.nextSlot(h.project.id), h.now() + PUSH_SPACING_MS);

  assert.deepEqual(h.app.swipe.undo("alice", h.project.id, cards[1].id), { undone: true });
  assert.throws(() => h.app.swipe.undo("alice", h.project.id, cards[0].id), error => error.code === "push_in_progress");
  const deck = await h.app.swipe.deck("alice", h.project.id);
  assert.ok(deck.cards.some(card => card.id === cards[1].id));
});

test("removing a connection clears its videos and destination from Swipe or Push", async t => {
  const h = setup(t);
  const { cards } = await h.app.swipe.deck("alice", h.project.id);
  h.app.swipe.saveSettings("alice", h.project.id, { destinations: ["x", "tiktok"] });
  await h.app.swipe.decide("alice", h.project.id, { cardId: cards[0].id, decision: "skip" });
  h.app.privacy.removeConnectionData(h.app.store.get("account", "tiktok"));
  assert.equal(h.app.store.list("swipeDecision").length, 0);
  assert.deepEqual(h.app.store.get("swipeSettings", h.project.id).destinations, ["x"]);
});
