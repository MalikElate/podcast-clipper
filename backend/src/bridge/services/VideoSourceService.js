import { publicError } from "../core/errors.js";

const VIDEO_TTL_MS = 15 * 60000;
const cardMetrics = ["views", "likes", "comments", "shares", "saves"];
const videoMetrics = (values = {}) => Object.fromEntries(cardMetrics.map(key => [key, values?.[key] === null || values?.[key] === undefined || values?.[key] === "" ? NaN : Number(values[key])]).filter(([, value]) => Number.isFinite(value) && value >= 0));

function tiktokEmbed(url) {
  const id = /\/video\/(\d+)/.exec(url || "")?.[1];
  return id ? `https://www.tiktok.com/player/v1/${id}?music_info=0&description=0&rel=0` : null;
}

/** Recent videos from connected accounts used to prepare reviewed Dropper batches. */
export class VideoSourceService {
  constructor({ store, accounts, registry, analytics, downloader, clock = () => Date.now() }) {
    Object.assign(this, { store, accounts, registry, analytics, downloader, clock });
    this.videoCache = new Map();
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
        videos.push({ externalId: String(post.externalId || post.id), caption: post.title || "", title: "", publishedAt: post.publishedAt || null, url: post.url, directUrl, metrics: videoMetrics(post.values),
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
      result = { videos: videos.map(video => ({ externalId: video.id, caption: video.caption || video.title, title: video.title, publishedAt: video.publishedAt, url: video.url, directUrl: null, metrics: videoMetrics(video.metrics), thumbnailUrl: video.thumbnailUrl,
        embedUrl: account.platform === "tiktok" ? tiktokEmbed(video.url) : `https://www.youtube.com/embed/${video.id}` })), error: null };
    } catch (error) { result = { videos: [], error: publicError(error).error }; }
    this.videoCache.set(account.id, { at: this.clock(), authorizationId: account.authorizationId, ownerUid: account.ownerUid, result });
    return result;
  }

  invalidateAccount(accountId) { this.videoCache.delete(accountId); }
  removeOwner(uid) {
    for (const [accountId, cached] of this.videoCache) if (cached.ownerUid === uid) this.videoCache.delete(accountId);
  }
}
