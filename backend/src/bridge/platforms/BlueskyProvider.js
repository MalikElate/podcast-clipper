import { Agent, RichText } from "@atproto/api";
import { NodeOAuthClient } from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/jwk-jose";
import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError, BridgeError } from "../core/errors.js";
import { SecretVault } from "../core/SecretVault.js";

/** The official OAuth client owns DPoP, token refresh and identity discovery. */
export class BlueskyProvider extends PlatformProvider {
  constructor(deps) { super("bluesky", deps); this.clientPromise = null; }
  get configured() { return Boolean(this.env.BLUESKY_PRIVATE_KEY && this.publicUrl?.startsWith("https://") && this.vault?.configured); }
  encryptedStore(kind) {
    return {
      get: async key => { const row = this.store.get(kind, SecretVault.hash(key)); return row && (!row.expiresAt || row.expiresAt > Date.now()) ? this.vault.decrypt(row.encrypted, `${kind}:${key}`) : undefined; },
      set: async (key, value) => this.store.put(kind, { id: SecretVault.hash(key), encrypted: this.vault.encrypt(value, `${kind}:${key}`), ...(kind === "blueskyState" ? { expiresAt: Date.now() + 15 * 60000 } : {}) }),
      del: async key => this.store.remove(kind, SecretVault.hash(key)),
    };
  }
  async client() {
    invariant(this.configured, "Bluesky connections are not configured on this server.", { status: 503 });
    if (!this.clientPromise) this.clientPromise = (async () => new NodeOAuthClient({
      clientMetadata: { client_id: `${this.publicUrl}/oauth/bluesky/client-metadata.json`, client_name: "Bridge", client_uri: this.env.BRIDGE_APP_URL || this.publicUrl, redirect_uris: [this.redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], scope: "atproto transition:generic", application_type: "web", token_endpoint_auth_method: "private_key_jwt", token_endpoint_auth_signing_alg: "ES256", dpop_bound_access_tokens: true, jwks_uri: `${this.publicUrl}/oauth/bluesky/jwks.json` },
      keyset: [await JoseKey.fromImportable(this.env.BLUESKY_PRIVATE_KEY.replaceAll("\\n", "\n"), "bridge-1")],
      stateStore: this.encryptedStore("blueskyState"), sessionStore: this.encryptedStore("blueskySession"),
      requestLock: (key, fn) => this.locks.withLock(`bluesky:${key}`, fn),
    }))().catch(error => { this.clientPromise = null; throw error; });
    return this.clientPromise;
  }
  async authorizationUrl({ state, handle }) {
    invariant(typeof handle === "string" && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(handle) && handle.length <= 253, "Enter your Bluesky handle, such as name.bsky.social.");
    return String(await (await this.client()).authorize(handle, { state }));
  }
  async finishAuthorization(params) {
    const { session, state } = await (await this.client()).callback(params);
    const agent = new Agent(session), { data } = await agent.getProfile({ actor: session.did });
    return { state, credentials: { did: session.did }, candidates: [{ remoteId: session.did, label: `@${data.handle}`, avatar: data.avatar, profileUrl: `https://bsky.app/profile/${data.handle}` }] };
  }
  async agent(credentials) {
    try { return new Agent(await (await this.client()).restore(credentials.did)); }
    catch { throw new ProviderError("Reconnect this Bluesky account.", { reconnect: true, code: "reconnect_required" }); }
  }
  async publish(ctx) {
    try { return await this.publishContent(ctx); }
    catch (error) { throw error instanceof BridgeError ? error : this.sdkError(error, false); }
  }
  sdkError(error, publishing) {
    if (error.status === 429) {
      const resetAt = Number(error.headers?.["ratelimit-reset"] || error.headers?.["x-ratelimit-reset"]) * 1000;
      return new ProviderError("Bluesky's posting allowance has been reached.", { retryable: true, code: "rate_limited", retryAt: resetAt > Date.now() ? resetAt : null });
    }
    if (error.status === 401) return new ProviderError("Reconnect this Bluesky account.", { reconnect: true, code: "reconnect_required" });
    if (error.status >= 400 && error.status < 500) return new ProviderError("Bluesky rejected the post. Check its media and text.");
    return new ProviderError(publishing ? "Bluesky did not confirm this post. Check the account before retrying." : "Bluesky could not prepare the media. Bridge will try again.", { uncertain: publishing, retryable: !publishing });
  }
  async publishContent(ctx) {
    const agent = await this.agent(ctx.credentials), images = [], video = ctx.content.media[0]?.kind === "video";
    for (const item of ctx.content.media) {
      const asset = await ctx.media.prepare(item, video ? "mp4" : "jpeg");
      invariant(asset.bytes <= this.capabilities[`${item.kind}MaxBytes`], "The converted file exceeds Bluesky's media limit.");
      const blob = await ctx.media.storage.blob(asset.key, asset.mime);
      const uploaded = await agent.uploadBlob(blob, { encoding: asset.mime });
      images.push({ image: uploaded.data.blob, alt: ctx.content.settings?.altText || "", aspectRatio: { width: item.width, height: item.height } });
    }
    const rt = new RichText({ text: ctx.content.caption });
    await rt.detectFacets(agent);
    // A deterministic record key makes retries of this destination idempotent.
    const rkey = `bridge-${ctx.delivery.id}`, record = { $type: "app.bsky.feed.post", text: rt.text, facets: rt.facets, createdAt: new Date(ctx.delivery.createdAt).toISOString(), ...(images.length ? { embed: video ? { $type: "app.bsky.embed.video", video: images[0].image, alt: images[0].alt, aspectRatio: images[0].aspectRatio } : { $type: "app.bsky.embed.images", images } } : {}) };
    try {
      const { data } = await agent.com.atproto.repo.putRecord({ repo: ctx.credentials.did, collection: "app.bsky.feed.post", rkey, record, validate: true });
      return { status: "published", externalId: data.uri, url: `https://bsky.app/profile/${ctx.credentials.did}/post/${rkey}` };
    } catch (error) {
      throw this.sdkError(error, true);
    }
  }
  async metrics({ credentials, delivery }) {
    const agent = await this.agent(credentials), result = await agent.getPosts({ uris: [delivery.externalId] });
    const post = result.data.posts[0] || {};
    return { values: { likes: post.likeCount, comments: post.replyCount, shares: post.repostCount === undefined && post.quoteCount === undefined ? null : Number(post.repostCount || 0) + Number(post.quoteCount || 0) } };
  }
}
