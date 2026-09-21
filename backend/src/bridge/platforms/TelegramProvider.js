import { timingSafeEqual } from "node:crypto";
import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";

const TELEGRAM_API = "https://api.telegram.org";
const captionLength = value => [...(value || "")].length;

export class TelegramProvider extends PlatformProvider {
  constructor(dependencies) { super("telegram", dependencies); }

  get token() { return this.env.TELEGRAM_BOT_TOKEN; }
  get username() { return String(this.env.TELEGRAM_BOT_USERNAME || "").replace(/^@/, ""); }
  get configured() {
    return /^\d+:[A-Za-z0-9_-]{20,}$/.test(this.token || "")
      && /^[A-Za-z0-9_]{5,32}$/.test(this.username)
      && /^[A-Za-z0-9_-]{16,256}$/.test(this.env.TELEGRAM_WEBHOOK_SECRET || "")
      && this.publicUrl?.startsWith("https://");
  }

  authorizationUrl({ state }) {
    invariant(this.configured, "Telegram connections are not configured on this server yet.", { status: 503, code: "platform_unconfigured" });
    const url = new URL(`https://t.me/${this.username}`);
    url.searchParams.set("start", state);
    return url.toString();
  }

  verifyWebhook(actual) {
    const expected = Buffer.from(this.env.TELEGRAM_WEBHOOK_SECRET || "");
    const supplied = Buffer.from(String(actual || ""));
    return expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  async request(method, options = {}) {
    invariant(this.configured, "Telegram connections are not configured on this server yet.", { status: 503, code: "platform_unconfigured" });
    const data = await this.http.request(`${TELEGRAM_API}/bot${this.token}/${method}`, options);
    if (!data?.ok) throw new ProviderError("Telegram could not complete the request. Check the bot's access to this chat.", { code: "provider_rejected" });
    return data.result;
  }

  configureWebhook() {
    return this.request("setWebhook", { method: "POST", safeToRetry: true, json: {
      url: `${this.publicUrl}/api/telegram/webhook`,
      secret_token: this.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "my_chat_member"],
    } });
  }

  channelLink() { return `https://t.me/${this.username}?startchannel&admin=post_messages`; }
  groupLink(state) { return `https://t.me/${this.username}?startgroup=${encodeURIComponent(state)}`; }

  sendConnectionPrompt(userId, state) {
    return this.sendMessage(userId, "Choose the Telegram destination you want to connect to Meadow. For a channel, Telegram will ask you to add Meadow Publisher as an administrator with permission to post messages.", {
      inline_keyboard: [
        [{ text: "Add to a channel", url: this.channelLink() }],
        [{ text: "Add to a group", url: this.groupLink(state) }],
      ],
    });
  }

  sendConnected(userId, chat) {
    const label = chat.title || (chat.username ? `@${chat.username}` : "Telegram destination");
    return this.sendMessage(userId, `${label} is connected to Meadow. Return to Meadow to schedule your first Telegram post.`, {
      inline_keyboard: [[{ text: "Return to Meadow", url: `${this.env.BRIDGE_APP_URL || "https://app.findmeadow.com"}/dashboard/connections` }]],
    });
  }

  sendMessage(chatId, text, replyMarkup) {
    return this.request("sendMessage", { method: "POST", json: { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) } });
  }

  validate(content) {
    const messages = super.validate(content);
    if (content.media.length && captionLength(content.caption) > 1024) messages.push("Telegram media captions can contain up to 1,024 characters.");
    if (content.media.length > 1 && content.media.some(item => item.kind === "document")) messages.push("Telegram document posts can contain one document at a time through Meadow.");
    return [...new Set(messages)];
  }

  async mediaForm(ctx) {
    const prepared = [];
    for (const item of ctx.content.media) {
      const variant = item.kind === "image" ? "jpeg" : item.kind === "video" ? "mp4" : "original";
      const asset = await ctx.media.prepare(item, variant);
      invariant(!this.capabilities[`${item.kind}MaxBytes`] || asset.bytes <= this.capabilities[`${item.kind}MaxBytes`], `${item.filename} exceeds Telegram's upload limit.`);
      prepared.push({ item, asset, blob: await ctx.media.storage.blob(asset.key, asset.mime) });
    }
    return prepared;
  }

  async publish(ctx) {
    const chatId = ctx.credentials.chatId;
    invariant(chatId != null && String(chatId) === ctx.account.remoteId, "Reconnect this Telegram destination.", { code: "reconnect_required" });
    let result;
    if (!ctx.content.media.length) {
      result = await this.sendMessage(chatId, ctx.content.caption);
    } else {
      const prepared = await this.mediaForm(ctx), form = new FormData();
      form.set("chat_id", String(chatId));
      if (prepared.length === 1) {
        const { item, asset, blob } = prepared[0];
        if (ctx.content.caption) form.set("caption", ctx.content.caption);
        const method = item.kind === "image" ? "sendPhoto" : item.kind === "video" ? "sendVideo" : "sendDocument";
        form.set(item.kind === "image" ? "photo" : item.kind, blob, item.filename || `upload.${asset.variant}`);
        result = await this.request(method, { method: "POST", body: form });
      } else {
        const media = prepared.map(({ item }, index) => ({ type: item.kind === "image" ? "photo" : item.kind, media: `attach://file${index}`, ...(index === 0 && ctx.content.caption ? { caption: ctx.content.caption } : {}) }));
        form.set("media", JSON.stringify(media));
        prepared.forEach(({ item, asset, blob }, index) => form.set(`file${index}`, blob, item.filename || `upload.${asset.variant}`));
        result = await this.request("sendMediaGroup", { method: "POST", body: form });
      }
    }
    const message = Array.isArray(result) ? result[0] : result;
    invariant(message?.message_id != null, "Telegram did not confirm the published message.", { code: "unconfirmed_publication" });
    const username = message.chat?.username;
    return { status: "published", externalId: String(message.message_id), url: username ? `https://t.me/${username}/${message.message_id}` : null };
  }

  async metrics() {
    return { values: {}, unavailableReason: "Telegram's Bot API does not provide post performance metrics for connected channels or groups." };
  }
}
