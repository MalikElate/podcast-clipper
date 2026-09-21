import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";

const colors = ["primary", "blue", "green", "orange", "purple"];
const messageId = /^[a-zA-Z0-9_-]{1,128}$/;
const scopesOf = value => Array.isArray(value) ? value : String(value || "").split(/\s+/);
const reconnect = message => new ProviderError(message, { reconnect: true, code: "reconnect_required" });

/** A chat delivery checkpoints each confirmed message before sending its reply. */
class ChatProvider extends PlatformProvider {
  validate(content) {
    const errors = super.validate(content), settings = content.settings || {};
    if (settings.replyToMessageId && (typeof settings.replyToMessageId !== "string" || !messageId.test(settings.replyToMessageId))) errors.push("Enter a valid chat message ID to reply to.");
    if (settings.replies !== undefined && (!Array.isArray(settings.replies) || settings.replies.length > 10)) errors.push("Add up to 10 follow-up messages.");
    const messages = [content.caption, ...(Array.isArray(settings.replies) ? settings.replies : [])];
    for (const text of messages) {
      if (typeof text !== "string" || !text.trim()) { errors.push("Every chat message needs text."); continue; }
      const length = this.id === "kick" ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length : [...text].length;
      if (length > 500) errors.push("Each chat message can contain up to 500 characters.");
      if (this.id === "kick" && Buffer.byteLength(text, "utf8") > 2048) errors.push("Each Kick message must fit within 2,048 UTF-8 bytes. Shorten messages with many emoji or combining marks.");
    }
    return [...new Set(errors)];
  }

  async publish(ctx) {
    this.assertValid(ctx.content);
    const { caption, settings = {} } = ctx.content;
    const fingerprint = createHash("sha256").update(JSON.stringify({ caption, settings })).digest("hex");
    const saved = ctx.progress.chat;
    invariant(!saved || saved.fingerprint === fingerprint, "This chat was partially sent. Retry its original messages or create a new post.", { code: "chat_content_changed" });
    const sent = [...(saved?.sent || [])], messages = [caption, ...(settings.replies || [])];
    for (let index = sent.length; index < messages.length; index++) {
      // Twitch limits announcements to one every two seconds. Space follow-ups
      // too; the per-account worker lock prevents concurrent threads.
      if (this.id === "twitch") await (this.delay || delay)(2100);
      if (this.store && ctx.account.id) {
        const current = this.store.get("account", ctx.account.id);
        invariant(current?.status === "connected" && current.authorizationId === ctx.account.authorizationId, "This channel connection changed. Reconnect before sending the remaining messages.", { code: "reconnect_required" });
      }
      const parentId = settings.messageType === "announcement" ? undefined : sent.at(-1) || settings.replyToMessageId;
      const id = await this.send(ctx, messages[index], parentId, index);
      sent.push(id);
      await ctx.checkpoint({ chat: { fingerprint, sent } });
    }
    return { status: "published", externalId: sent[0], url: ctx.account.profileUrl, progress: { chat: { fingerprint, sent } } };
  }

  async metrics() { return { values: {}, unavailableReason: "Chat message engagement metrics are not available through this platform’s API." }; }
}

export class TwitchProvider extends ChatProvider {
  constructor(deps) { super("twitch", deps); }
  get oauth() { return { clientId: this.env.TWITCH_CLIENT_ID, clientSecret: this.env.TWITCH_CLIENT_SECRET, authorize: "https://id.twitch.tv/oauth2/authorize", token: "https://id.twitch.tv/oauth2/token", scopes: ["user:write:chat", "moderator:manage:announcements"], extra: { force_verify: "true" } }; }
  get maintenanceIntervalMs() { return 50 * 60000; }
  request(path, credentials, options = {}) { return this.http.request(`https://api.twitch.tv/helix/${path}`, { ...options, token: credentials.accessToken, headers: { "Client-Id": this.oauth.clientId } }); }

  async validateConnection(account, credentials) {
    const data = await this.http.request("https://id.twitch.tv/oauth2/validate", { token: credentials.accessToken });
    if (data.client_id !== this.oauth.clientId || !data.user_id || account && String(data.user_id) !== account.remoteId) throw reconnect("Reconnect the correct Twitch channel to Meadow.");
    if (!this.oauth.scopes.every(scope => scopesOf(data.scopes).includes(scope))) throw reconnect("Reconnect Twitch and allow chat messages and announcements.");
    return data;
  }

  async accounts(credentials) {
    const identity = await this.validateConnection(null, credentials);
    const data = await this.request("users", credentials);
    const user = data.data?.find(item => item.id === identity.user_id);
    if (!user?.login) throw reconnect("Twitch did not return your channel. Connect it again.");
    return [{ remoteId: user.id, label: user.display_name || user.login, avatar: user.profile_image_url, profileUrl: `https://www.twitch.tv/${encodeURIComponent(user.login)}` }];
  }

  async options(account, credentials) {
    await this.validateConnection(account, credentials);
    return { limits: [{ limit: 1, windowMs: 2100 }], allowanceKnown: true };
  }

  validate(content) {
    const errors = super.validate(content), settings = content.settings || {};
    if (settings.messageType && !["message", "announcement"].includes(settings.messageType)) errors.push("Choose a Twitch chat message or announcement.");
    if (settings.announcementColor && !colors.includes(settings.announcementColor)) errors.push("Choose a supported Twitch announcement color.");
    if (settings.messageType === "announcement" && settings.replyToMessageId) errors.push("Twitch announcements cannot reply to another message.");
    return errors;
  }

  async send(ctx, text, parentId, index) {
    const id = ctx.account.remoteId;
    if (ctx.content.settings?.messageType === "announcement") {
      const response = await this.request(`chat/announcements?broadcaster_id=${encodeURIComponent(id)}&moderator_id=${encodeURIComponent(id)}`, ctx.credentials, { method: "POST", raw: true, json: { message: text, color: ctx.content.settings.announcementColor || "primary" } });
      if (response.status !== 204) throw new ProviderError("Twitch did not confirm this announcement. Check your chat before retrying.", { uncertain: true });
      // Twitch confirms announcements with HTTP 204 but supplies no message ID.
      // This is an explicit local receipt, never used as a remote reply ID.
      return `announcement:${ctx.delivery.id}:${index}`;
    }
    const response = await this.request("chat/messages", ctx.credentials, { method: "POST", json: { broadcaster_id: id, sender_id: id, message: text, ...(parentId ? { reply_parent_message_id: parentId } : {}) } });
    const result = response.data?.[0];
    if (result?.is_sent === false) throw new ProviderError("Twitch did not send this message. Check the channel’s chat restrictions before retrying.", { code: "chat_rejected" });
    if (result?.is_sent !== true || !result.message_id) throw new ProviderError("Twitch did not confirm this message. Check your chat before retrying.", { uncertain: true });
    return result.message_id;
  }

  async revoke(credentials) {
    const response = await this.http.request("https://id.twitch.tv/oauth2/revoke", { method: "POST", safeToRetry: true, raw: true, acceptStatuses: [400], form: { client_id: this.oauth.clientId, token: credentials.accessToken } });
    if (response.status === 400) {
      const data = await response.json();
      if (data.message !== "Invalid token") throw new ProviderError("Twitch could not revoke this authorization.");
    }
    return { remoteRevocation: true };
  }
}

export class KickProvider extends ChatProvider {
  constructor(deps) { super("kick", deps); }
  get oauth() { return { clientId: this.env.KICK_CLIENT_ID, clientSecret: this.env.KICK_CLIENT_SECRET, authorize: "https://id.kick.com/oauth/authorize", token: "https://id.kick.com/oauth/token", pkce: true, scopes: ["user:read", "channel:read", "chat:write"] }; }
  request(path, credentials, options = {}) { return this.http.request(`https://api.kick.com/public/v1/${path}`, { ...options, token: credentials.accessToken }); }

  validate(content) {
    const errors = super.validate(content);
    if (content.settings?.messageType && content.settings.messageType !== "message") errors.push("Kick supports chat messages, not announcements.");
    return errors;
  }

  async accounts(credentials) {
    if (credentials.scope && !this.oauth.scopes.every(scope => scopesOf(credentials.scope).includes(scope))) throw reconnect("Reconnect Kick and allow channel access and chat messages.");
    const data = await this.request("users", credentials), user = data.data?.[0];
    if (!Number.isSafeInteger(user?.user_id) || user.user_id <= 0) throw reconnect("Kick did not return your user account. Connect it again.");
    const channels = await this.request(`channels?broadcaster_user_id=${user.user_id}`, credentials);
    const channel = channels.data?.find(item => item.broadcaster_user_id === user.user_id);
    if (!channel?.slug) throw reconnect("Kick did not return your channel. Connect it again.");
    // Kick includes an email in /users; deliberately do not persist it.
    return [{ remoteId: String(user.user_id), label: user.name || channel.slug, avatar: user.profile_picture, profileUrl: `https://kick.com/${encodeURIComponent(channel.slug)}` }];
  }

  async options(account, credentials) {
    const profiles = await this.accounts(credentials);
    if (!profiles.some(profile => profile.remoteId === account.remoteId)) throw reconnect("Reconnect the correct Kick channel to Meadow.");
    return { limits: [], allowanceKnown: false };
  }

  async send(ctx, text, parentId) {
    const id = Number(ctx.account.remoteId);
    invariant(Number.isSafeInteger(id) && id > 0, "Reconnect your Kick channel.", { code: "reconnect_required" });
    const response = await this.request("chat", ctx.credentials, { method: "POST", json: { type: "user", broadcaster_user_id: id, content: text, ...(parentId ? { reply_to_message_id: parentId } : {}) } });
    const result = response.data;
    if (result?.is_sent === false) throw new ProviderError("Kick did not send this message. Check the channel’s chat restrictions before retrying.", { code: "chat_rejected" });
    if (result?.is_sent !== true || !result.message_id) throw new ProviderError("Kick did not confirm this message. Check your chat before retrying.", { uncertain: true });
    return result.message_id;
  }

  async revoke(credentials) {
    for (const [type, token] of [["refresh_token", credentials.refreshToken], ["access_token", credentials.accessToken]]) {
      if (!token) continue;
      const url = new URL("https://id.kick.com/oauth/revoke");
      url.search = new URLSearchParams({ token, token_hint_type: type }).toString();
      // Kick documents tokens in the query. The URL must never be logged.
      await this.http.request(url.toString(), { method: "POST", safeToRetry: true, raw: true, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    }
    return { remoteRevocation: true };
  }
}
