import { PlatformProvider } from "./PlatformProvider.js";
import { BridgeError, invariant, ProviderError } from "../core/errors.js";
import { inferFormat } from "./catalog.js";

const API = "https://zernio.com/api/v1";
// Meadow platform id → Zernio platform id.
const zernioIds = { tiktok: "tiktok", snapchat: "snapchat", facebook: "facebook", instagram: "instagram", threads: "threads", pinterest: "pinterest" };

export const zernioSupported = new Set(Object.keys(zernioIds));

/** Platforms whose new connections go through Zernio until Meadow's own app review is approved. */
export function zernioPlatforms(env = {}) {
  if (!env.ZERNIO_API_KEY) return new Set();
  const listed = (env.ZERNIO_PLATFORMS ?? Object.keys(zernioIds).join(",")).split(/[\s,]+/).filter(Boolean);
  return new Set(listed.filter(id => Object.hasOwn(zernioIds, id)));
}

const viaZernio = credentials => Boolean(credentials?.zernioAccountId);
const refId = value => value?._id ?? value;

function connectionError(params) {
  const code = params.get("error"), message = params.get("error_message");
  if (message && params.get("is_user_fixable") === "true") return message.slice(0, 300);
  if (code === "oauth_denied") return "The account connection was not authorized.";
  if (["payment_required", "account_limit_exceeded", "profile_limit_exceeded"].includes(code)) return "Meadow cannot add more accounts for this platform right now. Contact hello@findmeadow.com.";
  return "The account could not be connected. Please try again.";
}

/**
 * Routes new connections for a native provider through Zernio's publishing API.
 * Accounts connected before the switch keep their own tokens and native adapter;
 * Zernio accounts are recognised by `zernioAccountId` in their credentials.
 * With `zernioConnections: false`, new connections use the native app again
 * while existing Zernio accounts keep publishing.
 */
export function withZernio(Base) {
  class ZernioRouted extends Base {
    get connectsViaZernio() { return this.zernioConnections !== false && Boolean(this.env.ZERNIO_API_KEY); }
    get configured() { return this.connectsViaZernio || super.configured; }
    get zernioPlatform() { return zernioIds[this.id]; }

    async zernio(path, { method = "GET", json, headers, safeToRetry = ["GET", "DELETE"].includes(method) } = {}) {
      invariant(this.env.ZERNIO_API_KEY, `${this.capabilities.name} publishing is not configured on this server yet.`, { status: 503, code: "platform_unconfigured" });
      let response;
      try {
        response = await this.http.request(`${API}/${path}`, { method, json, headers, token: this.env.ZERNIO_API_KEY, safeToRetry, raw: true, acceptStatuses: [400, 402, 403, 404, 409, 422], timeoutMs: 120000 });
      } catch (error) {
        // Zernio answers 401 only for Meadow's own API key, never for a user's account.
        if (error.authFailure) throw new ProviderError("Zernio rejected Meadow's API key. Meadow's administrator must check ZERNIO_API_KEY.", { code: "provider_app_credentials" });
        throw error;
      }
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      if (method === "DELETE" && response.status === 404) return null;
      const message = typeof data.error === "string" && data.error ? data.error.slice(0, 300) : `Zernio rejected the request (HTTP ${response.status}).`;
      const details = { provider: "zernio", httpStatus: response.status, ...(typeof data.code === "string" ? { providerCode: data.code } : {}) };
      if (response.status === 403 && data.code === "ACCOUNT_DISCONNECTED") throw new ProviderError(`Reconnect this ${this.capabilities.name} account to continue publishing.`, { reconnect: true, code: "reconnect_required", details });
      if (response.status === 409 && data.code === "idempotency_conflict") throw new ProviderError("The post is still being submitted. Meadow will check again.", { retryable: true, code: "provider_connection", details });
      throw new ProviderError(message, { code: "provider_rejected", details });
    }

    async zernioProfile(uid, projectId) {
      const saved = this.store.get("zernioProfile", projectId);
      if (saved?.profileId) return saved.profileId;
      const name = `meadow-${projectId}`;
      const find = async () => refId((await this.zernio("profiles")).profiles?.find(profile => profile.name === name)?._id);
      let profileId = await find();
      if (!profileId) {
        try { profileId = refId((await this.zernio("profiles", { method: "POST", json: { name, description: "Meadow workspace" }, safeToRetry: true })).profile?._id); }
        catch (error) { profileId = await find(); if (!profileId) throw error; }
      }
      invariant(profileId, "The connection service did not create a profile for this workspace.", { status: 502 });
      this.store.put("zernioProfile", { id: projectId, projectId, ownerUid: uid, profileId, createdAt: this.clock() });
      await this.store.flush?.();
      return profileId;
    }

    async authorizationUrl(args) {
      if (!this.connectsViaZernio) return super.authorizationUrl(args);
      const { state, uid, projectId } = args, profileId = await this.zernioProfile(uid, projectId);
      const callback = new URL(this.redirectUri);
      callback.searchParams.set("state", state);
      const result = await this.zernio(`connect/${this.zernioPlatform}?${new URLSearchParams({ profileId, redirect_url: callback.toString() })}`);
      if (result.authUrl) return result.authUrl;
      // Zernio re-enables a previously disconnected account without a new consent screen.
      const accountId = refId(result.account?._id ?? result.account?.accountId ?? result.accountId);
      invariant(accountId, "The connection service did not return a connection link.", { status: 502 });
      callback.searchParams.set("accountId", accountId);
      return callback.toString();
    }

    authorizationState(params) { return params.get("state"); }

    async finishAuthorization(params, saved) {
      if (!this.connectsViaZernio) {
        // Same as AccountService's native path; this adapter must define the hook for Zernio.
        invariant(!params.get("error") && params.get("code"), "The account connection was not authorized.");
        const credentials = await this.exchange({ code: params.get("code"), verifier: saved.verifier });
        return { state: params.get("state"), credentials, candidates: await super.accounts(credentials) };
      }
      if (params.get("error")) throw new BridgeError(connectionError(params), { code: "connection_failed" });
      const accountId = params.get("accountId");
      invariant(accountId && saved?.projectId, "The account connection was not authorized.");
      const profileId = this.store.get("zernioProfile", saved.projectId)?.profileId;
      invariant(profileId, "This connection request has expired. Start again.");
      const credentials = { zernioAccountId: accountId, zernioProfileId: profileId };
      return { state: params.get("state"), credentials, candidates: await this.accounts(credentials) };
    }

    async accounts(credentials) {
      if (!viaZernio(credentials)) return super.accounts(credentials);
      const { zernioAccountId, zernioProfileId } = credentials;
      // The callback's accountId comes from the browser, so confirm it belongs to this workspace's profile.
      const { accounts = [] } = await this.zernio(`accounts?${new URLSearchParams({ profileId: zernioProfileId, platform: this.zernioPlatform })}`);
      const account = accounts.find(item => item._id === zernioAccountId && refId(item.profileId) === zernioProfileId);
      invariant(account, `This ${this.capabilities.name} account is no longer connected. Connect it again.`, { code: "reconnect_required" });
      return [{ remoteId: `zernio:${account._id}`, label: account.displayName || account.username || `${this.capabilities.name} account`, avatar: account.profilePicture || undefined, profileUrl: account.profileUrl || undefined, credentials: { metaUserIds: [] } }];
    }

    async refresh(credentials) { return viaZernio(credentials) ? credentials : super.refresh(credentials); }
    async validateConnection(account, credentials) { if (!viaZernio(credentials)) return super.validateConnection?.(account, credentials); }

    async revoke(credentials) {
      if (!viaZernio(credentials)) return super.revoke(credentials);
      await this.zernio(`accounts/${encodeURIComponent(credentials.zernioAccountId)}`, { method: "DELETE" });
      return { remoteRevocation: true };
    }

    async options(account, credentials) {
      if (!viaZernio(credentials)) return super.options(account, credentials);
      const base = await PlatformProvider.prototype.options.call(this), id = encodeURIComponent(credentials.zernioAccountId);
      if (this.id === "pinterest") {
        const { boards = [] } = await this.zernio(`accounts/${id}/pinterest-boards`);
        return { ...base, boards: boards.map(board => ({ id: board.id, name: board.name })) };
      }
      if (this.id !== "tiktok") return base;
      const info = await this.zernio(`accounts/${id}/tiktok/creator-info?mediaType=video`), toggles = info.postingLimits?.interactionSettings || {};
      invariant(info.privacyLevels?.length, "TikTok did not return the creator's publishing options.", { status: 502 });
      return { ...base, tiktokPermissions: { canUpload: true, canPublish: true }, tiktokDirectPostPrivateOnly: false,
        creator: { nickname: info.creator?.nickname, username: info.creator?.nickname, avatar: null, privacyOptions: info.privacyLevels.map(level => level.value), commentsDisabled: toggles.allow_comment?.enabled === false, duetDisabled: toggles.allow_duet?.enabled === false, stitchDisabled: toggles.allow_stitch?.enabled === false, maxVideoSeconds: info.postingLimits?.maxVideoDurationSec } };
    }

    postFields(format, content) {
      const s = content.settings || {}, caption = content.caption || "", title = content.title || "";
      if (this.id === "tiktok") {
        const photos = content.media[0]?.kind === "image", inbox = s.deliveryMode === "inbox";
        const commercial = s.brandedContent && s.ownBrand ? { isBrandOrganicPost: true, brandPartnerPromote: true } : { commercialContentType: s.brandedContent ? "brand_content" : s.ownBrand ? "brand_organic" : "none" };
        return { content: photos ? title : caption, data: { ...(s.privacy ? { privacy_level: s.privacy } : {}), allow_comment: s.allowComments === true, content_preview_confirmed: true, express_consent_given: (inbox ? s.uploadConsent : s.consent) === true, ...commercial,
          ...(photos ? { media_type: "photo", description: caption, auto_add_music: s.autoMusic === true } : { allow_duet: s.allowDuet === true, allow_stitch: s.allowStitch === true, video_made_with_ai: s.aiGenerated === true }), ...(inbox ? { draft: true } : {}) } };
      }
      if (this.id === "instagram") return { content: caption, data: format === "story" ? { contentType: "story" } : {} };
      if (this.id === "facebook") return { content: caption, data: format === "story" ? { contentType: "story" } : format === "reel" ? { contentType: "reel", ...(title ? { title } : {}) } : {} };
      if (this.id === "snapchat") return { content: caption, data: { contentType: format === "story" ? "story" : content.media[0]?.kind === "video" ? "spotlight" : "saved_story" } };
      if (this.id === "pinterest") return { content: caption, data: { boardId: s.boardId, ...(title ? { title } : {}), ...(s.link ? { link: s.link } : {}) } };
      return { content: caption, data: {} };
    }

    async publish(ctx) {
      if (!viaZernio(ctx.credentials)) return super.publish(ctx);
      if (ctx.progress.zernioPostId) return this.poll(ctx);
      const format = ctx.content.format === "auto" || !ctx.content.format ? inferFormat(ctx.content.media) : ctx.content.format;
      const mediaItems = [];
      for (const item of ctx.content.media) {
        const asset = await ctx.media.prepare(item, item.kind === "image" ? "jpeg" : item.kind === "video" ? "mp4" : "original");
        mediaItems.push({ type: item.kind, url: ctx.media.url(item, { variant: asset.variant, external: true }) });
      }
      const { content, data } = this.postFields(format, ctx.content);
      // A short delay keeps long video uploads out of this request; Meadow polls for the result.
      const result = await this.zernio("posts", { method: "POST", safeToRetry: Boolean(ctx.delivery?.id), headers: ctx.delivery?.id ? { "Idempotency-Key": `meadow-${ctx.delivery.id}` } : {},
        json: { content, mediaItems, platforms: [{ platform: this.zernioPlatform, accountId: ctx.credentials.zernioAccountId, platformSpecificData: data }], scheduledFor: new Date(this.clock() + 30000).toISOString(), ...(ctx.delivery?.id ? { metadata: { meadowDeliveryId: ctx.delivery.id } } : {}) } });
      const postId = refId(result.post?._id);
      invariant(postId, `${this.capabilities.name} did not confirm receipt of the post.`, { code: "unconfirmed_publication" });
      const progress = { ...ctx.progress, zernioPostId: postId };
      await ctx.checkpoint(progress);
      return { status: "processing", progress, pollAfterMs: 30000 };
    }

    async poll(ctx) {
      if (!viaZernio(ctx.credentials)) return super.poll(ctx);
      const { post } = await this.zernio(`posts/${encodeURIComponent(ctx.progress.zernioPostId)}`);
      const target = post?.platforms?.find(item => refId(item.accountId) === ctx.credentials.zernioAccountId) || post?.platforms?.[0];
      invariant(target, `${this.capabilities.name} did not return this post's delivery status.`, { status: 502 });
      if (target.status === "published") return { status: "published", externalId: target.platformPostId || ctx.progress.zernioPostId, url: target.platformPostUrl || undefined };
      if (["failed", "cancelled"].includes(target.status)) throw new ProviderError(target.errorMessage ? `${this.capabilities.name} did not publish this post: ${String(target.errorMessage).slice(0, 300)}` : `${this.capabilities.name} did not publish this post.`, { code: "provider_rejected" });
      return { status: "processing", progress: ctx.progress, pollAfterMs: 30000 };
    }

    async metrics(args) {
      if (!viaZernio(args.credentials)) return super.metrics(args);
      return { values: {}, unavailableReason: `Post metrics are not yet available for this ${this.capabilities.name} connection.` };
    }
  }
  // Account views are optional adapter features; only wrap the ones the platform has.
  for (const name of ["accountViews", "availableAccountViews"]) {
    if (typeof Base.prototype[name] !== "function") continue;
    Object.defineProperty(ZernioRouted.prototype, name, { configurable: true, writable: true, async value(args) {
      if (viaZernio(args.credentials)) throw new ProviderError("Account views are not yet available for this connection.", { code: "provider_permissions" });
      return Base.prototype[name].call(this, args);
    } });
  }
  return ZernioRouted;
}
