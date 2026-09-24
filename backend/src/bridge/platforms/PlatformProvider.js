import { createHash } from "node:crypto";
import { BridgeError, invariant, ProviderError } from "../core/errors.js";
import { inferFormat, platformCatalog } from "./catalog.js";
import { HttpTransport } from "./HttpTransport.js";

function tokenSeconds(value) {
  if (!["number", "string"].includes(typeof value) || String(value).trim() === "") return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

/** Adapter contract: authorize, exchange, accounts, options, publish, poll, metrics. */
export class PlatformProvider {
  constructor(id, { env = process.env, transport = new HttpTransport(), publicUrl, clock = Date.now, ...dependencies } = {}) {
    this.id = id;
    this.capabilities = platformCatalog[id];
    this.env = env;
    this.http = transport;
    this.publicUrl = publicUrl;
    this.clock = clock;
    Object.assign(this, dependencies);
  }
  get oauth() { return {}; }
  get configured() { const oauth = this.oauth; return Boolean(oauth.clientId && oauth.clientSecret); }
  get redirectUri() { return `${this.publicUrl}/oauth/${this.id}/callback`; }
  get authorizationScopes() { return this.oauth.scopes; }

  async authorizationUrl({ state, verifier }) {
    invariant(this.configured, `${this.capabilities.name} connections are not configured on this server yet.`, { status: 503, code: "platform_unconfigured" });
    const { authorize, clientId, scopes, pkce, clientIdParam = "client_id", extra = {} } = this.oauth;
    const url = new URL(authorize);
    const params = { [clientIdParam]: clientId, redirect_uri: this.redirectUri, response_type: "code", scope: scopes.join(this.oauth.scopeSeparator || " "), state, ...extra };
    if (pkce) Object.assign(params, { code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  }

  async exchange({ code, verifier }) {
    const { token, clientId, clientSecret, basicAuth, clientIdParam = "client_id", pkce, tokenExtra = {}, tokenDiagnosticStage } = this.oauth;
    const form = { grant_type: "authorization_code", code, redirect_uri: this.redirectUri, [clientIdParam]: clientId, ...(basicAuth ? {} : { client_secret: clientSecret }), ...(pkce ? { code_verifier: verifier } : {}), ...tokenExtra };
    const data = await this.http.request(token, { method: "POST", form, headers: basicAuth ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` } : {}, safeToRetry: true, diagnosticStage: tokenDiagnosticStage });
    return this.normalizeToken(data);
  }

  normalizeToken(data, previous = {}) {
    invariant(data.access_token, "The platform did not grant an access token.", { status: 502 });
    const now = this.clock(), expiresIn = tokenSeconds(data.expires_in);
    const credentials = { ...previous, accessToken: data.access_token, expiresAt: expiresIn === undefined ? null : now + expiresIn * 1000 };
    if (data.refresh_token) credentials.refreshToken = data.refresh_token;
    if (data.scope != null) credentials.scope = data.scope;
    if (data.open_id != null) credentials.rawAccountId = data.open_id;
    // Provider lifetimes are seconds; credentials always store Unix milliseconds.
    // An omitted refresh lifetime must not extend a fixed authorization deadline.
    const refreshExpiresAt = tokenSeconds(data.refresh_token_expires_at);
    const refreshExpiresIn = tokenSeconds(data.refresh_token_expires_in) ?? tokenSeconds(data.refresh_expires_in);
    if (refreshExpiresAt !== undefined) credentials.refreshExpiresAt = refreshExpiresAt * 1000;
    else if (refreshExpiresIn !== undefined) credentials.refreshExpiresAt = now + refreshExpiresIn * 1000;
    return credentials;
  }

  async refresh(credentials) {
    if (!credentials.refreshToken) return credentials;
    const { token, clientId, clientSecret, basicAuth, clientIdParam = "client_id" } = this.oauth;
    const data = await this.http.request(token, { method: "POST", form: { grant_type: "refresh_token", refresh_token: credentials.refreshToken, [clientIdParam]: clientId, ...(basicAuth ? {} : { client_secret: clientSecret }) }, headers: basicAuth ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` } : {}, safeToRetry: true });
    return this.normalizeToken(data, credentials);
  }

  validate(content) {
    const caps = this.capabilities;
    const format = content.format === "auto" || !content.format ? inferFormat(content.media) : content.format;
    const messages = [];
    if (!caps.formats.includes(format)) messages.push(`${caps.name} does not support this ${format} format through Meadow.`);
    const caption = content.caption || "";
    const length = ["bluesky", "kick"].includes(this.id) ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(caption)].length : [...caption].length;
    if (length > caps.captionLimit) messages.push(`${caps.name} captions can contain up to ${caps.captionLimit.toLocaleString()} characters.`);
    if (!content.media.length && !caption.trim()) messages.push("Add a caption or media.");
    if (format === "text" && content.media.length) messages.push("Text posts cannot contain media. Choose an appropriate media format.");
    if (format === "carousel" && content.media.length < 2) messages.push("A carousel needs at least two media items.");
    if (content.media.length && !["image", "video", "document"].includes(content.media[0].kind)) messages.push("This media type cannot be published.");
    if (["image", "video", "document", "story", "reel"].includes(format) && content.media.length !== 1) messages.push("This format needs exactly one media item.");
    if (caps.maxImages && content.media.length > caps.maxImages) messages.push(`${caps.name} accepts up to ${caps.maxImages} items in one post.`);
    if (content.media.length > 1 && !caps.mixedCarousel && content.media.some(item => item.kind !== "image")) messages.push(`${caps.name} multi-item posts must contain images only.`);
    if (caps.titleRequired && !(content.title || "").trim()) messages.push(`${caps.name} requires a title.`);
    if (caps.titleLimit && [...(content.title || "")].length > caps.titleLimit) messages.push(`${caps.name} titles can contain up to ${caps.titleLimit} characters.`);
    for (const media of content.media) {
      if (media.status !== "ready") messages.push(`${media.filename} is still processing.`);
      if (media.kind === "video" && caps.videoMaxSeconds && media.durationSec > caps.videoMaxSeconds) messages.push(`${media.filename} exceeds ${caps.name}'s ${Math.round(caps.videoMaxSeconds / 60)} minute video limit.`);
      const bytes = caps[`${media.kind}MaxBytes`];
      if (bytes && media.bytes > bytes) messages.push(`${media.filename} is too large for ${caps.name} (maximum ${Math.round(bytes / 1024 ** 2)} MB).`);
      if (format === "video" && media.kind !== "video" || format === "image" && media.kind !== "image" || format === "document" && media.kind !== "document" || format === "reel" && media.kind !== "video") messages.push("The selected media does not match the post format.");
      if (media.kind === "document" && !caps.formats.includes("document")) messages.push(`${caps.name} does not accept documents.`);
    }
    if (format === "story" && caption.trim()) messages.push("Story captions must be included in the uploaded media. Clear the caption for this destination.");
    return [...new Set(messages)];
  }

  async options() { return { limit: null, remaining: null, resetAt: null, limits: [], note: "The platform does not expose an exact remaining posting allowance. Meadow will queue deliveries if it reports a limit." }; }
  async accounts() { throw new Error(`${this.id}: accounts() is not implemented.`); }
  async revoke() { return { remoteRevocation: false }; }
  async publish() { throw new Error(`${this.id}: publish() is not implemented.`); }
  async poll() { throw new ProviderError("This delivery needs its result checked before retrying.", { uncertain: true }); }
  async metrics() { return { values: {}, unavailableReason: "This platform does not provide these post metrics through its API." }; }
  assertValid(content) {
    const errors = this.validate(content);
    if (errors.length) throw new BridgeError(errors.join(" "), { code: "invalid_content", details: { errors } });
  }
}
