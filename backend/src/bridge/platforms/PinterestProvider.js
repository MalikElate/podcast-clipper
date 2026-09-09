import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";

export class PinterestProvider extends PlatformProvider {
  constructor(deps) { super("pinterest", deps); }
  get oauth() { return { authorize: "https://www.pinterest.com/oauth/", token: "https://api.pinterest.com/v5/oauth/token", clientId: this.env.PINTEREST_CLIENT_ID, clientSecret: this.env.PINTEREST_CLIENT_SECRET, basicAuth: true, scopes: ["user_accounts:read", "boards:read", "pins:read", "pins:write"], scopeSeparator: "," }; }
  request(path, credentials, options = {}) { return this.http.request(`https://api.pinterest.com/v5/${path}`, { token: credentials.accessToken, ...options }); }
  async accounts(credentials) {
    const user = await this.request("user_account", credentials);
    invariant(user.username, "Pinterest did not return an account.");
    return [{ remoteId: user.id || user.username, label: `@${user.username}`, avatar: user.profile_image, profileUrl: `https://www.pinterest.com/${user.username}/` }];
  }
  async options(account, credentials) {
    const boards = []; let bookmark;
    do {
      const result = await this.request(`boards?page_size=100${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ""}`, credentials);
      boards.push(...(result.items || []).map(board => ({ id: board.id, name: board.name }))); bookmark = result.bookmark;
    } while (bookmark && boards.length < 1000);
    return { ...await super.options(), boards };
  }
  validate(content) {
    const errors = super.validate(content);
    if (!content.settings?.boardId || !content.accountOptions?.boards?.some(board => board.id === content.settings.boardId)) errors.push("Choose a board from this Pinterest account.");
    if (content.settings?.link && !/^https?:\/\//.test(content.settings.link)) errors.push("The Pinterest destination link must start with https:// or http://.");
    return errors;
  }
  async publish(ctx) {
    if (ctx.content.media[0].kind !== "video") return this.createPin(ctx);
    if (ctx.progress.mediaId) return { status: "processing", progress: ctx.progress };
    const asset = await ctx.media.prepare(ctx.content.media[0], "mp4");
    invariant(asset.bytes <= this.capabilities.videoMaxBytes, "The video exceeds Pinterest's upload limit.");
    const start = await this.request("media", ctx.credentials, { method: "POST", json: { media_type: "video" }, safeToRetry: true });
    const host = new URL(start.upload_url).hostname;
    invariant(start.media_id && (host.endsWith(".amazonaws.com") || host.endsWith(".pinterest.com")), "Pinterest did not return a valid upload endpoint.");
    const form = new FormData();
    Object.entries(start.upload_parameters || {}).forEach(([key, value]) => form.set(key, String(value)));
    form.set("file", await ctx.media.storage.blob(asset.key, "video/mp4"), "video.mp4");
    await this.http.request(start.upload_url, { method: "POST", body: form, safeToRetry: true, timeoutMs: 15 * 60000 });
    const progress = { mediaId: start.media_id }; ctx.checkpoint(progress);
    return { status: "processing", progress, pollAfterMs: 15000 };
  }
  async poll(ctx) {
    const result = await this.request(`media/${ctx.progress.mediaId}`, ctx.credentials);
    if (result.status === "failed") throw new ProviderError("Pinterest could not process this video.");
    if (result.status !== "succeeded") return { status: "processing", progress: ctx.progress, pollAfterMs: 15000 };
    return this.createPin(ctx);
  }
  async createPin(ctx) {
    if (ctx.progress.publicationId) return { status: "published", externalId: ctx.progress.publicationId, url: `https://www.pinterest.com/pin/${ctx.progress.publicationId}/` };
    let source;
    if (ctx.content.media[0].kind === "video") source = { source_type: "video_id", media_id: ctx.progress.mediaId, cover_image_url: ctx.media.url(ctx.content.media[0], { variant: "thumbnail", external: true }) };
    else {
      const items = [];
      for (const item of ctx.content.media) { const asset = await ctx.media.prepare(item, "jpeg"); items.push({ url: ctx.media.url(item, { variant: asset.variant, external: true }) }); }
      source = items.length === 1 ? { source_type: "image_url", url: items[0].url } : { source_type: "multiple_image_urls", items };
    }
    const result = await this.request("pins", ctx.credentials, { method: "POST", json: { board_id: ctx.content.settings.boardId, title: ctx.content.title, description: ctx.content.caption, ...(ctx.content.settings.link ? { link: ctx.content.settings.link } : {}), media_source: source } });
    invariant(result.id, "Pinterest did not confirm a published Pin.", { code: "unconfirmed_publication" }); ctx.checkpoint({ publicationId: result.id });
    return { status: "published", externalId: result.id, url: `https://www.pinterest.com/pin/${result.id}/` };
  }
  async metrics({ credentials, delivery }) {
    const start = new Date(Math.max(delivery.publishedAt, Date.now() - 89 * 86400000)).toISOString().slice(0, 10), end = new Date().toISOString().slice(0, 10);
    const result = await this.request(`pins/${delivery.externalId}/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`, credentials);
    const m = result.all?.summary_metrics || {};
    return { values: { impressions: m.IMPRESSION, saves: m.SAVE, clicks: m.OUTBOUND_CLICK }, note: "Pinterest metrics cover at most the most recent 90 days. Outbound clicks are clicks to your destination link." };
  }
}
