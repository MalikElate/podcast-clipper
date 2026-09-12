import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";

export class TikTokProvider extends PlatformProvider {
  constructor(deps) { super("tiktok", deps); }
  async revoke(credentials) {
    await this.http.request("https://open.tiktokapis.com/v2/oauth/revoke/", {
      method: "POST", form: { client_key: this.oauth.clientId, client_secret: this.oauth.clientSecret, token: credentials.accessToken }, safeToRetry: true,
    });
    return { remoteRevocation: true };
  }
  get oauth() { return { authorize: "https://www.tiktok.com/v2/auth/authorize/", token: "https://open.tiktokapis.com/v2/oauth/token/", clientId: this.env.TIKTOK_CLIENT_KEY, clientSecret: this.env.TIKTOK_CLIENT_SECRET, clientIdParam: "client_key", scopes: ["user.info.basic", "video.publish", "video.list"], scopeSeparator: "," }; }
  request(endpoint, credentials, json) { return this.http.request(`https://open.tiktokapis.com/v2/${endpoint}`, { token: credentials.accessToken, ...(json ? { method: "POST", json } : {}) }); }
  async accounts(credentials) {
    const result = await this.request("user/info/?fields=open_id,display_name,avatar_url", credentials);
    const user = result.data?.user;
    invariant(user?.open_id, "TikTok did not return an eligible creator account.");
    return [{ remoteId: user.open_id, label: user.display_name, avatar: user.avatar_url }];
  }
  async options(account, credentials) {
    const result = await this.http.request("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", { token: credentials.accessToken, method: "POST", json: {}, safeToRetry: true });
    const creator = result.data;
    invariant(creator?.privacy_level_options, "TikTok did not return the creator's publishing options.");
    return { ...await super.options(), creator: { nickname: creator.creator_nickname, username: creator.creator_username, avatar: creator.creator_avatar_url, privacyOptions: creator.privacy_level_options, commentsDisabled: creator.comment_disabled, duetDisabled: creator.duet_disabled, stitchDisabled: creator.stitch_disabled, maxVideoSeconds: creator.max_video_post_duration_sec } };
  }
  validate(content) {
    const errors = super.validate(content), s = content.settings || {}, creator = content.accountOptions?.creator;
    if (!s.privacy || !creator?.privacyOptions?.includes(s.privacy)) errors.push("Choose one of this TikTok creator's available privacy settings.");
    if (s.consent !== true) errors.push("Accept TikTok's Music Usage Confirmation before posting.");
    if (s.brandedContent && s.privacy === "SELF_ONLY") errors.push("Branded content cannot use TikTok's Only me privacy setting.");
    if (creator?.commentsDisabled && s.allowComments || creator?.duetDisabled && s.allowDuet || creator?.stitchDisabled && s.allowStitch) errors.push("An interaction setting is unavailable for this TikTok creator.");
    if (content.media.some(item => item.kind === "video" && (!creator?.maxVideoSeconds || item.durationSec > creator.maxVideoSeconds))) errors.push(`This TikTok creator accepts videos up to ${creator?.maxVideoSeconds || "an unknown number of"} seconds. Refresh the account options.`);
    if (content.media[0]?.kind === "image" && content.title.length > 90) errors.push("TikTok photo titles can contain up to 90 characters.");
    return errors;
  }
  async publish(ctx) {
    if (ctx.progress.publishId) return { status: "processing", progress: ctx.progress };
    const s = ctx.content.settings, photos = ctx.content.media[0].kind === "image";
    const urls = [];
    for (const item of ctx.content.media) {
      const asset = await ctx.media.prepare(item, photos ? "jpeg" : "mp4");
      invariant(asset.bytes <= this.capabilities[`${item.kind}MaxBytes`], "The converted file exceeds TikTok's media limit.");
      urls.push(ctx.media.url(item, { variant: asset.variant, external: true }));
    }
    const postInfo = { privacy_level: s.privacy, disable_comment: s.allowComments !== true, brand_content_toggle: s.brandedContent === true, brand_organic_toggle: s.ownBrand === true };
    const body = photos ? { media_type: "PHOTO", post_mode: "DIRECT_POST", post_info: { ...postInfo, title: ctx.content.title, description: ctx.content.caption, auto_add_music: s.autoMusic === true }, is_aigc: s.aiGenerated === true, source_info: { source: "PULL_FROM_URL", photo_images: urls, photo_cover_index: 0 } } : { post_info: { ...postInfo, title: ctx.content.caption, disable_duet: s.allowDuet !== true, disable_stitch: s.allowStitch !== true, is_aigc: s.aiGenerated === true }, source_info: { source: "PULL_FROM_URL", video_url: urls[0] } };
    const result = await this.request(`post/publish/${photos ? "content" : "video"}/init/`, ctx.credentials, body);
    invariant(result.data?.publish_id, "TikTok did not confirm receipt of the post.", { code: "unconfirmed_publication" });
    const progress = { publishId: result.data.publish_id };
    ctx.checkpoint(progress);
    return { status: "processing", progress, pollAfterMs: 30000 };
  }
  async poll(ctx) {
    const result = await this.http.request("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", token: ctx.credentials.accessToken, json: { publish_id: ctx.progress.publishId }, safeToRetry: true });
    const data = result.data || {};
    if (data.status === "FAILED") {
      const limited = /too_many_posts|rate_limit/.test(data.fail_reason || "");
      throw new ProviderError(limited ? "TikTok has reached its publishing allowance." : "TikTok could not publish this content. Check its settings and media.", { retryable: limited, restartPublishing: limited, code: limited ? "rate_limited" : "provider_rejected" });
    }
    if (data.status === "PUBLISH_COMPLETE") {
      const ids = data.publicaly_available_post_id || data.publicly_available_post_id || [];
      return { status: "published", externalId: ids[0] || ctx.progress.publishId, progress: { ...ctx.progress, privatePost: !ids.length }, url: ids[0] && ctx.account.options?.creator?.username ? `https://www.tiktok.com/@${ctx.account.options.creator.username}/${ctx.content.media[0].kind === "image" ? "photo" : "video"}/${ids[0]}` : null };
    }
    return { status: "processing", progress: ctx.progress, pollAfterMs: 30000 };
  }
  async metrics({ credentials, delivery }) {
    if (!/^\d+$/.test(delivery.externalId)) return { values: {}, unavailableReason: "TikTok does not expose a public post ID for this private post." };
    const result = await this.http.request("https://open.tiktokapis.com/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count", { method: "POST", token: credentials.accessToken, json: { filters: { video_ids: [delivery.externalId] } }, safeToRetry: true });
    const v = result.data?.videos?.[0] || {};
    return { values: { views: v.view_count, likes: v.like_count, comments: v.comment_count, shares: v.share_count } };
  }
}
