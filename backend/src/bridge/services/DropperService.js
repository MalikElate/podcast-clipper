import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { invariant, publicError } from "../core/errors.js";
import { clipVideoText, prepareVideoPush } from "./VideoPush.js";

const sourcePlatforms = new Set(["tiktok", "youtube", "instagram", "facebook", "threads"]);
const pending = new Set(["queued", "downloading", "submitting"]);
const CARD_TTL_MS = 10 * 60000;
const MINUTE = 60000;
const cardKey = (accountId, externalId) => createHash("sha256").update(`${accountId}:${externalId}`).digest("base64url").slice(0, 22);
const requestIdFor = id => `dropper-${createHash("sha256").update(id).digest("hex").slice(0, 32)}`;
const clone = value => JSON.parse(JSON.stringify(value));

/** A finite, reviewed batch. Only due videos enter the publishing queue. */
export class DropperService {
  constructor({ store, projects, accounts, registry, posts, media, videoSources, privacy, incomingDirectory, clock = () => Date.now(), enabled = true }) {
    Object.assign(this, { store, projects, accounts, registry, posts, media, videoSources, privacy, incomingDirectory, clock, enabled });
    this.decks = new Map();
    this.processing = new Map();
    this.stopVersions = new Map();
    this.running = false;
  }

  connectedAccounts(uid, projectId) {
    return this.videoSources.connectedAccounts(uid, projectId);
  }

  settings(uid, projectId) {
    this.projects.require(uid, projectId);
    const saved = this.store.get("dropperSettings", projectId);
    const own = saved?.ownerUid === uid ? saved : null;
    const connected = new Set(this.connectedAccounts(uid, projectId).map(account => account.id));
    const sourceAccountId = connected.has(own?.sourceAccountId) ? own.sourceAccountId : null;
    const accountIds = (own?.accountIds || []).filter(id => connected.has(id) && id !== sourceAccountId);
    return { sourceAccountId, accountIds, overrides: Object.fromEntries(Object.entries(own?.overrides || {}).filter(([id]) => accountIds.includes(id))), intervalMinutes: own?.intervalMinutes || 480, updatedAt: own?.updatedAt || null };
  }

  saveSettings(uid, projectId, input = {}) {
    this.projects.require(uid, projectId);
    invariant(input && typeof input === "object" && !Array.isArray(input), "Invalid Dropper settings.");
    invariant(["sourceAccountId", "accountIds", "intervalMinutes"].some(key => input[key] !== undefined), "Choose a source, destinations and posting interval.");
    const previous = this.settings(uid, projectId);
    const sourceAccountId = input.sourceAccountId === undefined ? previous.sourceAccountId : input.sourceAccountId;
    invariant(sourceAccountId === null || typeof sourceAccountId === "string" && sourceAccountId.length > 0 && sourceAccountId.length <= 200, "Choose one source account.");
    if (sourceAccountId) {
      const source = this.accounts.require(uid, projectId, sourceAccountId);
      invariant(source.ownerUid === uid && source.status === "connected" && sourcePlatforms.has(source.platform), "Choose a connected TikTok, YouTube, Instagram, Facebook or Threads source account.");
    }
    const accountIds = input.accountIds === undefined ? previous.accountIds : input.accountIds;
    invariant(Array.isArray(accountIds) && accountIds.length <= 100 && new Set(accountIds).size === accountIds.length && accountIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 200), "Choose destination accounts.");
    invariant(!accountIds.includes(sourceAccountId), "The source account cannot also be a destination.");
    accountIds.forEach(id => {
      const account = this.accounts.require(uid, projectId, id);
      invariant(account.ownerUid === uid && account.status === "connected", "Reconnect each destination account before using Dropper.");
    });
    const intervalMinutes = input.intervalMinutes === undefined ? previous.intervalMinutes : input.intervalMinutes;
    invariant(Number.isInteger(intervalMinutes) && intervalMinutes >= 1 && intervalMinutes <= 10080, "Choose a posting interval from 1 minute to 7 days.");
    const inputOverrides = input.overrides === undefined ? previous.overrides : input.overrides;
    invariant(inputOverrides && typeof inputOverrides === "object" && !Array.isArray(inputOverrides), "Invalid destination settings.");
    const overrides = {};
    for (const [id, value] of Object.entries(inputOverrides)) {
      invariant(accountIds.includes(id), "Destination settings must belong to a selected account.");
      invariant(value && typeof value === "object" && !Array.isArray(value) && (value.settings === undefined || value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)), "Invalid destination settings.");
      invariant(JSON.stringify(value.settings || {}).length <= 10000, "Destination settings are too large.");
      overrides[id] = { settings: clone(value.settings || {}) };
    }
    this.store.put("dropperSettings", { id: projectId, projectId, ownerUid: uid, sourceAccountId, accountIds, intervalMinutes, overrides, createdAt: this.clock(), updatedAt: this.clock() });
    this.decks.delete(`${uid}:${projectId}`);
    return this.settings(uid, projectId);
  }

  async deck(uid, projectId) {
    this.projects.require(uid, projectId);
    const settings = this.settings(uid, projectId), cards = [], sources = [];
    const source = this.connectedAccounts(uid, projectId).find(account => account.id === settings.sourceAccountId);
    if (source) {
      const { videos, error } = await this.videoSources.sourceVideos(source);
      // Recheck the connection after remote video lookups.
      const current = this.store.get("account", source.id);
      invariant(current?.ownerUid === uid && current.projectId === projectId && current.status === "connected" && current.authorizationId === source.authorizationId, "The source connection changed. Refresh and try again.", { status: 409 });
      sources.push({ accountId: source.id, accountName: source.label, platform: source.platform, videos: videos.length, error });
      const decisions = this.store.list("dropperItem", { projectId, ownerUid: uid, limit: null });
      const decided = new Set(decisions.filter(item => !["failed", "cancelled"].includes(item.status)).map(item => item.cardId));
      const copyPostIds = new Set([...decisions.map(item => item.postId), ...this.store.list("swipeDecision", { projectId, ownerUid: uid, limit: null }).map(item => item.postId)].filter(Boolean));
      const copies = new Set(this.store.list("delivery", { projectId, ownerUid: uid, limit: null }).filter(item => item.accountId === source.id && copyPostIds.has(item.postId) && item.externalId).map(item => String(item.externalId)));
      for (const video of videos) {
        const id = cardKey(source.id, video.externalId);
        if (decided.has(id) || copies.has(String(video.externalId))) continue;
        cards.push({ id, accountId: source.id, accountName: source.label, platform: source.platform, ...video, pushable: Boolean(video.directUrl) || this.videoSources.downloader.supports(source.platform) });
      }
    }
    cards.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    this.decks.set(`${uid}:${projectId}`, { at: this.clock(), sourceAccountId: settings.sourceAccountId, cards: cards.slice(0, 50) });
    return { cards: cards.slice(0, 50).map(({ directUrl, ...card }) => ({ ...card, previewUrl: directUrl })), sources, settings, ...this.state(uid, projectId) };
  }

  queue(uid, projectId) {
    return this.store.list("dropperItem", { projectId, ownerUid: uid, limit: null }).sort((a, b) => b.createdAt - a.createdAt || a.index - b.index).slice(0, 100).map(item => ({
      cardId: item.cardId, status: item.status, slotAt: item.slotAt, caption: clipVideoText(item.source?.caption, 140), thumbnailUrl: item.source?.thumbnailUrl || null, url: item.source?.url || null,
      platform: item.platform, accountId: item.accountId, accountIds: item.accountIds, intervalMinutes: item.intervalMinutes, createdAt: item.createdAt,
      ...(item.dispatchedAt ? { dispatchedAt: item.dispatchedAt } : {}),
      ...(item.postId ? { postId: item.postId, postStatus: (() => {
        const post = this.store.get("post", item.postId);
        return post?.ownerUid === uid && post.projectId === projectId ? this.posts.toPublic(post).status : "removed";
      })() } : {}),
      ...(item.rejected?.length ? { rejected: item.rejected } : {}), ...(item.error ? { error: item.error } : {}),
    }));
  }

  state(uid, projectId) {
    this.projects.require(uid, projectId);
    const run = this.store.get("dropperRun", projectId), own = run?.ownerUid === uid ? run : null;
    const items = this.store.list("dropperItem", { projectId, ownerUid: uid, limit: null }).filter(item => item.runId === own?.runId && pending.has(item.status));
    const inFlight = new Set([...items.filter(item => item.status !== "queued").map(item => item.id), ...[...this.processing].filter(([, value]) => value.uid === uid && value.projectId === projectId).map(([id]) => id)]).size;
    const running = own?.status === "running" && items.length > 0;
    return { queue: this.queue(uid, projectId), running, nextSlotAt: running ? Math.min(...items.map(item => item.slotAt)) : null, inFlight,
      run: own && (running || inFlight) ? { sourceAccountId: own.sourceAccountId, accountIds: own.accountIds, intervalMinutes: own.intervalMinutes } : null };
  }

  async start(uid, projectId, input = {}) {
    this.projects.require(uid, projectId);
    invariant(input && typeof input === "object" && !Array.isArray(input), "Select reviewed videos to start Dropper.");
    const cardIds = input.cardIds;
    invariant(Array.isArray(cardIds) && cardIds.length >= 1 && cardIds.length <= 50 && new Set(cardIds).size === cardIds.length && cardIds.every(id => typeof id === "string" && /^[\w-]{10,64}$/.test(id)), "Select between 1 and 50 reviewed videos to drop.");
    const active = this.store.get("dropperRun", projectId);
    if (active?.ownerUid === uid && active.status === "running") {
      invariant(JSON.stringify(active.cardIds) === JSON.stringify(cardIds), "Stop the current Dropper batch before starting another.", { status: 409, code: "dropper_running" });
      return { ...this.state(uid, projectId), duplicate: true };
    }
    invariant(![...this.processing.values()].some(item => item.uid === uid && item.projectId === projectId), "Dropper is finishing its current video. Wait a moment before starting another batch.", { status: 409, code: "dropper_in_flight" });
    const operationKey = `${uid}:${projectId}`, stopVersion = this.stopVersions.get(operationKey) || 0;
    const settings = clone(this.settings(uid, projectId));
    invariant(settings.sourceAccountId && settings.accountIds.length, "Choose a source and at least one destination before starting Dropper.", { status: 409, code: "dropper_settings_required" });
    let deck = this.decks.get(`${uid}:${projectId}`);
    if (!deck || deck.at <= this.clock() - CARD_TTL_MS || deck.sourceAccountId !== settings.sourceAccountId) {
      await this.deck(uid, projectId);
      deck = this.decks.get(`${uid}:${projectId}`);
    }
    const cards = cardIds.map(id => deck.cards.find(card => card.id === id));
    // A repeated completed start is harmless, while unavailable new videos need review again.
    const existing = cardIds.map(id => this.store.get("dropperItem", `${projectId}:${id}`));
    if (existing.every(item => item?.ownerUid === uid && !["failed", "cancelled"].includes(item.status))) return { ...this.state(uid, projectId), duplicate: true };
    invariant(cards.every(card => card && card.accountId === settings.sourceAccountId), "Some selected videos are no longer available. Refresh and review them again.", { status: 409, code: "dropper_review_required" });
    invariant(cards.every(card => card.pushable), "Meadow cannot download one of the selected videos from this platform yet.", { code: "video_source_unsupported" });
    let duplicate = false;
    this.store.transaction(() => {
      invariant((this.stopVersions.get(operationKey) || 0) === stopVersion, "Dropper was stopped while the source videos were loading.", { status: 409, code: "dropper_stopped" });
      const currentRun = this.store.get("dropperRun", projectId);
      if (currentRun?.status === "running") {
        invariant(currentRun.ownerUid === uid && JSON.stringify(currentRun.cardIds) === JSON.stringify(cardIds), "Dropper was started in another window. Refresh to see its queue.", { status: 409, code: "dropper_running" });
        duplicate = true;
        return;
      }
      const source = this.accounts.require(uid, projectId, settings.sourceAccountId);
      invariant(source.ownerUid === uid && source.status === "connected", "Reconnect the source account before starting Dropper.");
      const destinations = settings.accountIds.map(id => this.accounts.require(uid, projectId, id));
      invariant(destinations.every(account => account.ownerUid === uid && account.status === "connected"), "Reconnect each selected destination before starting Dropper.");
      const now = this.clock(), runId = randomUUID();
      const selected = cards.filter(card => {
        const prior = this.store.get("dropperItem", `${projectId}:${card.id}`);
        return !prior || ["cancelled", "failed"].includes(prior.status);
      });
      invariant(selected.length, "These videos are already in Dropper.", { status: 409 });
      this.store.put("dropperRun", { id: projectId, projectId, ownerUid: uid, runId, status: "running", cardIds, sourceAccountId: source.id, accountIds: [...settings.accountIds], intervalMinutes: settings.intervalMinutes, lastDispatchAt: null, createdAt: now, updatedAt: now });
      selected.forEach((card, index) => this.store.put("dropperItem", {
        id: `${projectId}:${card.id}`, projectId, ownerUid: uid, runId, cardId: card.id, index, status: "queued", slotAt: now + index * settings.intervalMinutes * MINUTE,
        intervalMinutes: settings.intervalMinutes, accountId: source.id, platform: source.platform, externalId: card.externalId,
        sourceAuthorizationId: source.authorizationId || null, sourceRemoteId: source.remoteId,
        accountIds: [...settings.accountIds], destinationIdentities: Object.fromEntries(destinations.map(account => [account.id, { authorizationId: account.authorizationId || null, remoteId: account.remoteId, platform: account.platform }])),
        overrides: clone(settings.overrides), source: { url: card.url, directUrl: card.directUrl, caption: card.caption, title: card.title, thumbnailUrl: card.thumbnailUrl, publishedAt: card.publishedAt },
        createdAt: now, updatedAt: now,
      }));
    });
    await this.store.flush?.();
    if (!duplicate) this.kick();
    return { ...this.state(uid, projectId), ...(duplicate ? { duplicate: true } : {}) };
  }

  recoverSubmission(item) {
    const submission = this.store.get("submission", `${item.ownerUid}:${requestIdFor(item.id)}`);
    if (!submission?.postIds?.[0]) return null;
    const post = this.store.get("post", submission.postIds[0]);
    return post?.ownerUid === item.ownerUid && post.projectId === item.projectId ? { postId: post.id, dispatchedAt: submission.createdAt } : null;
  }

  stop(uid, projectId) {
    this.projects.require(uid, projectId);
    const key = `${uid}:${projectId}`;
    this.stopVersions.set(key, (this.stopVersions.get(key) || 0) + 1);
    let cancelled = 0;
    this.store.transaction(() => {
      const run = this.store.get("dropperRun", projectId);
      if (run?.ownerUid === uid) this.store.put("dropperRun", { ...run, status: "stopped", updatedAt: this.clock() });
      for (const item of this.store.list("dropperItem", { projectId, ownerUid: uid, limit: null }).filter(item => pending.has(item.status))) {
        const committed = this.recoverSubmission(item);
        this.store.put("dropperItem", { ...item, ...(committed ? { status: "scheduled", ...committed } : { status: "cancelled", error: null }), updatedAt: this.clock() });
        if (!committed) cancelled++;
      }
    });
    return { ...this.state(uid, projectId), cancelled };
  }

  assertDispatchable(item) {
    this.projects.require(item.ownerUid, item.projectId);
    const current = this.store.get("dropperItem", item.id), run = this.store.get("dropperRun", item.projectId);
    invariant(current && pending.has(current.status) && run?.status === "running" && run.runId === item.runId && !this.privacy?.blocked(item.ownerUid), "Dropper was stopped before this video was queued.", { status: 409, code: "dropper_stopped" });
    const source = this.accounts.require(item.ownerUid, item.projectId, item.accountId);
    invariant(source.ownerUid === item.ownerUid && source.status === "connected" && (source.authorizationId || null) === item.sourceAuthorizationId && source.remoteId === item.sourceRemoteId && source.platform === item.platform, "The source connection changed. Start a new reviewed batch.", { status: 409, code: "dropper_connection_changed" });
    for (const id of item.accountIds) {
      const account = this.accounts.require(item.ownerUid, item.projectId, id), identity = item.destinationIdentities[id];
      invariant(id !== item.accountId && account.ownerUid === item.ownerUid && account.status === "connected" && identity && (account.authorizationId || null) === identity.authorizationId && account.remoteId === identity.remoteId && account.platform === identity.platform, "A selected destination connection changed. Start a new reviewed batch.", { status: 409, code: "dropper_connection_changed" });
    }
    return current;
  }

  kick() {
    if (this.enabled) setImmediate(() => this.tick().catch(error => console.error("Dropper worker:", error.code || error.name)));
  }

  /** Persist only a deadline, without account identities, for sleeping workers. */
  nextWakeAt() {
    const deadlines = [];
    for (const item of this.store.list("dropperItem", { limit: null }).filter(item => pending.has(item.status))) {
      const run = this.store.get("dropperRun", item.projectId);
      if (run?.status !== "running" || run.runId !== item.runId || this.privacy?.blocked(item.ownerUid)) continue;
      deadlines.push(item.status === "queued" ? item.slotAt : this.clock() + MINUTE);
    }
    // Rate limits and provider processing can defer an already submitted video.
    // Existing Posts share the same sleeping publishing worker.
    for (const delivery of this.store.list("delivery", { limit: null }).filter(item => ["queued", "scheduled", "retrying", "processing", "publishing"].includes(item.status))) {
      const account = this.store.get("account", delivery.accountId);
      if (account?.ownerUid === delivery.ownerUid && account.status === "connected" && !this.privacy?.blocked(delivery.ownerUid)) deadlines.push(delivery.status === "publishing" ? delivery.leaseUntil : delivery.dueAt);
    }
    const valid = deadlines.filter(at => Number.isSafeInteger(at) && at > 0);
    return valid.length ? Math.min(...valid) : null;
  }

  finishRun(projectId) {
    const run = this.store.get("dropperRun", projectId);
    if (run?.status === "running" && !this.store.list("dropperItem", { projectId, limit: null }).some(item => item.runId === run.runId && pending.has(item.status))) this.store.put("dropperRun", { ...run, status: "complete", updatedAt: this.clock() });
  }

  dispatched(item, result) {
    this.store.transaction(() => {
      const current = this.store.get("dropperItem", item.id);
      if (!current || current.runId !== item.runId) return;
      const at = result.dispatchedAt || this.clock();
      this.store.put("dropperItem", { ...current, status: "scheduled", postId: result.postId, dispatchedAt: at, error: null, updatedAt: this.clock() });
      const run = this.store.get("dropperRun", item.projectId);
      if (run?.runId !== item.runId) return;
      this.store.put("dropperRun", { ...run, lastDispatchAt: at, updatedAt: this.clock() });
      let slot = at + item.intervalMinutes * MINUTE;
      for (const later of this.store.list("dropperItem", { projectId: item.projectId, status: "queued", limit: null }).filter(entry => entry.runId === item.runId && entry.index > item.index).sort((a, b) => a.index - b.index)) {
        slot = Math.max(slot, later.slotAt);
        this.store.put("dropperItem", { ...later, slotAt: slot, updatedAt: this.clock() });
        slot += item.intervalMinutes * MINUTE;
      }
    });
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      for (const item of this.store.list("dropperItem", { limit: null }).filter(item => pending.has(item.status))) {
        const committed = this.recoverSubmission(item);
        if (committed) this.dispatched(item, committed);
        // With one repository writer, a persisted operation without a local
        // active task was interrupted by a restart. Its exact body is retained.
        else if (["downloading", "submitting"].includes(item.status) && !this.processing.has(item.id)) this.store.put("dropperItem", { ...item, status: "queued", updatedAt: this.clock() });
      }
      for (;;) {
        const next = this.store.list("dropperItem", { status: "queued", limit: null }).filter(item => {
          const run = this.store.get("dropperRun", item.projectId);
          return item.slotAt <= this.clock() && run?.status === "running" && run.runId === item.runId && !this.privacy?.blocked(item.ownerUid);
        }).sort((a, b) => a.slotAt - b.slotAt || a.index - b.index)[0];
        if (!next) break;
        await this.process(next);
      }
      for (const run of this.store.list("dropperRun", { status: "running", limit: null })) this.finishRun(run.projectId);
    } finally { try { await this.store.flush?.(); } finally { this.running = false; } }
  }

  async process(item) {
    this.processing.set(item.id, { uid: item.ownerUid, projectId: item.projectId });
    let ingested = null;
    const target = path.join(this.incomingDirectory, `dropper-${randomUUID()}`);
    const update = patch => {
      const current = this.store.get("dropperItem", item.id);
      return current && current.runId === item.runId && pending.has(current.status) ? this.store.put("dropperItem", { ...current, ...patch, updatedAt: this.clock() }) : null;
    };
    try {
      this.assertDispatchable(item);
      const committed = this.recoverSubmission(item);
      if (committed) { this.dispatched(item, committed); return; }
      let body = item.submissionBody;
      if (!body) {
        update({ status: "downloading" });
        await this.store.flush?.();
        this.assertDispatchable(item);
        const downloaded = await this.videoSources.downloader.download({ url: item.source.url, platform: item.platform, directUrl: item.source.directUrl }, target, { maxBytes: this.media.maxBytes });
        this.assertDispatchable(item);
        ingested = await this.media.ingest(item.ownerUid, item.projectId, { path: target, originalname: downloaded.filename?.endsWith(".mp4") ? downloaded.filename : `${item.platform}-${String(item.externalId).slice(0, 40)}.mp4` }, { source: "dropper" });
        this.assertDispatchable(item);
        invariant(ingested.kind === "video", "This source post is not a video, so Dropper did not queue it.");
        const project = this.projects.require(item.ownerUid, item.projectId);
        const prepared = await prepareVideoPush({ store: this.store, registry: this.registry, posts: this.posts, uid: item.ownerUid, projectId: item.projectId, source: item.source, media: ingested, accountIds: item.accountIds, overrides: item.overrides, schedule: { mode: "now", timeZone: project.timeZone } });
        this.assertDispatchable(item);
        update({ rejected: prepared.rejected });
        invariant(prepared.item.accountIds.length, `No destination accepted this video. ${prepared.rejected.map(entry => `${entry.accountName}: ${entry.errors[0]}`).join(" ")}`.trim(), { code: "invalid_content" });
        body = { requestId: requestIdFor(item.id), items: [prepared.item] };
        update({ status: "submitting", mediaId: ingested.id, submissionBody: clone(body) });
      } else update({ status: "submitting" });
      await this.store.flush?.();
      this.assertDispatchable(item);
      const result = await this.posts.submit(item.ownerUid, item.projectId, body, { beforeCommit: () => this.assertDispatchable(item) });
      this.dispatched(item, { postId: result.posts[0].id, dispatchedAt: this.clock() });
    } catch (error) {
      const committed = this.recoverSubmission(item);
      if (committed) this.dispatched(item, committed);
      else update({ status: error.code === "dropper_stopped" ? "cancelled" : "failed", error: error.code === "dropper_stopped" ? null : publicError(error).error });
    } finally {
      await fs.promises.unlink(target).catch(() => {});
      const current = this.store.get("dropperItem", item.id);
      // Remove unused downloads; submitted posts keep their media.
      const unusedMediaId = ingested?.id || current?.mediaId || item.mediaId;
      if (unusedMediaId && !current?.postId && (!current || ["cancelled", "failed"].includes(current.status))) await this.media.remove(item.ownerUid, item.projectId, unusedMediaId).catch(() => {});
      this.processing.delete(item.id);
      this.finishRun(item.projectId);
    }
  }

  /** Cancel frozen work and erase every reference to a removed connection. */
  removeAccount(account) {
    this.videoSources.invalidateAccount(account.id);
    const saved = this.store.get("dropperSettings", account.projectId);
    if (saved?.ownerUid === account.ownerUid) {
      const overrides = { ...saved.overrides }; delete overrides[account.id];
      this.store.put("dropperSettings", { ...saved, sourceAccountId: saved.sourceAccountId === account.id ? null : saved.sourceAccountId, accountIds: saved.accountIds.filter(id => id !== account.id), overrides, updatedAt: this.clock() });
    }
    let affected = false;
    for (const item of this.store.list("dropperItem", { ownerUid: account.ownerUid, limit: null })) {
      if (item.accountId === account.id) { this.store.remove("dropperItem", item.id); affected = true; continue; }
      if (!item.accountIds.includes(account.id)) continue;
      affected = true;
      const overrides = { ...item.overrides }, destinationIdentities = { ...item.destinationIdentities };
      delete overrides[account.id]; delete destinationIdentities[account.id];
      this.store.put("dropperItem", { ...item, accountIds: item.accountIds.filter(id => id !== account.id), overrides, destinationIdentities, rejected: (item.rejected || []).filter(entry => entry.accountId !== account.id), submissionBody: null, ...(pending.has(item.status) ? { status: "cancelled", error: null } : {}), updatedAt: this.clock() });
    }
    if (affected || saved?.sourceAccountId === account.id) {
      const run = this.store.get("dropperRun", account.projectId);
      if (run?.ownerUid === account.ownerUid) this.store.remove("dropperRun", run.id);
    }
    // Also erase a reviewed source that has never been started.
    for (const [key, deck] of this.decks) if (key === `${account.ownerUid}:${account.projectId}` || deck.sourceAccountId === account.id) this.decks.delete(key);
    // Erasure must invalidate any source lookup that is still awaiting a reply.
    const operationKey = `${account.ownerUid}:${account.projectId}`;
    this.stopVersions.set(operationKey, (this.stopVersions.get(operationKey) || 0) + 1);
  }

  removeOwner(uid) {
    this.videoSources.removeOwner(uid);
    for (const key of this.decks.keys()) if (key.startsWith(`${uid}:`)) this.decks.delete(key);
    for (const key of this.stopVersions.keys()) if (key.startsWith(`${uid}:`)) this.stopVersions.delete(key);
  }
}
