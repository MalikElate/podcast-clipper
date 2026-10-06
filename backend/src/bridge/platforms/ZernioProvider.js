import { PlatformProvider } from "./PlatformProvider.js";
import { BridgeError, invariant, ProviderError } from "../core/errors.js";
import { inferFormat } from "./catalog.js";

const API = "https://zernio.com/api/v1";
// Meadow platform id → Zernio platform id.
const zernioIds = { tiktok: "tiktok", snapchat: "snapchat", facebook: "facebook", instagram: "instagram", threads: "threads", pinterest: "pinterest" };

export const zernioSupported = new Set(Object.keys(zernioIds));
// TikTok uses Zernio while Meadow's separate Direct Post audit is pending.
const defaultConnections = ["tiktok", "snapchat", "facebook", "instagram", "threads", "pinterest"];

/** Platforms whose new connections go through Zernio. Existing grants keep their adapter. */
export function zernioPlatforms(env = {}) {
  if (!env.ZERNIO_API_KEY) return new Set();
  const listed = (env.ZERNIO_PLATFORMS ?? defaultConnections.join(",")).split(/[\s,]+/).filter(Boolean);
  return new Set(listed.filter(id => Object.hasOwn(zernioIds, id)));
}

const viaZernio = credentials => Boolean(credentials?.zernioAccountId);
const refId = value => value?._id ?? value;
const metricKeys = ["views", "impressions", "likes", "comments", "shares", "saves", "clicks"];
const safeUrl = value => { try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; } };
const numericMetrics = analytics => Object.fromEntries(metricKeys.map(key => {
  const value = analytics?.[key];
  return [key, ["number", "string"].includes(typeof value) && String(value).trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null];
}));

const appCredentialCodes = new Set(["missing_credentials", "invalid_credentials"]);
const accountAuthorizationCodes = new Set(["TOKEN_EXPIRED", "ACCOUNT_DISCONNECTED", "access_token_invalid", "access_token_expired", "token_expired", "invalid_token", "invalid_grant"]);
const upstreamAuthorizationCodes = new Set([...accountAuthorizationCodes, "scope_not_authorized"]);

function zernioAuthorizationError(data, status, platform, name) {
  const upstream = data.type === "platform_error" || data.code === "platform_api_error";
  const knownCode = [...appCredentialCodes, ...accountAuthorizationCodes, "platform_api_error"].includes(data.code) ? data.code : null;
  const upstreamCode = data.platformError?.error?.code || data.platformError?.code;
  const details = { provider: "zernio", httpStatus: status, ...(knownCode ? { providerCode: knownCode } : {}), ...(upstream && upstreamAuthorizationCodes.has(upstreamCode) ? { upstreamCode } : {}) };
  if (!upstream && appCredentialCodes.has(data.code)) return new ProviderError("Zernio rejected Meadow's API key. Meadow's administrator must check ZERNIO_API_KEY.", { code: "provider_app_credentials", details });
  if (accountAuthorizationCodes.has(data.code) || upstream && (!data.platform || data.platform === platform)) return new ProviderError(`Reconnect this ${name} account in Meadow to renew its publishing authorization.`, { reconnect: true, code: "reconnect_required", details });
  return new ProviderError(`${name}'s connection service could not authorize this request (HTTP ${status}). Try again. If it continues, contact hello@findmeadow.com.`, { code: "provider_authorization", details });
}

function analyticsEntry(post, credentials, platform) {
  // Never use the cross-platform roll-up: it can include other accounts.
  return (post.platformAnalytics || post.platforms || []).find(entry => refId(entry.accountId) === credentials.zernioAccountId && entry.platform === platform);
}

// Zernio reports each post's media type, cover image and media items. Keep only
// HTTPS URLs; Swipe or Push uses them to preview and re-post a creator's videos.
function postMedia(post) {
  const items = (Array.isArray(post.mediaItems) ? post.mediaItems : []).slice(0, 20)
    .map(item => ({ type: typeof item?.type === "string" ? item.type : null, url: safeUrl(item?.url), thumbnail: safeUrl(item?.thumbnail) }))
    .filter(item => item.url || item.thumbnail);
  const type = typeof post.mediaType === "string" ? post.mediaType : null, thumbnailUrl = safeUrl(post.thumbnailUrl);
  return type || thumbnailUrl || items.length ? { type, thumbnailUrl, items } : null;
}

function entryMetrics(entry, name) {
  const values = numericMetrics(entry?.analytics);
  const measured = Object.values(values).some(Number.isFinite);
  const pending = entry?.syncStatus === "pending";
  return { values, pending: pending || !measured, ...(pending ? { note: `${name} analytics are still syncing. Refresh again shortly.` } : !measured ? { unavailableReason: `${name} has not returned metrics for this post yet.` } : {}) };
}

function tiktokPublication(entry) {
  if (entry?.status !== "published" || entry.platformSpecificData?.isDraft === true || entry.platformSpecificData?.draft === true || entry.platformSpecificData?.tiktokSettings?.draft === true) return null;
  // TikTok initially supplies an upload reference (for example v_pub_url~v2.…).
  // Only a native post ID and a provider-supplied public post URL can replace it.
  const externalId = typeof entry.platformPostId === "string" && /^\d+$/.test(entry.platformPostId) ? entry.platformPostId : null;
  let url = safeUrl(entry.platformPostUrl);
  if (url) {
    const parsed = new URL(url), post = parsed.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/);
    if (parsed.username || parsed.password || !(parsed.hostname === "tiktok.com" || parsed.hostname.endsWith(".tiktok.com")) || !post) url = null;
    else if (externalId && post[1] !== externalId) return null;
  }
  return externalId || url ? { ...(externalId ? { externalId } : {}), ...(url ? { url } : {}) } : null;
}

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
      const response = await this.http.request(`${API}/${path}`, { method, json, headers, token: this.env.ZERNIO_API_KEY, safeToRetry, raw: true, acceptStatuses: [400, 401, 402, 403, 404, 409, 422, ...(path.startsWith("analytics?") ? [424] : [])], timeoutMs: path.startsWith("analytics?") ? 30000 : 120000 });
      const payload = await response.json().catch(() => ({}));
      const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
      if (response.ok || path.startsWith("analytics?") && response.status === 424) return data;
      if (method === "DELETE" && response.status === 404) return null;
      // Zernio can forward a platform's 401 as well as reject its own API key.
      // Classify the envelope without disclosing its raw message or token data.
      if (response.status === 401) throw zernioAuthorizationError(data, response.status, this.zernioPlatform, this.capabilities.name);
      const message = typeof data.error === "string" && data.error ? data.error.slice(0, 300) : `Zernio rejected the request (HTTP ${response.status}).`;
      const details = { provider: "zernio", httpStatus: response.status, ...(typeof data.code === "string" ? { providerCode: data.code } : {}) };
      if (response.status === 403 && accountAuthorizationCodes.has(data.code)) throw zernioAuthorizationError(data, response.status, this.zernioPlatform, this.capabilities.name);
      if (path.startsWith("analytics?")) {
        if (response.status === 402) throw new ProviderError("Analytics access is not enabled for Meadow's Zernio connection. Contact hello@findmeadow.com.", { code: "provider_permissions", details });
        if (response.status === 404) throw new ProviderError("This post's analytics are not available in Zernio yet. Refresh again shortly.", { code: "analytics_pending", details });
        throw new ProviderError(`${this.capabilities.name} analytics could not be loaded. Check this connection's analytics access in Meadow.`, { code: "provider_rejected", details });
      }
      if (response.status === 409 && data.code === "idempotency_conflict") throw new ProviderError("The post is still being submitted. Meadow will check again.", { retryable: true, code: "provider_connection", details });
      throw new ProviderError(message, { code: "provider_rejected", details });
    }

    async zernioProfile(uid, projectId) {
      // Reuse one provider profile per Meadow owner for new workspaces. Creating
      // another profile can give the same social account a different Zernio ID.
      const resolve = () => this.resolveZernioProfile(uid, projectId);
      return this.locks ? this.locks.withLock(`zernio-profile:${uid}`, resolve) : resolve();
    }

    async resolveZernioProfile(uid, projectId) {
      const saved = this.store.get("zernioProfile", projectId);
      if (saved?.profileId) return saved.profileId;
      const shared = this.store.list("zernioProfile", { ownerUid: uid, limit: null }).find(item => item.profileId);
      if (shared) {
        this.store.put("zernioProfile", { id: projectId, projectId, ownerUid: uid, profileId: shared.profileId, createdAt: this.clock() });
        await this.store.flush?.();
        return shared.profileId;
      }
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
      const { credentials, delivery } = args;
      const postId = delivery.progress?.zernioPostId || delivery.externalId;
      if (!postId) return { values: {}, pending: true, unavailableReason: "This post has no analytics identifier yet." };
      let metrics, publication, analyticsError;
      const inbox = delivery.contentSnapshot?.settings?.deliveryMode === "inbox" || delivery.progress?.deliveryMode === "inbox";
      const resolvePublication = this.id === "tiktok" && !inbox;
      try {
        const result = await this.zernio(`analytics?${new URLSearchParams({ postId, accountId: credentials.zernioAccountId, platform: this.zernioPlatform, ...(credentials.zernioProfileId ? { profileId: credentials.zernioProfileId } : {}) })}`);
        const entry = analyticsEntry(result, credentials, this.zernioPlatform);
        metrics = entryMetrics(entry, this.capabilities.name);
        if (resolvePublication) publication = tiktokPublication(entry);
      } catch (error) {
        if (error.reconnect || error.authFailure || error.code === "reconnect_required") throw error;
        if (error.code === "analytics_pending") metrics = { values: {}, pending: true, unavailableReason: error.message };
        else analyticsError = error;
      }
      // Zernio backfills TikTok links after reporting publication. Older Meadow
      // deliveries need the same reconciliation, including while analytics lag.
      if (resolvePublication && delivery.status === "published" && delivery.progress?.zernioPostId && ((!delivery.url && !publication?.url) || (!/^\d+$/.test(delivery.externalId || "") && !publication?.externalId))) {
        try {
          const { post } = await this.zernio(`posts/${encodeURIComponent(delivery.progress.zernioPostId)}`);
          const resolved = tiktokPublication(analyticsEntry(post || {}, credentials, this.zernioPlatform));
          if (resolved) {
            const merged = { ...publication, ...resolved };
            publication = tiktokPublication({ status: "published", platformPostId: merged.externalId, platformPostUrl: merged.url }) || publication;
          }
        } catch { /* Link resolution must not discard a successful metrics read. */ }
      }
      if (publication && !tiktokPublication({ status: "published", platformPostId: publication.externalId || delivery.externalId, platformPostUrl: publication.url || delivery.url })) publication = null;
      if (analyticsError && !publication) throw analyticsError;
      return { ...(metrics || { values: {}, pending: true, unavailableReason: analyticsError.message }), ...(publication ? { publication } : {}) };
    }

    async accountPostAnalytics({ credentials }) {
      if (!viaZernio(credentials)) return null;
      const toDate = new Date(this.clock()).toISOString().slice(0, 10), fromDate = new Date(this.clock() - 89 * 86400000).toISOString().slice(0, 10);
      const posts = new Map();
      let partial = false;
      for (let page = 1; page <= 5; page++) {
        const query = new URLSearchParams({ accountId: credentials.zernioAccountId, platform: this.zernioPlatform, ...(credentials.zernioProfileId ? { profileId: credentials.zernioProfileId } : {}), source: "all", fromDate, toDate, limit: "100", page: String(page) });
        const result = await this.zernio(`analytics?${query}`);
        if (result.hasAnalyticsAccess === false) throw new ProviderError("Analytics access is not enabled for Meadow's Zernio connection. Contact hello@findmeadow.com.", { code: "provider_permissions" });
        invariant(Array.isArray(result.posts), "Zernio returned an incomplete analytics response. Refresh again shortly.", { status: 502 });
        for (const post of result.posts) {
          const entry = analyticsEntry(post, credentials, this.zernioPlatform);
          if (!entry || entry.status !== "published") continue;
          const id = entry.platformPostId || post._id;
          if (typeof id !== "string" || !id) continue;
          posts.set(id, { id, externalId: entry.platformPostId || post._id, zernioPostId: post.latePostId || post._id,
            title: typeof post.content === "string" ? post.content.slice(0, 2000) : "Connected account post", publishedAt: Date.parse(post.publishedAt) || null,
            url: safeUrl(entry.platformPostUrl || post.platformPostUrl), media: postMedia(post), ...entryMetrics(entry, this.capabilities.name) });
        }
        const pages = Number(result.pagination?.pages);
        invariant(Number.isSafeInteger(pages) && pages >= 0, "Zernio returned incomplete analytics pagination. Refresh again shortly.", { status: 502 });
        if (page >= pages) break;
        if (page === 5) partial = true;
      }
      return { posts: [...posts.values()], fromDate, toDate, partial, note: partial ? "Showing the latest 500 connected-account posts from the last 90 days. Totals cover the posts loaded." : posts.size ? "Includes connected-account posts from the last 90 days." : "No connected-account posts were returned for the last 90 days. Refresh again after Zernio finishes syncing this account." };
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
