import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { invariant, publicError } from "../core/errors.js";

// Swipe or Push: a deck of the user's recent videos from their connected
// accounts. Swiping right downloads the video and publishes it to the user's
// chosen destinations. The first push goes out now and each later push waits
// eight hours after the one before it. Swiping left skips the video.

export const PUSH_SPACING_MS = 8 * 3600000;
const DECK_TTL_MS = 10 * 60000;
const VIDEO_TTL_MS = 15 * 60000;
const STALE_DOWNLOAD_MS = 30 * 60000;
const sourcePlatforms = new Set(["tiktok", "youtube", "instagram", "facebook", "threads"]);
const kind = "swipeDecision";

const cardKey = (accountId, externalId) => createHash("sha256").update(`${accountId}:${externalId}`).digest("base64url").slice(0, 22);
const clip = (text, limit) => { const characters = [...String(text || "")]; return characters.length > limit ? `${characters.slice(0, limit - 1).join("").trimEnd()}…` : characters.join(""); };

// TikTok's embed player shows just the video, which fits a 9:16 card.
function tiktokEmbed(url) {
  const id = /\/video\/(\d+)/.exec(url || "")?.[1];
  return id ? `https://www.tiktok.com/player/v1/${id}?music_info=0&description=0&rel=0` : null;
}

function videoTitle(source) {
  const line = String(source.title || source.caption || "").split("\n").map(value => value.trim()).find(Boolean) || "Video";
  return clip(line.replace(/[<>]/g, ""), 100);
}

/** A minute-precision local time at or after `epochMs` in `timeZone`. */
export function localDateTime(epochMs, timeZone) {
  const rounded = Math.ceil(epochMs / 60000) * 60000;
  return Temporal.Instant.fromEpochMilliseconds(rounded).toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
}

export class SwipeService {
  constructor({ store, projects, accounts, registry, analytics, posts, media, downloader, incomingDirectory, privacy, clock = () => Date.now(), enabled = true }) {
    Object.assign(this, { store, projects, accounts, registry, analytics, posts, media, downloader, incomingDirectory, privacy, clock, enabled });
    this.videoCache = new Map();
    this.decks = new Map();
    this.running = false;
  }

  connectedAccounts(uid, projectId) {
    return this.store.list("account", { projectId, limit: null }).filter(account => account.ownerUid === uid && account.status === "connected");
  }

  async sourceVideos(account) {
    if (account.remoteId?.startsWith("zernio:")) {
      const snapshot = await this.analytics.syncAccount(account);
      const videos = [];
      for (const post of snapshot?.posts || []) {
        const items = post.media?.items || [];
        const directUrl = items.find(item => item.type === "video" && item.url)?.url || null;
        // Zernio labels TikTok videos by their cover, so the post URL decides.
        const isVideo = account.platform === "tiktok" ? /\/video\/\d+/.test(post.url || "") : post.media?.type === "video" || Boolean(directUrl);
        if (!isVideo || !post.url) continue;
        videos.push({ externalId: String(post.externalId || post.id), caption: post.title || "", title: "", publishedAt: post.publishedAt || null, url: post.url, directUrl,
          thumbnailUrl: post.media?.thumbnailUrl || items.find(item => item.thumbnail)?.thumbnail || items.find(item => item.type === "image")?.url || null,
          embedUrl: account.platform === "tiktok" ? tiktokEmbed(post.url) : null });
      }
      return { videos, error: snapshot?.error || null };
    }
    const provider = this.registry.get(account.platform);
    if (typeof provider?.recentVideos !== "function") return { videos: [], error: null };
    const cached = this.videoCache.get(account.id);
    if (cached && cached.at > this.clock() - VIDEO_TTL_MS && cached.authorizationId === account.authorizationId) return cached.result;
    let result;
    try {
      const videos = await this.accounts.withCredentials(account, credentials => provider.recentVideos({ account, credentials }));
      result = { videos: videos.map(video => ({ externalId: video.id, caption: video.caption || video.title, title: video.title, publishedAt: video.publishedAt, url: video.url, directUrl: null, thumbnailUrl: video.thumbnailUrl, embedUrl: `https://www.youtube.com/embed/${video.id}` })), error: null };
    } catch (error) { result = { videos: [], error: publicError(error).error }; }
    this.videoCache.set(account.id, { at: this.clock(), authorizationId: account.authorizationId, result });
    return result;
  }

  async deck(uid, projectId) {
    this.projects.require(uid, projectId);
    const decisions = this.store.list(kind, { projectId, limit: null });
    const decided = new Set(decisions.map(item => item.cardId));
    // Never offer the copies Swipe or Push itself published.
    const pushedPosts = new Set(decisions.map(item => item.postId).filter(Boolean));
    const pushedCopies = new Set(this.store.list("delivery", { projectId, limit: null }).filter(item => pushedPosts.has(item.postId) && item.externalId).map(item => String(item.externalId)));
    const sources = [], cards = [];
    for (const account of this.connectedAccounts(uid, projectId).filter(item => sourcePlatforms.has(item.platform))) {
      const { videos, error } = await this.sourceVideos(account);
      sources.push({ accountId: account.id, platform: account.platform, accountName: account.label, videos: videos.length, error });
      for (const video of videos) {
        const id = cardKey(account.id, video.externalId);
        if (decided.has(id) || pushedCopies.has(video.externalId)) continue;
        cards.push({ id, accountId: account.id, accountName: account.label, platform: account.platform, ...video, pushable: Boolean(video.directUrl) || this.downloader.supports(account.platform) });
      }
    }
    cards.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    this.decks.set(`${uid}:${projectId}`, { at: this.clock(), cards });
    return {
      cards: cards.slice(0, 50).map(({ directUrl, ...card }) => ({ ...card, previewUrl: directUrl })),
      sources, settings: this.settings(uid, projectId), queue: this.queue(uid, projectId), nextSlotAt: this.nextSlot(projectId), spacingHours: PUSH_SPACING_MS / 3600000,
    };
  }

  async findCard(uid, projectId, cardId) {
    const cached = this.decks.get(`${uid}:${projectId}`);
    if (cached && cached.at > this.clock() - DECK_TTL_MS) {
      const card = cached.cards.find(item => item.id === cardId);
      if (card) return card;
    }
    await this.deck(uid, projectId);
    return this.decks.get(`${uid}:${projectId}`).cards.find(item => item.id === cardId) || null;
  }

  settings(uid, projectId) {
    this.projects.require(uid, projectId);
    const saved = this.store.get("swipeSettings", projectId);
    const connected = new Set(this.connectedAccounts(uid, projectId).map(account => account.id));
    const accountIds = (saved?.ownerUid === uid ? saved.accountIds : []).filter(id => connected.has(id));
    return { accountIds, overrides: Object.fromEntries(Object.entries(saved?.overrides || {}).filter(([id]) => accountIds.includes(id))), updatedAt: saved?.updatedAt || null };
  }

  saveSettings(uid, projectId, input = {}) {
    this.projects.require(uid, projectId);
    const accountIds = input.accountIds;
    invariant(Array.isArray(accountIds) && accountIds.length <= 100 && new Set(accountIds).size === accountIds.length && accountIds.every(id => typeof id === "string" && id.length <= 200), "Choose where pushed videos go.");
    accountIds.forEach(id => invariant(this.accounts.require(uid, projectId, id).status === "connected", "Reconnect this account before pushing videos to it."));
    const overrides = {};
    for (const [id, value] of Object.entries(input.overrides || {})) {
      if (!accountIds.includes(id)) continue;
      invariant(value && typeof value === "object" && !Array.isArray(value) && (value.settings === undefined || value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)), "Invalid destination settings.");
      invariant(JSON.stringify(value.settings || {}).length <= 10000, "Destination settings are too large.");
      overrides[id] = { settings: value.settings || {} };
    }
    const previous = this.store.get("swipeSettings", projectId);
    this.store.put("swipeSettings", { id: projectId, projectId, ownerUid: uid, accountIds, overrides, createdAt: previous?.createdAt || this.clock(), updatedAt: this.clock() });
    return this.settings(uid, projectId);
  }

  destinationsFor(uid, projectId, sourceAccountId) {
    return this.settings(uid, projectId).accountIds.filter(id => id !== sourceAccountId);
  }

  nextSlot(projectId) {
    const last = Math.max(0, ...this.store.list(kind, { projectId, limit: null }).filter(item => item.decision === "push" && item.status !== "failed").map(item => item.slotAt || 0));
    return Math.max(this.clock(), last ? last + PUSH_SPACING_MS : 0);
  }

  decisionView(record) {
    return { cardId: record.cardId, decision: record.decision, status: record.status, platform: record.platform, accountId: record.accountId,
      ...(record.decision === "push" ? { slotAt: record.slotAt, caption: clip(record.source?.caption, 140), thumbnailUrl: record.source?.thumbnailUrl || null, url: record.source?.url || null } : {}),
      ...(record.postId ? { postId: record.postId } : {}), ...(record.error ? { error: record.error } : {}), ...(record.rejected?.length ? { rejected: record.rejected } : {}), createdAt: record.createdAt };
  }

  queue(uid, projectId) {
    return this.store.list(kind, { projectId, limit: null }).filter(item => item.ownerUid === uid && item.decision === "push")
      .sort((a, b) => (b.slotAt || 0) - (a.slotAt || 0)).slice(0, 30).map(item => this.decisionView(item));
  }

  async decide(uid, projectId, { cardId, decision } = {}) {
    this.projects.require(uid, projectId);
    invariant(["push", "skip"].includes(decision), "Swipe right to push a video or left to skip it.");
    invariant(typeof cardId === "string" && /^[\w-]{10,64}$/.test(cardId), "Choose a video.");
    const id = `${projectId}:${cardId}`;
    const existing = this.store.get(kind, id);
    if (existing) return { decision: this.decisionView(existing), duplicate: true };
    const card = await this.findCard(uid, projectId, cardId);
    invariant(card, "This video is no longer in your deck. Refresh and try again.", { status: 404 });
    const now = this.clock();
    const base = { id, cardId, projectId, ownerUid: uid, accountId: card.accountId, platform: card.platform, externalId: card.externalId, decision, createdAt: now, updatedAt: now };
    if (decision === "skip") return { decision: this.decisionView(this.store.put(kind, { ...base, status: "skipped" })) };
    invariant(card.pushable, "Meadow cannot download videos from this platform yet.", { code: "video_source_unsupported" });
    invariant(this.destinationsFor(uid, projectId, card.accountId).length, "Choose where pushed videos go before swiping right.", { status: 409, code: "swipe_settings_required" });
    const record = this.store.transaction(() => this.store.get(kind, id) || this.store.put(kind, { ...base, status: "queued", slotAt: this.nextSlot(projectId),
      source: { url: card.url, directUrl: card.directUrl, caption: card.caption, title: card.title, thumbnailUrl: card.thumbnailUrl, publishedAt: card.publishedAt } }));
    await this.store.flush?.();
    this.kick();
    return { decision: this.decisionView(record) };
  }

  undo(uid, projectId, cardId) {
    this.projects.require(uid, projectId);
    const record = this.store.get(kind, `${projectId}:${cardId}`);
    invariant(record?.ownerUid === uid, "There is nothing to undo for this video.", { status: 404 });
    invariant(record.decision === "skip" || ["queued", "failed"].includes(record.status), "This video is already on its way. Cancel it from Posts instead.", { status: 409, code: "push_in_progress" });
    this.store.remove(kind, record.id);
    return { undone: true };
  }

  kick() {
    if (!this.enabled) return;
    setImmediate(() => this.tick().catch(error => console.error("Swipe or Push worker:", error.code || error.name)));
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      // A push interrupted by a restart starts its download again.
      for (const stale of this.store.list(kind, { status: "downloading", limit: null }).filter(item => item.updatedAt < this.clock() - STALE_DOWNLOAD_MS)) {
        this.store.put(kind, { ...stale, status: "queued", updatedAt: this.clock() });
      }
      for (;;) {
        const next = this.store.list(kind, { status: "queued", limit: null }).filter(item => !this.privacy?.blocked(item.ownerUid)).sort((a, b) => a.slotAt - b.slotAt || a.createdAt - b.createdAt)[0];
        if (!next) break;
        await this.process(next);
      }
    } finally {
      try { await this.store.flush?.(); } finally { this.running = false; }
    }
  }

  async process(decision) {
    const update = patch => {
      const current = this.store.get(kind, decision.id);
      return current ? this.store.put(kind, { ...current, ...patch, updatedAt: this.clock() }) : null;
    };
    if (!update({ status: "downloading", attempts: (decision.attempts || 0) + 1 })) return;
    await this.store.flush?.();
    const target = path.join(this.incomingDirectory, `swipe-${randomUUID()}`);
    try {
      const project = this.projects.require(decision.ownerUid, decision.projectId);
      const downloaded = await this.downloader.download({ url: decision.source.url, platform: decision.platform, directUrl: decision.source.directUrl }, target, { maxBytes: this.media.maxBytes });
      const filename = `${decision.platform}-${String(decision.externalId).slice(0, 40)}.mp4`;
      const media = await this.media.ingest(decision.ownerUid, decision.projectId, { path: target, originalname: downloaded.filename?.endsWith(".mp4") ? downloaded.filename : filename }, { source: "swipe" });
      invariant(media.kind === "video", "This post is not a video, so it was not pushed.");
      if (!this.store.get(kind, decision.id)) return;
      const result = await this.publish(project, decision, media);
      update({ status: "scheduled", postId: result.postId, mediaId: media.id, rejected: result.rejected, error: null });
    } catch (error) {
      update({ status: "failed", error: publicError(error).error });
    } finally {
      await fs.promises.unlink(target).catch(() => {});
    }
  }

  async publish(project, decision, media) {
    const uid = decision.ownerUid, settings = this.settings(uid, project.id);
    const accountIds = this.destinationsFor(uid, project.id, decision.accountId);
    invariant(accountIds.length, "Choose where pushed videos go.", { code: "swipe_settings_required" });
    const caption = decision.source.caption || "";
    const overrides = Object.fromEntries(accountIds.map(id => {
      const account = this.store.get("account", id), limit = this.registry.get(account.platform)?.capabilities?.captionLimit;
      return [id, { ...(settings.overrides[id]?.settings ? { settings: settings.overrides[id].settings } : {}), ...(limit && [...caption].length > limit ? { caption: clip(caption, limit) } : {}) }];
    }));
    const slotAt = Math.max(decision.slotAt, this.clock());
    const schedule = slotAt <= this.clock() + 60000 ? { mode: "now", timeZone: project.timeZone } : { mode: "scheduled", timeZone: project.timeZone, localDateTime: localDateTime(slotAt, project.timeZone) };
    const item = { caption, title: videoTitle(decision.source), mediaIds: [media.id], accountIds, overrides, format: "auto", schedule };
    // Send the video only to destinations that accept it, and report the rest.
    const preview = await this.posts.preview(uid, project.id, { items: [item] });
    const rejected = preview.rows[0].destinations.filter(destination => destination.errors.length).map(destination => ({ accountId: destination.accountId, accountName: destination.accountName, platform: destination.platform, errors: destination.errors.slice(0, 3) }));
    const accepted = accountIds.filter(id => !rejected.some(entry => entry.accountId === id));
    invariant(accepted.length, `No destination accepted this video. ${rejected.map(entry => `${entry.accountName}: ${entry.errors[0]}`).join(" ")}`.trim(), { code: "invalid_content" });
    const requestId = `swipe-${createHash("sha256").update(decision.id).digest("hex").slice(0, 32)}`;
    const result = await this.posts.submit(uid, project.id, { requestId, items: [{ ...item, accountIds: accepted, overrides: Object.fromEntries(accepted.map(id => [id, overrides[id]])) }] });
    return { postId: result.posts[0].id, rejected };
  }

  /** Remove a disconnected account's videos and destination from Swipe or Push. */
  removeAccount(account) {
    for (const record of this.store.list(kind, { ownerUid: account.ownerUid, limit: null }).filter(item => item.accountId === account.id)) this.store.remove(kind, record.id);
    const saved = this.store.get("swipeSettings", account.projectId);
    if (saved?.accountIds?.includes(account.id)) {
      const overrides = { ...saved.overrides }; delete overrides[account.id];
      this.store.put("swipeSettings", { ...saved, accountIds: saved.accountIds.filter(id => id !== account.id), overrides, updatedAt: this.clock() });
    }
    this.videoCache.delete(account.id);
  }
}
