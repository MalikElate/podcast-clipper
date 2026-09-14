import fs from "node:fs";
import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";

export class XProvider extends PlatformProvider {
  constructor(deps) { super("x", deps); }
  get oauth() { return { authorize: "https://x.com/i/oauth2/authorize", token: "https://api.x.com/2/oauth2/token", clientId: this.env.X_CLIENT_ID, clientSecret: this.env.X_CLIENT_SECRET, basicAuth: true, pkce: true, scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"] }; }
  request(path, credentials, options = {}) { return this.http.request(`https://api.x.com/2/${path}`, { token: credentials.accessToken, ...options }); }
  async accounts(credentials) {
    const { data } = await this.request("users/me?user.fields=profile_image_url", credentials);
    invariant(data?.id, "X did not return a profile.");
    return [{ remoteId: data.id, label: `@${data.username}`, avatar: data.profile_image_url, profileUrl: `https://x.com/${data.username}` }];
  }
  async publish(ctx) {
    const uploads = [...(ctx.progress.uploads || [])];
    for (let i = uploads.length; i < ctx.content.media.length; i++) {
      const item = ctx.content.media[i], asset = await ctx.media.prepare(item, item.kind === "video" ? "mp4" : "original");
      invariant(asset.bytes <= this.capabilities[`${item.kind}MaxBytes`], "This file exceeds X's upload limit.");
      const mediaCategory = item.kind === "video" ? "tweet_video" : item.mime === "image/gif" ? "tweet_gif" : "tweet_image";
      const start = await this.request("media/upload/initialize", ctx.credentials, { method: "POST", json: { media_type: asset.mime, total_bytes: asset.bytes, media_category: mediaCategory }, safeToRetry: true });
      const id = start.data?.id;
      invariant(id, "X did not initialize the media upload.");
      const handle = await fs.promises.open(ctx.media.storage.path(asset.key), "r");
      try {
        for (let offset = 0, segment = 0; offset < asset.bytes; offset += 4 * 1024 ** 2, segment++) {
          const buffer = Buffer.alloc(Math.min(4 * 1024 ** 2, asset.bytes - offset));
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
          const form = new FormData(); form.set("segment_index", String(segment)); form.set("media", new Blob([buffer.subarray(0, bytesRead)]), "chunk");
          await this.request(`media/upload/${id}/append`, ctx.credentials, { method: "POST", body: form, safeToRetry: true });
        }
      } finally { await handle.close(); }
      const result = await this.request(`media/upload/${id}/finalize`, ctx.credentials, { method: "POST", safeToRetry: true });
      uploads.push({ id, processing: result.data?.processing_info }); await ctx.checkpoint({ uploads });
    }
    return this.finish(ctx, uploads);
  }
  async finish(ctx, uploads) {
    for (const upload of uploads) {
      if (!upload.processing || upload.processing.state === "succeeded") continue;
      const result = await this.request(`media/upload?media_id=${upload.id}`, ctx.credentials);
      upload.processing = result.data?.processing_info;
      if (upload.processing?.state === "failed") throw new ProviderError("X could not process this media.");
      if (upload.processing && upload.processing.state !== "succeeded") return { status: "processing", progress: { uploads }, pollAfterMs: (upload.processing.check_after_secs || 15) * 1000 };
    }
    if (ctx.progress.publicationId) return { status: "published", externalId: ctx.progress.publicationId, url: `https://x.com/i/status/${ctx.progress.publicationId}` };
    const result = await this.request("tweets", ctx.credentials, { method: "POST", json: { text: ctx.content.caption, ...(uploads.length ? { media: { media_ids: uploads.map(item => item.id) } } : {}) } });
    invariant(result.data?.id, "X did not confirm a published post.", { code: "unconfirmed_publication" }); await ctx.checkpoint({ publicationId: result.data.id });
    return { status: "published", externalId: result.data.id, url: `https://x.com/i/status/${result.data.id}` };
  }
  poll(ctx) { return this.finish(ctx, ctx.progress.uploads || []); }
  async metrics({ credentials, delivery }) {
    const result = await this.request(`tweets/${delivery.externalId}?tweet.fields=public_metrics`, credentials);
    const m = result.data?.public_metrics || {};
    return { values: { impressions: m.impression_count, likes: m.like_count, comments: m.reply_count, shares: m.retweet_count === undefined && m.quote_count === undefined ? null : Number(m.retweet_count || 0) + Number(m.quote_count || 0), saves: m.bookmark_count } };
  }
}
