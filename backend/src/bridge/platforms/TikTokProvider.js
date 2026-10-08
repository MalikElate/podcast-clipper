import { PlatformProvider } from "./PlatformProvider.js";
import { videoCoverTimestamp, customVideoCover } from "./videoCover.js";
import { tiktokAccountAnalytics } from "./accountAnalytics.js";
import { tiktokStatusFailure } from "./tiktokErrors.js";
import { invariant, ProviderError } from "../core/errors.js";

const uploadPermissionMessage = "Reconnect TikTok and allow video uploads to send content to your TikTok inbox.";
const publishPermissionMessage = "Reconnect TikTok and allow direct publishing to publish from Meadow.";
const privateOnlyMessage = "Until TikTok approves Meadow's Direct Post audit, this TikTok account must be private and the post must use Only me.";

function permissions(credentials = {}) {
  const scopes = new Set((Array.isArray(credentials.scope) ? credentials.scope.join(",") : String(credentials.scope ?? "")).split(/[\s,]+/).filter(Boolean));
  // Historical connections did not always persist the granted scope. Keep
  // their existing Direct Post behavior, but require an explicit upload grant.
  return { canUpload: scopes.has("video.upload"), canPublish: credentials.scope == null || scopes.has("video.publish") };
}

function inboxError(error) {
  // The HTTP adapter already provides safe, specific TikTok diagnostics.
  // Keep its reference so the saved delivery explains why TikTok rejected it.
  if (error.details?.provider === "tiktok") return error;
  const code = error.details?.providerCode;
  if (code === "scope_not_authorized") return new ProviderError(uploadPermissionMessage, { reconnect: true, code: "reconnect_required" });
  if (code === "spam_risk_too_many_pending_share") return new ProviderError("TikTok allows at most five pending uploads within 24 hours. Finish existing uploads from your TikTok inbox before sending more.", { retryable: true, code: "rate_limited", details: { providerCode: code } });
  if (code === "app_version_check_failed") return new ProviderError("Update the TikTok app to send photos to your TikTok inbox.", { code: "provider_rejected" });
  return error;
}

export class TikTokProvider extends PlatformProvider {
  availableAccountViews({ credentials }) { return tiktokAccountAnalytics(this, credentials); }
  constructor(deps) { super("tiktok", deps); }
  get directPostPrivateOnly() { return this.env.TIKTOK_DIRECT_POST_PRIVATE_ONLY === "true"; }
  // Production and Sandbox grants belong to different TikTok clients. Keep
  // the original credentials for renewal/revocation of pre-rollout grants.
  credentialOAuth(credentials) {
    const clientId = credentials.tiktokClientKey || this.env.TIKTOK_CLIENT_KEY;
    const oauth = this.oauth;
    if (clientId && clientId === oauth.clientId && oauth.clientSecret) return oauth;
    if (clientId && clientId === this.env.TIKTOK_CLIENT_KEY && this.env.TIKTOK_CLIENT_SECRET) return { ...oauth, clientId, clientSecret: this.env.TIKTOK_CLIENT_SECRET };
    throw new ProviderError("Reconnect TikTok to renew access through Meadow's current app.", { reconnect: true, code: "reconnect_required" });
  }
  normalizeToken(data, previous = {}) {
    return { ...super.normalizeToken(data, previous), tiktokClientKey: previous.tiktokClientKey || this.oauth.clientId };
  }
  async refresh(credentials) {
    if (!credentials.refreshToken) return credentials;
    const oauth = this.credentialOAuth(credentials);
    const data = await this.http.request(oauth.token, { method: "POST", form: { grant_type: "refresh_token", refresh_token: credentials.refreshToken, client_key: oauth.clientId, client_secret: oauth.clientSecret }, safeToRetry: true });
    return this.normalizeToken(data, { ...credentials, tiktokClientKey: oauth.clientId });
  }
  async revoke(credentials) {
    const oauth = this.credentialOAuth(credentials);
    await this.http.request("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST", form: { client_key: oauth.clientId, client_secret: oauth.clientSecret, token: credentials.accessToken }, safeToRetry: true,
    });
    return { remoteRevocation: true };
  }
  get oauth() {
    const v2 = Boolean(this.env.TIKTOK_CLIENT_KEY_V2 || this.env.TIKTOK_CLIENT_SECRET_V2);
    return { authorize: "https://www.tiktok.com/v2/auth/authorize/", token: "https://open.tiktokapis.com/v2/oauth/token/", clientId: v2 ? this.env.TIKTOK_CLIENT_KEY_V2 : this.env.TIKTOK_CLIENT_KEY, clientSecret: v2 ? this.env.TIKTOK_CLIENT_SECRET_V2 : this.env.TIKTOK_CLIENT_SECRET, clientIdParam: "client_key", scopes: ["user.info.basic", "video.publish", "video.upload", "video.list"], scopeSeparator: ",", extra: { disable_auto_auth: "1" } };
  }
  request(endpoint, credentials, json) { return this.http.request(`https://open.tiktokapis.com/v2/${endpoint}`, { token: credentials.accessToken, ...(json ? { method: "POST", json } : {}) }); }
  async accounts(credentials) {
    const result = await this.request("user/info/?fields=open_id,union_id,display_name,avatar_url", credentials);
    const user = result.data?.user;
    invariant(user?.open_id && user?.union_id, "TikTok did not return a verified creator identity. Try connecting again.");
    // open_id is app-specific; union_id identifies the same person across
    // Meadow's Sandbox and production apps without guessing from a display name.
    return [{ remoteId: user.open_id, identityKey: `tiktok:union:${user.union_id}`, label: user.display_name, avatar: user.avatar_url }];
  }
  async options(account, credentials) {
    const tiktokPermissions = permissions(credentials), base = { ...await super.options(), tiktokPermissions, tiktokDirectPostPrivateOnly: this.directPostPrivateOnly };
    // Upload-only grants cannot call creator_info; the user chooses privacy and
    // interaction settings later in TikTok's editing flow.
    if (!tiktokPermissions.canPublish) return base;
    const result = await this.http.request("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { token: credentials.accessToken, method: "POST", json: {}, safeToRetry: true });
    const creator = result.data;
    invariant(creator?.privacy_level_options, "TikTok did not return the creator's publishing options.");
    const privacyOptions = this.directPostPrivateOnly ? creator.privacy_level_options.filter(value => value === "SELF_ONLY") : creator.privacy_level_options;
    return { ...base, creator: { nickname: creator.creator_nickname, username: creator.creator_username, avatar: creator.creator_avatar_url, privacyOptions, commentsDisabled: creator.comment_disabled, duetDisabled: creator.duet_disabled, stitchDisabled: creator.stitch_disabled, maxVideoSeconds: creator.max_video_post_duration_sec } };
  }
  validate(content) {
    const errors = super.validate(content), s = content.settings || {}, creator = content.accountOptions?.creator;
    const mode = s.deliveryMode ?? "direct", granted = content.accountOptions?.tiktokPermissions;
    const privateOnly = content.accountOptions?.tiktokDirectPostPrivateOnly ?? this.directPostPrivateOnly;
    if (!["direct", "inbox"].includes(mode)) errors.push("Choose whether to publish directly or finish editing in TikTok.");
    if (content.media[0]?.kind === "image" && (content.title || "").length > 90) errors.push("TikTok photo titles can contain up to 90 characters.");
    if (mode === "inbox") {
      if (granted?.canUpload === false) errors.push(uploadPermissionMessage);
      if (s.uploadConsent !== true) errors.push("Confirm that you will finish editing and publish from the notification in your TikTok inbox.");
      if (content.media.some(item => item.kind === "video" && (!Number.isFinite(item.durationSec) || item.durationSec <= 0 || item.durationSec > 600))) errors.push("Videos sent to your TikTok inbox must be no longer than 10 minutes and have a known duration.");
      return errors;
    }
    if (granted?.canPublish === false) errors.push(publishPermissionMessage);
    if (privateOnly && s.privacy !== "SELF_ONLY") errors.push(privateOnlyMessage);
    else if (!creator?.privacyOptions?.length) errors.push("TikTok's audience options could not be loaded. Refresh the page and try again.");
    else if (!s.privacy) errors.push("Choose who can see this TikTok post.");
    else if (!creator.privacyOptions.includes(s.privacy)) errors.push("This audience is no longer available. Choose who can see this TikTok post again.");
    if (s.consent !== true) errors.push("Accept TikTok's Music Usage Confirmation before posting.");
    if (s.brandedContent && s.privacy === "SELF_ONLY") errors.push("Branded content cannot use TikTok's Only me privacy setting.");
    if (creator?.commentsDisabled && s.allowComments || creator?.duetDisabled && s.allowDuet || creator?.stitchDisabled && s.allowStitch) errors.push("An interaction setting is unavailable for this TikTok creator.");
    if (content.media.some(item => item.kind === "video" && (!creator?.maxVideoSeconds || item.durationSec > creator.maxVideoSeconds))) errors.push(`This TikTok creator accepts videos up to ${creator?.maxVideoSeconds || "an unknown number of"} seconds. Refresh the account options.`);
    return errors;
  }
  async publish(ctx) {
    if (ctx.progress.publishId) return { status: "processing", progress: ctx.progress };
    const s = ctx.content.settings || {}, deliveryMode = s.deliveryMode ?? "direct", inbox = deliveryMode === "inbox";
    invariant(["direct", "inbox"].includes(deliveryMode), "Choose whether to publish directly or finish editing in TikTok.");
    const granted = permissions(ctx.credentials);
    if (inbox ? !granted.canUpload : !granted.canPublish) throw new ProviderError(inbox ? uploadPermissionMessage : publishPermissionMessage, { reconnect: true, code: "reconnect_required" });
    // Enforce the deployment restriction even for stale queued settings or a
    // caller that bypasses preview validation. Never rewrite an audience choice.
    invariant(inbox || !this.directPostPrivateOnly || s.privacy === "SELF_ONLY", privateOnlyMessage, { code: "tiktok_private_only" });
    if (inbox) this.assertValid(ctx.content);
    const photos = ctx.content.media[0].kind === "image";
    const customCover = customVideoCover(this.id, ctx.content);
    const urls = [];
    for (const item of ctx.content.media) {
      const asset = customCover ? await ctx.media.prepareTikTokCover(item, customCover) : await ctx.media.prepare(item, photos ? "jpeg" : "mp4");
      invariant(asset.bytes <= this.capabilities[`${item.kind}MaxBytes`], "The converted file exceeds TikTok's media limit.");
      urls.push(ctx.media.url(item, { variant: asset.variant, external: true }));
    }
    const postInfo = { privacy_level: s.privacy, disable_comment: s.allowComments !== true, brand_content_toggle: s.brandedContent === true, brand_organic_toggle: s.ownBrand === true };
    const coverTimestamp = customCover ? 0 : videoCoverTimestamp(this.id, ctx.content);
    const body = photos ? { media_type: "PHOTO", post_mode: "DIRECT_POST", post_info: { ...postInfo, title: ctx.content.title, description: ctx.content.caption, auto_add_music: s.autoMusic === true }, is_aigc: s.aiGenerated === true, source_info: { source: "PULL_FROM_URL", photo_images: urls, photo_cover_index: 0 } } : { post_info: { ...postInfo, title: ctx.content.caption, disable_duet: s.allowDuet !== true, disable_stitch: s.allowStitch !== true, is_aigc: s.aiGenerated === true, ...(coverTimestamp !== undefined ? { video_cover_timestamp_ms: coverTimestamp } : {}) }, source_info: { source: "PULL_FROM_URL", video_url: urls[0] } };
    const inboxBody = photos ? { media_type: "PHOTO", post_mode: "MEDIA_UPLOAD", post_info: { title: ctx.content.title || "", description: ctx.content.caption || "" }, source_info: body.source_info } : { source_info: body.source_info };
    let result;
    try {
      result = await this.request(`post/publish/${photos ? "content" : inbox ? "inbox/video" : "video"}/init/`, ctx.credentials, inbox ? inboxBody : body);
    } catch (error) { throw inbox ? inboxError(error) : error; }
    if (inbox && !result.data?.publish_id) throw new ProviderError("TikTok did not confirm receipt of this upload. Check your TikTok inbox before trying again.", { uncertain: true, code: "unconfirmed_publication" });
    invariant(result.data?.publish_id, "TikTok did not confirm receipt of the post.", { code: "unconfirmed_publication" });
    const progress = { publishId: result.data.publish_id, deliveryMode };
    await ctx.checkpoint(progress);
    return { status: "processing", progress, pollAfterMs: 30000 };
  }
  async poll(ctx) {
    const inbox = (ctx.progress.deliveryMode ?? ctx.content.settings?.deliveryMode) === "inbox";
    const result = await this.http.request("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", token: ctx.credentials.accessToken, json: { publish_id: ctx.progress.publishId }, safeToRetry: true });
    const data = result.data || {};
    if (data.status === "FAILED") {
      throw tiktokStatusFailure(data.fail_reason, { inbox });
    }
    if (inbox && ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"].includes(data.status)) {
      // A successful transfer is a handoff, not a Meadow-published post. Stop
      // polling without resending; finishing the post belongs to the user.
      return { status: "awaiting_publish", externalId: ctx.progress.publishId, url: null, progress: { ...ctx.progress, deliveryMode: "inbox", tiktokStatus: data.status } };
    }
    if (data.status === "PUBLISH_COMPLETE") {
      const ids = data.publicaly_available_post_id || data.publicly_available_post_id || [];
      return { status: "published", externalId: ids[0] || ctx.progress.publishId, progress: { ...ctx.progress, privatePost: !ids.length }, url: ids[0] && ctx.account.options?.creator?.username ? `https://www.tiktok.com/@${ctx.account.options.creator.username}/${ctx.content.media[0].kind === "image" ? "photo" : "video"}/${ids[0]}` : null };
    }
    return { status: "processing", progress: ctx.progress, pollAfterMs: 30000 };
  }
  /** The creator's latest public videos (video.list), for Swipe or Push. */
  async recentVideos({ credentials }) {
    const result = await this.http.request("https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count", { method: "POST", token: credentials.accessToken, json: { max_count: 20 }, safeToRetry: true, timeoutMs: 15000 });
    return (result.data?.videos || []).filter(video => /^\d+$/.test(String(video.id || "")) && /^https:\/\/(www\.)?tiktok\.com\//.test(video.share_url || "")).map(video => ({
      id: String(video.id), title: String(video.title || ""), caption: String(video.video_description || video.title || ""),
      publishedAt: Number.isFinite(video.create_time) ? video.create_time * 1000 : null, thumbnailUrl: video.cover_image_url || null, url: video.share_url,
      metrics: { views: video.view_count, likes: video.like_count, comments: video.comment_count, shares: video.share_count },
    }));
  }
  async metrics({ credentials, delivery }) {
    if (!/^\d+$/.test(delivery.externalId)) return { values: {}, unavailableReason: "TikTok does not expose a public post ID for this private post." };
    const result = await this.http.request("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count", { method: "POST", token: credentials.accessToken, json: { filters: { video_ids: [delivery.externalId] } }, safeToRetry: true });
    const v = result.data?.videos?.[0] || {};
    return { values: { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count } };
  }
}
