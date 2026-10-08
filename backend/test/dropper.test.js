import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DropperService } from "../src/bridge/services/DropperService.js";
import { PostService } from "../src/bridge/services/PostService.js";
import { ProjectService } from "../src/bridge/services/ProjectService.js";
import { ScheduleService } from "../src/bridge/services/ScheduleService.js";
import { PublishingWorker } from "../src/bridge/services/PublishingWorker.js";
import { invariant } from "../src/bridge/core/errors.js";

// Domain tests use the repository interface, without native SQLite or live posts.
class MemoryStore {
  constructor(snapshot = []) { this.records = new Map(snapshot); this.sequence = 0; }
  snapshot() { return JSON.parse(JSON.stringify([...this.records])); }
  get(kind, id) { const item = this.records.get(`${kind}:${id}`); return item ? structuredClone(item) : null; }
  put(kind, item) { const saved = { ...structuredClone(item), revision: (this.get(kind, item.id)?.revision || 0) + 1 }; this.records.set(`${kind}:${item.id}`, saved); return this.get(kind, item.id); }
  list(kind, { projectId, ownerUid, status } = {}) { return [...this.records].filter(([key, item]) => key.startsWith(`${kind}:`) && (projectId === undefined || item.projectId === projectId) && (ownerUid === undefined || item.ownerUid === ownerUid) && (status === undefined || item.status === status)).map(([, item]) => structuredClone(item)); }
  remove(kind, id) { return this.records.delete(`${kind}:${id}`); }
  transaction(callback) { return callback(); }
  nextSequence() { return ++this.sequence; }
  async flush() {}
}
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const MINUTE = 60000;

function setup(t, { snapshot, at = Date.parse("2026-10-08T12:00:00Z") } = {}) {
  let now = at;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "meadow-dropper-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = new MemoryStore(snapshot);
  const projects = new ProjectService(store);
  if (!snapshot) {
    store.put("project", { id: "creator", ownerUid: "alice", timeZone: "America/Chicago" });
    for (const [id, platform] of [["source", "tiktok"], ["x", "x"], ["youtube", "youtube"], ["other", "tiktok"]]) store.put("account", { id, platform, projectId: "creator", ownerUid: "alice", status: "connected", label: `@${id}`, remoteId: `remote-${id}`, authorizationId: `grant-${id}`, rateKey: id });
    store.put("account", { id: "foreign", platform: "x", projectId: "creator", ownerUid: "bob", status: "connected", remoteId: "foreign" });
  }
  const h = { store, now: () => now, advance: ms => { now += ms; }, downloads: [], optionCalls: 0, downloadHook: null, optionHook: null, videos: [], blocked: false };
  h.videos = [1, 2, 3].map(index => ({ externalId: `740000000000000000${index}`, title: `Video ${index}`, caption: `Caption ${index}`, publishedAt: now - index * MINUTE, url: `https://www.tiktok.com/@source/video/740000000000000000${index}`, thumbnailUrl: `https://cdn.example/${index}.jpg`, metrics: { views: 10 }, embedUrl: `https://www.tiktok.com/player/v1/740000000000000000${index}` }));
  const accounts = {
    require(uid, projectId, id) { const account = projects.requireRecord(uid, projectId, "account", id); invariant(account.ownerUid === uid, "Account not found.", { status: 404 }); return account; },
    async options(uid, projectId, id) { this.require(uid, projectId, id); h.optionCalls++; await h.optionHook?.(h.optionCalls); return {}; },
  };
  const registry = { get(platform) { return { configured: true, capabilities: { captionLimit: platform === "x" ? 280 : 2200 }, validate(content) { return platform === "youtube" && !content.settings?.privacy ? ["Choose a YouTube visibility setting."] : []; } }; } };
  const media = {
    maxBytes: 1000000,
    require(uid, projectId, id) { const item = projects.requireRecord(uid, projectId, "media", id); invariant(item.ownerUid === uid, "Media not found."); return item; },
    async ingest(uid, projectId) { projects.require(uid, projectId); return store.put("media", { id: randomUUID(), ownerUid: uid, projectId, kind: "video", status: "ready" }); },
    toPublic(item) { return item; },
    async remove(uid, projectId, id) { this.require(uid, projectId, id); store.remove("media", id); },
  };
  const rates = { plan(key, proposed) { return new Map(proposed.map(item => [item.id, { dueAt: item.requestedAt, delayed: false }])); }, replan() {} };
  const posts = new PostService({ store, projects, accounts, registry, media, schedules: new ScheduleService({ clock: () => now }), rates, clock: () => now });
  const swipe = {
    connectedAccounts(uid, projectId) { return store.list("account", { projectId, ownerUid: uid }).filter(item => item.status === "connected"); },
    async sourceVideos(account) { h.lastSource = account.id; return { videos: h.videos, error: null }; },
    downloader: { supports: () => true, async download(source, filename) { h.downloads.push(source.url); await h.downloadHook?.(); await fs.promises.writeFile(filename, "video-fixture"); return { filename: "source.mp4" }; } },
  };
  h.dropper = new DropperService({ store, projects, accounts, registry, posts, media, swipe, privacy: { blocked: () => h.blocked }, incomingDirectory: directory, clock: () => now, enabled: false });
  h.posts = posts;
  h.configure = (input = {}) => h.dropper.saveSettings("alice", "creator", { sourceAccountId: "source", accountIds: ["x"], overrides: {}, intervalMinutes: 30, ...input });
  h.deck = () => h.dropper.deck("alice", "creator");
  h.start = cardIds => h.dropper.start("alice", "creator", { cardIds });
  return h;
}

test("Dropper requires one owned source, selected destinations, and a bounded integer interval", async t => {
  const h = setup(t);
  assert.equal((await h.deck()).cards.length, 0);
  assert.throws(() => h.configure({ sourceAccountId: "x" }), /source account/);
  assert.throws(() => h.configure({ accountIds: ["source"] }), /cannot also/);
  assert.throws(() => h.configure({ accountIds: ["foreign"] }), /Account not found/);
  for (const intervalMinutes of [0, 10081, 1.5, "30"]) assert.throws(() => h.configure({ intervalMinutes }), /posting interval/);
  h.configure({ intervalMinutes: 1 });
  const deck = await h.deck();
  assert.equal(deck.cards.length, 3);
  assert.equal(h.lastSource, "source");
  assert.equal(deck.settings.intervalMinutes, 1);
  await assert.rejects(h.dropper.deck("bob", "creator"), /Project not found/);
  await assert.rejects(h.start([]), /reviewed videos/);
});

test("reviewed videos retain selected order, immutable destinations and settings, and due-only spacing", async t => {
  const h = setup(t);
  h.configure({ accountIds: ["x", "youtube"], overrides: { youtube: { settings: { privacy: "public" } } } });
  const { cards } = await h.deck();
  const selected = [cards[2].id, cards[0].id, cards[1].id];
  const started = await h.start(selected);
  assert.deepEqual(started.queue.map(item => item.cardId), selected);
  assert.deepEqual(started.queue.map(item => item.slotAt), [h.now(), h.now() + 30 * MINUTE, h.now() + 60 * MINUTE]);
  assert.equal((await h.start(selected)).duplicate, true);
  await assert.rejects(h.start([cards[0].id]), error => error.code === "dropper_running");
  h.configure({ accountIds: ["other"], overrides: {}, intervalMinutes: 1 });
  await h.dropper.tick();
  assert.equal(h.downloads.length, 1);
  const first = h.dropper.state("alice", "creator").queue[0];
  assert.equal(first.status, "scheduled");
  const post = h.posts.get("alice", "creator", first.postId);
  assert.deepEqual(post.accountIds, ["x", "youtube"]);
  assert.equal(post.overrides.youtube.settings.privacy, "public");
  assert.equal(post.caption, "Caption 3");
  h.advance(29 * MINUTE);
  await h.dropper.tick();
  assert.equal(h.downloads.length, 1);
  h.advance(MINUTE);
  await h.dropper.tick();
  assert.equal(h.downloads.length, 2);
  assert.equal(h.store.list("delivery").length, 4);
  h.advance(30 * MINUTE);
  await h.dropper.tick();
  assert.equal(h.dropper.state("alice", "creator").running, false);
  assert.equal(h.store.list("post").length, 3);
});

test("downtime resumes the selected batch without dispatching a catch-up burst", async t => {
  const h = setup(t);
  h.configure();
  const { cards } = await h.deck();
  await h.start(cards.map(card => card.id));
  h.advance(2 * 86400000);
  const restarted = setup(t, { snapshot: h.store.snapshot(), at: h.now() });
  await restarted.dropper.tick();
  assert.equal(restarted.downloads.length, 1);
  const state = restarted.dropper.state("alice", "creator");
  assert.equal(state.running, true);
  assert.equal(state.nextSlotAt, restarted.now() + 30 * MINUTE);
  assert.equal(state.queue[2].slotAt, restarted.now() + 60 * MINUTE);
  await restarted.dropper.tick();
  assert.equal(restarted.downloads.length, 1);
});

test("restarting after post commit recovers its exact submission without another download or duplicate post", async t => {
  const h = setup(t);
  h.configure();
  const { cards } = await h.deck();
  await h.start(cards.map(card => card.id));
  await h.dropper.tick();
  const first = h.store.get("dropperItem", `creator:${cards[0].id}`);
  const { postId, dispatchedAt, ...interrupted } = first;
  h.store.put("dropperItem", { ...interrupted, status: "submitting" });
  h.advance(2 * 86400000);
  const restarted = setup(t, { snapshot: h.store.snapshot(), at: h.now() });
  await restarted.dropper.tick();
  assert.equal(restarted.store.list("post").length, 2);
  assert.equal(restarted.downloads.length, 1);
  assert.equal(restarted.store.get("dropperItem", first.id).postId, postId);
  assert.equal(restarted.dropper.state("alice", "creator").nextSlotAt, restarted.now() + 30 * MINUTE);
});

test("stop during download cancels every unsubmitted item and reports the finishing operation", async t => {
  const h = setup(t), entered = deferred(), release = deferred();
  h.configure();
  const { cards } = await h.deck();
  await h.start(cards.map(card => card.id));
  h.downloadHook = async () => { entered.resolve(); await release.promise; };
  const work = h.dropper.tick();
  await entered.promise;
  const stopped = h.dropper.stop("alice", "creator");
  assert.equal(stopped.cancelled, 3);
  assert.equal(stopped.running, false);
  assert.equal(stopped.inFlight, 1);
  await assert.rejects(h.start([cards[0].id]), error => error.code === "dropper_in_flight");
  release.resolve();
  await work;
  assert.equal(h.store.list("post").length, 0);
  assert.equal(h.dropper.state("alice", "creator").inFlight, 0);
  assert.equal(h.store.list("media").length, 0);
  const restarted = await h.start([cards[0].id]);
  assert.equal(restarted.running, true);
  assert.equal(restarted.queue[0].status, "queued");
  await h.dropper.tick();
  assert.equal(h.store.list("post").length, 1);
});

test("stop during submit's asynchronous account checks cannot create deliveries after stop", async t => {
  const h = setup(t), entered = deferred(), release = deferred();
  h.configure();
  const { cards } = await h.deck();
  await h.start([cards[0].id]);
  // First lookup belongs to preview; second belongs to the real PostService submit.
  h.optionHook = async call => { if (call === 2) { entered.resolve(); await release.promise; } };
  const work = h.dropper.tick();
  await entered.promise;
  assert.equal(h.dropper.stop("alice", "creator").cancelled, 1);
  release.resolve();
  await work;
  assert.equal(h.store.list("post").length, 0);
  assert.equal(h.store.list("delivery").length, 0);
});

test("stop preserves already submitted posts and cancels only the remaining queue", async t => {
  const h = setup(t);
  h.configure();
  const { cards } = await h.deck();
  await h.start(cards.map(card => card.id));
  await h.dropper.tick();
  const stopped = h.dropper.stop("alice", "creator");
  assert.equal(stopped.cancelled, 2);
  assert.deepEqual(stopped.queue.map(item => item.status), ["scheduled", "cancelled", "cancelled"]);
  assert.equal(h.store.list("delivery")[0].status, "queued");
  h.advance(86400000);
  await h.dropper.tick();
  assert.equal(h.store.list("post").length, 1);
});

test("source or destination removal during submit blocks a new post even before privacy purge", async t => {
  for (const accountId of ["source", "x"]) {
    const h = setup(t), entered = deferred(), release = deferred();
    h.configure();
    const { cards } = await h.deck();
    await h.start([cards[0].id]);
    h.optionHook = async call => { if (call === 2) { entered.resolve(); await release.promise; } };
    const work = h.dropper.tick();
    await entered.promise;
    h.store.put("account", { ...h.store.get("account", accountId), status: "deleting" });
    release.resolve();
    await work;
    assert.equal(h.store.list("post").length, 0);
    assert.equal(h.dropper.state("alice", "creator").queue[0].status, "failed");
  }
});

test("rejections preserve per-destination reasons and never publish to an unselected account", async t => {
  const h = setup(t);
  h.configure({ accountIds: ["x", "youtube"] });
  const { cards } = await h.deck();
  await h.start([cards[0].id]);
  await h.dropper.tick();
  const item = h.dropper.state("alice", "creator").queue[0];
  assert.equal(item.status, "scheduled");
  assert.deepEqual(item.rejected.map(entry => entry.accountId), ["youtube"]);
  assert.match(item.rejected[0].errors[0], /visibility/);
  assert.deepEqual(h.posts.get("alice", "creator", item.postId).accountIds, ["x"]);

  h.configure({ accountIds: ["youtube"] });
  const next = (await h.deck()).cards[0];
  await h.start([next.id]);
  await h.dropper.tick();
  const failed = h.dropper.state("alice", "creator").queue.find(entry => entry.cardId === next.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.rejected[0].accountId, "youtube");
  assert.equal(h.store.list("post").length, 1);
});

test("privacy account erasure clears settings, snapshots and source cache", async t => {
  const h = setup(t);
  h.configure({ accountIds: ["x", "youtube"], overrides: { youtube: { settings: { privacy: "public" } } } });
  const { cards } = await h.deck();
  await h.start(cards.map(card => card.id));
  h.dropper.removeAccount(h.store.get("account", "youtube"));
  assert.deepEqual(h.dropper.settings("alice", "creator").accountIds, ["x"]);
  assert.equal(h.store.list("dropperItem").every(item => item.status === "cancelled" && !item.destinationIdentities.youtube && !item.overrides.youtube && !item.accountIds.includes("youtube")), true);
  h.dropper.removeAccount(h.store.get("account", "source"));
  assert.equal(h.store.list("dropperItem").length, 0);
  assert.equal(h.dropper.decks.size, 0);
  assert.equal(h.dropper.settings("alice", "creator").sourceAccountId, null);
});

test("an unstarted reviewed source is erased from memory when its connection is removed", async t => {
  const h = setup(t);
  h.configure();
  await h.deck();
  assert.equal(h.dropper.decks.size, 1);
  h.dropper.removeAccount(h.store.get("account", "source"));
  assert.equal(h.dropper.decks.size, 0);
});

test("deleting a submitted post leaves a readable Dropper history", async t => {
  const h = setup(t);
  h.configure();
  const { cards } = await h.deck();
  await h.start([cards[0].id]);
  await h.dropper.tick();
  const postId = h.dropper.state("alice", "creator").queue[0].postId;
  h.store.remove("post", postId);
  assert.equal((await h.deck()).queue[0].postStatus, "removed");
});

test("an interrupted download restarts immediately and still dispatches only its reviewed video", async t => {
  const h = setup(t);
  h.configure();
  const { cards } = await h.deck();
  await h.start([cards[1].id]);
  const item = h.store.get("dropperItem", `creator:${cards[1].id}`);
  h.store.put("dropperItem", { ...item, status: "downloading" });
  const restarted = setup(t, { snapshot: h.store.snapshot(), at: h.now() });
  await restarted.dropper.tick();
  assert.deepEqual(restarted.downloads, [cards[1].url]);
  assert.equal(restarted.store.list("post").length, 1);
});

test("a frozen prepared submission survives restart without creating new media", async t => {
  const h = setup(t);
  h.configure();
  const { cards } = await h.deck();
  await h.start([cards[0].id]);
  const originalSubmit = h.posts.submit.bind(h.posts);
  h.posts.submit = async () => { throw new Error("simulated process exit before commit"); };
  await h.dropper.tick();
  const item = h.store.get("dropperItem", `creator:${cards[0].id}`);
  // Retain the media row, as a real abrupt process exit does before finally runs.
  h.store.put("media", { id: item.mediaId, ownerUid: "alice", projectId: "creator", kind: "video", status: "ready" });
  h.store.put("dropperItem", { ...item, status: "submitting" });
  h.store.put("dropperRun", { ...h.store.get("dropperRun", "creator"), status: "running" });
  const restarted = setup(t, { snapshot: h.store.snapshot(), at: h.now() });
  await restarted.dropper.tick();
  assert.equal(restarted.downloads.length, 0);
  const post = restarted.store.list("post")[0];
  assert.deepEqual(post.mediaIds, item.submissionBody.items[0].mediaIds);
  assert.equal(restarted.store.list("media").length, 1);
  h.posts.submit = originalSubmit;
});

test("a source feed suppresses Meadow-created copies only on their destination account", async t => {
  const h = setup(t);
  h.configure();
  h.store.put("swipeDecision", { id: "prior", projectId: "creator", ownerUid: "alice", postId: "pushed" });
  h.store.put("delivery", { id: "copy", projectId: "creator", ownerUid: "alice", postId: "pushed", accountId: "source", externalId: h.videos[0].externalId });
  h.store.put("delivery", { id: "different-account", projectId: "creator", ownerUid: "alice", postId: "pushed", accountId: "other", externalId: h.videos[1].externalId });
  const deck = await h.deck();
  assert.deepEqual(deck.cards.map(card => card.externalId), h.videos.slice(1).map(video => video.externalId));
});

test("simultaneous identical starts remain idempotent after both await a fresh source feed", async t => {
  const h = setup(t), entered = deferred(), release = deferred();
  h.configure();
  const { cards } = await h.deck();
  h.configure(); // Invalidate the reviewed cache so both calls await a refresh.
  let reads = 0;
  h.dropper.swipe.sourceVideos = async () => { if (++reads === 2) entered.resolve(); await release.promise; return { videos: h.videos, error: null }; };
  const first = h.start([cards[0].id]), second = h.start([cards[0].id]);
  await entered.promise;
  release.resolve();
  const results = await Promise.all([first, second]);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.equal(h.store.list("dropperItem").length, 1);
});

test("stop while the initial source feed loads invalidates the pending start", async t => {
  const h = setup(t), entered = deferred(), release = deferred();
  h.configure();
  const { cards } = await h.deck();
  h.configure();
  h.dropper.swipe.sourceVideos = async () => { entered.resolve(); await release.promise; return { videos: h.videos, error: null }; };
  const starting = h.start([cards[0].id]);
  await entered.promise;
  h.dropper.stop("alice", "creator");
  release.resolve();
  await assert.rejects(starting, error => error.code === "dropper_stopped");
  assert.equal(h.store.list("dropperItem").length, 0);
});

test("a failed restored submission removes its unused persisted media", async t => {
  const h = setup(t);
  h.configure();
  const { cards } = await h.deck();
  await h.start([cards[0].id]);
  h.posts.submit = async () => { throw new Error("simulated exit before commit"); };
  await h.dropper.tick();
  const item = h.store.get("dropperItem", `creator:${cards[0].id}`);
  h.store.put("media", { id: item.mediaId, ownerUid: "alice", projectId: "creator", kind: "video", status: "ready" });
  h.store.put("dropperItem", { ...item, status: "submitting" });
  h.store.put("dropperRun", { ...h.store.get("dropperRun", "creator"), status: "running" });
  const restarted = setup(t, { snapshot: h.store.snapshot(), at: h.now() });
  restarted.posts.submit = async () => { throw new Error("provider unavailable"); };
  await restarted.dropper.tick();
  assert.equal(restarted.downloads.length, 0);
  assert.equal(restarted.store.list("media").length, 0);
  assert.equal(restarted.dropper.state("alice", "creator").queue[0].status, "failed");
});

test("wake deadlines follow active drops and rate-delayed deliveries, and clear when work stops", async t => {
  const h = setup(t);
  h.configure({ intervalMinutes: 7 * 24 * 60 });
  assert.equal(h.dropper.nextWakeAt(), null);
  const { cards } = await h.deck();
  await h.start([cards[0].id, cards[1].id]);
  assert.equal(h.dropper.nextWakeAt(), h.now());
  await h.dropper.tick();
  const delivery = h.store.list("delivery")[0];
  h.store.put("delivery", { ...delivery, status: "retrying", dueAt: h.now() + 3 * 3600000 });
  assert.equal(h.dropper.nextWakeAt(), h.now() + 3 * 3600000);
  h.store.put("delivery", { ...delivery, status: "published" });
  assert.equal(h.dropper.nextWakeAt(), h.now() + 7 * 86400000);
  h.dropper.stop("alice", "creator");
  assert.equal(h.dropper.nextWakeAt(), null);
  for (const status of ["needs_account", "needs_review", "cancelled", "failed"]) {
    h.store.put("delivery", { ...delivery, status });
    assert.equal(h.dropper.nextWakeAt(), null);
  }
  h.store.put("delivery", { ...delivery, status: "queued" });
  h.blocked = true;
  assert.equal(h.dropper.nextWakeAt(), null);
});

test("an interrupted publishing lease wakes for review recovery, without resending the post", t => {
  const h = setup(t);
  h.store.put("delivery", { id: "interrupted", accountId: "x", ownerUid: "alice", projectId: "creator", status: "publishing", dueAt: h.now(), leaseUntil: h.now() + 90000 });
  assert.equal(h.dropper.nextWakeAt(), h.now() + 90000);
  h.advance(90001);
  const worker = new PublishingWorker({ store: h.store, clock: h.now });
  worker.recover();
  assert.equal(h.store.get("delivery", "interrupted").status, "needs_review");
  assert.equal(h.dropper.nextWakeAt(), null);
  h.store.put("delivery", { ...h.store.get("delivery", "interrupted"), status: "published" });
  assert.equal(h.dropper.nextWakeAt(), null);
});
