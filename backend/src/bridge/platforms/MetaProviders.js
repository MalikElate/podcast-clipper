import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";
import { inferFormat } from "./catalog.js";

class GraphProvider extends PlatformProvider {
  async graph(path, credentials, { method = "GET", body, ...options } = {}) {
    const form = body ? Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined).map(([key, value]) => [key, typeof value === "object" ? JSON.stringify(value) : String(value)])) : undefined;
    return this.http.request(`${this.graphBase}/${path}`, { method, token: credentials.accessToken, form, ...options });
  }
  async externalAsset(ctx, item) {
    const asset = await ctx.media.prepare(item, item.kind === "image" ? "jpeg" : "mp4");
    const limit = this.capabilities[`${item.kind}MaxBytes`];
    invariant(!limit || asset.bytes <= limit, `The converted media exceeds ${this.capabilities.name}'s file size limit.`);
    return { asset, url: ctx.media.url(item, { variant: asset.variant, external: true }) };
  }
}

export class InstagramProvider extends GraphProvider {
  constructor(deps) { super("instagram", deps); }
  get graphBase() { return `https://graph.instagram.com/${this.env.META_GRAPH_VERSION || "v24.0"}`; }
  get oauth() { return { authorize: "https://www.instagram.com/oauth/authorize", token: "https://api.instagram.com/oauth/access_token", clientId: this.env.INSTAGRAM_CLIENT_ID, clientSecret: this.env.INSTAGRAM_CLIENT_SECRET, scopes: ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"], scopeSeparator: ",", extra: { enable_fb_login: "false", force_reauth: "true" } }; }
  async exchange(input) {
    const short = await super.exchange(input);
    const result = await this.http.request(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(this.oauth.clientSecret)}&access_token=${encodeURIComponent(short.accessToken)}`);
    return this.normalizeToken(result);
  }
  async refresh(credentials) { return { ...credentials, ...this.normalizeToken(await this.http.request(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(credentials.accessToken)}`)) }; }
  async accounts(credentials) {
    const profile = await this.graph("me?fields=id,user_id,username,profile_picture_url", credentials);
    return [{ remoteId: String(profile.user_id || profile.id), label: `@${profile.username}`, avatar: profile.profile_picture_url, profileUrl: `https://www.instagram.com/${profile.username}/`, credentials: { metaUserIds: [...new Set([profile.id, profile.user_id].filter(Boolean).map(String))] } }];
  }
  async options(account, credentials) {
    const response = await this.graph(`${account.remoteId}/content_publishing_limit?fields=quota_usage,config`, credentials);
    const data = response.data?.[0] || {};
    const limit = Number(data.config?.quota_total) || 100, used = Number(data.quota_usage) || 0, windowMs = (Number(data.config?.quota_duration) || 86400) * 1000;
    return { limit, remaining: Math.max(0, limit - used), resetAt: null, limits: [{ limit, windowMs, used, observedAt: Date.now(), source: "Instagram publishing limit" }], note: "Instagram uses a moving 24-hour window. Future availability is estimated and checked again before delivery." };
  }
  async publish(ctx) {
    if (ctx.progress.containerId) return { status: "processing", progress: ctx.progress };
    const format = ctx.content.format === "auto" ? inferFormat(ctx.content.media) : ctx.content.format;
    let body;
    if (format === "carousel") {
      const children = [...(ctx.progress.children || [])];
      for (let i = children.length; i < ctx.content.media.length; i++) {
        const item = ctx.content.media[i], { url } = await this.externalAsset(ctx, item);
        const child = await this.graph(`${ctx.account.remoteId}/media`, ctx.credentials, { method: "POST", safeToRetry: true, body: { is_carousel_item: true, ...(item.kind === "video" ? { media_type: "VIDEO", video_url: url } : { image_url: url }) } });
        invariant(child.id, "Instagram did not create a carousel item."); children.push(child.id); await ctx.checkpoint({ children });
      }
      for (const childId of children) {
        const child = await this.graph(`${childId}?fields=status_code`, ctx.credentials);
        if (["ERROR", "EXPIRED"].includes(child.status_code)) throw new ProviderError("Instagram could not process a carousel item.");
        if (child.status_code !== "FINISHED") return { status: "processing", progress: { children, phase: "children" } };
      }
      body = { media_type: "CAROUSEL", children: children.join(","), caption: ctx.content.caption };
    } else {
      const item = ctx.content.media[0], { url } = await this.externalAsset(ctx, item);
      body = { ...(item.kind === "video" ? { media_type: format === "story" ? "STORIES" : "REELS", video_url: url, ...(format !== "story" ? { share_to_feed: true } : {}) } : { image_url: url, ...(format === "story" ? { media_type: "STORIES" } : {}) }), ...(format !== "story" ? { caption: ctx.content.caption } : {}) };
    }
    const container = await this.graph(`${ctx.account.remoteId}/media`, ctx.credentials, { method: "POST", body, safeToRetry: true });
    invariant(container.id, "Instagram did not create a media container.");
    await ctx.checkpoint({ containerId: container.id, phase: "container" });
    return { status: "processing", progress: { containerId: container.id, phase: "container" } };
  }
  async poll(ctx) {
    if (ctx.progress.phase === "children") return this.publish(ctx);
    if (ctx.progress.publicationId) return this.published(ctx, ctx.progress.publicationId);
    const container = await this.graph(`${ctx.progress.containerId}?fields=status_code,status`, ctx.credentials);
    if (["ERROR", "EXPIRED"].includes(container.status_code)) throw new ProviderError("Instagram could not process this media. Check the media format and dimensions.");
    if (ctx.progress.phase === "finalizing" || container.status_code === "PUBLISHED") throw new ProviderError("Instagram may have published this post. Check the account before retrying.", { uncertain: true });
    if (container.status_code !== "FINISHED") return { status: "processing", progress: ctx.progress };
    await ctx.checkpoint({ phase: "finalizing" });
    let result;
    try {
      result = await this.graph(`${ctx.account.remoteId}/media_publish`, ctx.credentials, { method: "POST", body: { creation_id: ctx.progress.containerId } });
      invariant(result.id, "Instagram did not confirm a published media ID.", { code: "unconfirmed_publication" });
    } catch (error) { if (!error.uncertain) await ctx.checkpoint({ phase: "container" }); throw error; }
    await ctx.checkpoint({ publicationId: result.id });
    return this.published(ctx, result.id);
  }
  async published(ctx, id) {
    let url = null;
    try { url = (await this.graph(`${id}?fields=permalink`, ctx.credentials)).permalink; } catch { /* The confirmed post remains published if permalink lookup fails. */ }
    return { status: "published", externalId: id, url };
  }
  async metrics({ credentials, delivery }) {
    const values = {}, unavailable = [];
    for (const metric of ["views", "likes", "comments", "shares", "saved"]) {
      try {
        const result = await this.graph(`${delivery.externalId}/insights?metric=${metric}`, credentials);
        values[metric === "saved" ? "saves" : metric] = result.data?.[0]?.values?.[0]?.value ?? result.data?.[0]?.total_value?.value;
      } catch (error) { if (error.reconnect) throw error; unavailable.push(metric); }
    }
    return { values, note: unavailable.length ? "Some Instagram metrics are not available for this post type or account." : null };
  }
}

export class ThreadsProvider extends GraphProvider {
  constructor(deps) { super("threads", deps); }
  get graphBase() { return "https://graph.threads.net/v1.0"; }
  get oauth() { return { authorize: "https://threads.com/oauth/authorize", token: "https://graph.threads.net/oauth/access_token", clientId: this.env.THREADS_CLIENT_ID, clientSecret: this.env.THREADS_CLIENT_SECRET, scopes: ["threads_basic", "threads_content_publish", "threads_manage_insights"], scopeSeparator: "," }; }
  async exchange(input) {
    const short = await super.exchange(input);
    return this.normalizeToken(await this.http.request(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(this.oauth.clientSecret)}&access_token=${encodeURIComponent(short.accessToken)}`));
  }
  async refresh(credentials) { return { ...credentials, ...this.normalizeToken(await this.http.request(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(credentials.accessToken)}`)) }; }
  async accounts(credentials) {
    const profile = await this.graph("me?fields=id,username,threads_profile_picture_url", credentials);
    return [{ remoteId: String(profile.id), label: `@${profile.username}`, avatar: profile.threads_profile_picture_url, profileUrl: `https://www.threads.net/@${profile.username}`, credentials: { metaUserIds: [String(profile.id)] } }];
  }
  async options(account, credentials) {
    const result = await this.graph(`${account.remoteId}/threads_publishing_limit?fields=quota_usage,config`, credentials);
    const data = result.data?.[0];
    if (!data?.config?.quota_total) return super.options();
    const limit = Number(data.config.quota_total), used = Number(data.quota_usage) || 0;
    return { limit, remaining: Math.max(0, limit - used), resetAt: null, limits: [{ limit, used, windowMs: (Number(data.config.quota_duration) || 86400) * 1000, observedAt: Date.now() }], note: "Threads uses a moving publishing window; future availability is checked again before delivery." };
  }
  async publish(ctx) {
    if (ctx.progress.containerId) return { status: "processing", progress: ctx.progress };
    const format = inferFormat(ctx.content.media);
    let body = { media_type: "TEXT", text: ctx.content.caption };
    if (format === "carousel") {
      const children = [...(ctx.progress.children || [])];
      for (let i = children.length; i < ctx.content.media.length; i++) {
        const item = ctx.content.media[i], { url } = await this.externalAsset(ctx, item);
        const child = await this.graph(`${ctx.account.remoteId}/threads`, ctx.credentials, { method: "POST", safeToRetry: true, body: { is_carousel_item: true, media_type: item.kind.toUpperCase(), [item.kind === "video" ? "video_url" : "image_url"]: url } });
        invariant(child.id, "Threads did not create a carousel item."); children.push(child.id); await ctx.checkpoint({ children });
      }
      for (const childId of children) {
        const child = await this.graph(`${childId}?fields=status`, ctx.credentials);
        if (["ERROR", "EXPIRED"].includes(child.status)) throw new ProviderError("Threads could not process a carousel item.");
        if (child.status !== "FINISHED") return { status: "processing", progress: { children, phase: "children" } };
      }
      body = { media_type: "CAROUSEL", children: children.join(","), text: ctx.content.caption };
    } else if (ctx.content.media.length) {
      const item = ctx.content.media[0], { url } = await this.externalAsset(ctx, item);
      body = { media_type: item.kind.toUpperCase(), [item.kind === "video" ? "video_url" : "image_url"]: url, text: ctx.content.caption };
    }
    const result = await this.graph(`${ctx.account.remoteId}/threads`, ctx.credentials, { method: "POST", body, safeToRetry: true });
    invariant(result.id, "Threads did not create a post container."); await ctx.checkpoint({ containerId: result.id, phase: "container" });
    return { status: "processing", progress: { containerId: result.id, phase: "container" } };
  }
  async poll(ctx) {
    if (ctx.progress.phase === "children") return this.publish(ctx);
    if (ctx.progress.publicationId) return this.published(ctx, ctx.progress.publicationId);
    const container = await this.graph(`${ctx.progress.containerId}?fields=status,error_message`, ctx.credentials);
    if (["ERROR", "EXPIRED"].includes(container.status)) throw new ProviderError("Threads could not process this media.");
    if (ctx.progress.phase === "finalizing" || container.status === "PUBLISHED") throw new ProviderError("Threads may have published this post. Check the account before retrying.", { uncertain: true });
    if (container.status !== "FINISHED") return { status: "processing", progress: ctx.progress };
    await ctx.checkpoint({ phase: "finalizing" });
    let result;
    try {
      result = await this.graph(`${ctx.account.remoteId}/threads_publish`, ctx.credentials, { method: "POST", body: { creation_id: ctx.progress.containerId } });
      invariant(result.id, "Threads did not return a published post ID.", { code: "unconfirmed_publication" });
    } catch (error) { if (!error.uncertain) await ctx.checkpoint({ phase: "container" }); throw error; }
    await ctx.checkpoint({ publicationId: result.id });
    return this.published(ctx, result.id);
  }
  async published(ctx, id) {
    let url = null; try { url = (await this.graph(`${id}?fields=permalink`, ctx.credentials)).permalink; } catch {}
    return { status: "published", externalId: id, url };
  }
  async metrics({ credentials, delivery }) {
    const result = await this.graph(`${delivery.externalId}/insights?metric=views,likes,replies,reposts,quotes`, credentials);
    const values = Object.fromEntries((result.data || []).map(item => [item.name, item.values?.[0]?.value ?? item.total_value?.value]));
    return { values: { views: values.views, likes: values.likes, comments: values.replies, shares: values.reposts === undefined && values.quotes === undefined ? null : Number(values.reposts || 0) + Number(values.quotes || 0) } };
  }
}

export class FacebookProvider extends GraphProvider {
  constructor(deps) { super("facebook", deps); }
  get version() { return this.env.META_GRAPH_VERSION || "v24.0"; }
  get graphBase() { return `https://graph.facebook.com/${this.version}`; }
  get oauth() { return { authorize: `https://www.facebook.com/${this.version}/dialog/oauth`, token: `${this.graphBase}/oauth/access_token`, clientId: this.env.FACEBOOK_CLIENT_ID, clientSecret: this.env.FACEBOOK_CLIENT_SECRET, scopes: ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "read_insights"], scopeSeparator: ",", extra: this.env.FACEBOOK_LOGIN_CONFIG_ID ? { config_id: this.env.FACEBOOK_LOGIN_CONFIG_ID } : {}, tokenDiagnosticStage: "authorization_code_exchange" }; }
  async exchange(input) {
    const short = await super.exchange(input);
    const result = await this.http.request(`${this.graphBase}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(this.oauth.clientId)}&client_secret=${encodeURIComponent(this.oauth.clientSecret)}&fb_exchange_token=${encodeURIComponent(short.accessToken)}`, { diagnosticStage: "long_lived_token_exchange" });
    return this.normalizeToken(result);
  }
  async accounts(credentials) {
    const profile = await this.graph("me?fields=id", credentials, { diagnosticStage: "profile_lookup" });
    invariant(profile.id, "Facebook did not identify the authorizing user.");
    let after = "";
    const candidates = [];
    do {
      const result = await this.graph(`me/accounts?fields=id,name,access_token,picture&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, credentials, { diagnosticStage: "page_lookup" });
      for (const page of result.data || []) candidates.push({ remoteId: String(page.id), label: page.name, avatar: page.picture?.data?.url, profileUrl: `https://www.facebook.com/${page.id}`, credentials: { accessToken: page.access_token, expiresAt: null, metaUserIds: [String(profile.id)] } });
      after = result.paging?.next ? result.paging.cursors?.after : "";
    } while (after && candidates.length < 100);
    return candidates.slice(0, 100);
  }
  async publish(ctx) {
    if (ctx.progress.publicationId) return { status: "processing", progress: ctx.progress, externalId: ctx.progress.publicationId };
    const format = ctx.content.format === "auto" ? inferFormat(ctx.content.media) : ctx.content.format;
    const item = ctx.content.media[0];
    if (item?.kind === "video" && ["reel", "story"].includes(format)) return this.publishShort(ctx, format);
    if (item?.kind === "video") {
      const { url } = await this.externalAsset(ctx, item);
      const result = await this.graph(`${ctx.account.remoteId}/videos`, ctx.credentials, { method: "POST", body: { file_url: url, title: ctx.content.title, description: ctx.content.caption, published: true } });
      invariant(result.id, "Facebook did not return a video ID.", { code: "unconfirmed_publication" }); await ctx.checkpoint({ publicationId: result.id, phase: "video" });
      return { status: "processing", externalId: result.id, progress: { publicationId: result.id, phase: "video" } };
    }
    const photos = [...(ctx.progress.photos || [])];
    for (let i = photos.length; i < ctx.content.media.length; i++) {
      const { url } = await this.externalAsset(ctx, ctx.content.media[i]);
      const result = await this.graph(`${ctx.account.remoteId}/photos`, ctx.credentials, { method: "POST", safeToRetry: true, body: { url, published: false } });
      invariant(result.id, "Facebook did not return a photo ID."); photos.push(result.id); await ctx.checkpoint({ photos });
    }
    const result = format === "story" ? await this.graph(`${ctx.account.remoteId}/photo_stories`, ctx.credentials, { method: "POST", body: { photo_id: photos[0] } }) : await this.graph(`${ctx.account.remoteId}/feed`, ctx.credentials, { method: "POST", body: { message: ctx.content.caption, ...(photos.length ? { attached_media: photos.map(id => ({ media_fbid: id })) } : {}) } });
    const id = result.post_id || result.id;
    invariant(id, "Facebook did not confirm a published post.", { code: "unconfirmed_publication" }); await ctx.checkpoint({ publicationId: id });
    return { status: "published", externalId: id, url: `https://www.facebook.com/${id}` };
  }
  async publishShort(ctx, format) {
    const endpoint = `${ctx.account.remoteId}/${format === "story" ? "video_stories" : "video_reels"}`;
    const start = await this.graph(endpoint, ctx.credentials, { method: "POST", safeToRetry: true, body: { upload_phase: "start" } });
    invariant(start.video_id && start.upload_url && new URL(start.upload_url).hostname === "rupload.facebook.com", "Facebook did not return a valid upload endpoint.");
    const { url } = await this.externalAsset(ctx, ctx.content.media[0]);
    await this.http.request(start.upload_url, { method: "POST", safeToRetry: true, headers: { Authorization: `OAuth ${ctx.credentials.accessToken}`, file_url: url } });
    await ctx.checkpoint({ publicationId: start.video_id, phase: "short_uploaded", format });
    return { status: "processing", externalId: start.video_id, progress: { publicationId: start.video_id, phase: "short_uploaded", format } };
  }
  async poll(ctx) {
    const id = ctx.progress.publicationId;
    if (ctx.progress.phase === "short_uploaded") {
      const format = ctx.progress.format;
      await ctx.checkpoint({ phase: "short_finishing" });
      try {
        await this.graph(`${ctx.account.remoteId}/${format === "story" ? "video_stories" : "video_reels"}`, ctx.credentials, { method: "POST", body: { upload_phase: "finish", video_id: id, ...(format === "reel" ? { video_state: "PUBLISHED", title: ctx.content.title, description: ctx.content.caption } : {}) } });
      } catch (error) { if (!error.uncertain) await ctx.checkpoint({ phase: "short_uploaded" }); throw error; }
      await ctx.checkpoint({ phase: "video", finishAccepted: true });
      return { status: "processing", progress: { phase: "video", finishAccepted: true }, pollAfterMs: 30000 };
    }
    const result = await this.graph(`${id}?fields=status,permalink_url`, ctx.credentials);
    const status = result.status;
    if (status?.video_status === "error" || status?.processing_phase?.status === "error" || status?.publishing_phase?.status === "error") throw new ProviderError("Facebook could not finish publishing this video.");
    if (status?.video_status === "ready" && (!ctx.progress.format || ctx.progress.finishAccepted) && (!status.publishing_phase || status.publishing_phase.status === "complete")) return { status: "published", externalId: id, url: result.permalink_url?.startsWith("https://") ? result.permalink_url : `https://www.facebook.com/${id}` };
    return { status: "processing", progress: ctx.progress, pollAfterMs: 30000 };
  }
  async metrics({ credentials, delivery }) {
    const result = await this.graph(`${delivery.externalId}?fields=reactions.limit(0).summary(true),comments.limit(0).summary(true),shares`, credentials);
    const values = { likes: result.reactions?.summary?.total_count, comments: result.comments?.summary?.total_count, shares: result.shares?.count };
    let note;
    try { const insights = await this.graph(`${delivery.externalId}/insights?metric=post_impressions`, credentials); values.impressions = insights.data?.[0]?.values?.[0]?.value; } catch { note = "Impressions are not available for this Facebook post type or permission level."; }
    return { values, note };
  }
}
