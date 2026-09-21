import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";

export class LinkedInProvider extends PlatformProvider {
  constructor(deps) { super("linkedin", deps); }
  get headers() { return { "LinkedIn-Version": this.env.LINKEDIN_VERSION || "202607", "X-Restli-Protocol-Version": "2.0.0" }; }
  get oauth() { return { authorize: "https://www.linkedin.com/oauth/v2/authorization", token: "https://www.linkedin.com/oauth/v2/accessToken", clientId: this.env.LINKEDIN_CLIENT_ID, clientSecret: this.env.LINKEDIN_CLIENT_SECRET, scopes: (this.env.LINKEDIN_SCOPES || "openid profile w_member_social").split(/[, ]+/).filter(Boolean) }; }
  request(path, credentials, options = {}) { return this.http.request(`https://api.linkedin.com/rest/${path}`, { token: credentials.accessToken, headers: this.headers, ...options }); }
  async accounts(credentials) {
    const user = await this.http.request("https://api.linkedin.com/v2/userinfo", { token: credentials.accessToken });
    invariant(user.sub, "LinkedIn did not return a member profile.");
    const candidates = [{ remoteId: `urn:li:person:${user.sub}`, label: user.name || "LinkedIn member", avatar: user.picture }];
    if (this.oauth.scopes.includes("rw_organization_admin")) {
      const result = await this.request("organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100", credentials);
      for (const item of result.elements || []) {
        const urn = item.organization || item.organizationTarget;
        if (!urn) continue;
        const organization = await this.request(`organizations/${urn.split(":").at(-1)}`, credentials);
        candidates.push({ remoteId: urn, label: organization.localizedName || "LinkedIn organization", profileUrl: organization.vanityName ? `https://www.linkedin.com/company/${organization.vanityName}/` : undefined });
      }
    }
    return candidates;
  }
  async publish(ctx) {
    const uploads = [...(ctx.progress.uploads || [])];
    for (let i = uploads.length; i < ctx.content.media.length; i++) {
      const item = ctx.content.media[i], asset = await ctx.media.prepare(item, item.kind === "video" ? "mp4" : item.kind === "image" ? "jpeg" : "original");
      invariant(asset.bytes <= this.capabilities[`${item.kind}MaxBytes`], "The converted file exceeds LinkedIn's upload limit.");
      const collection = item.kind === "video" ? "videos" : item.kind === "image" ? "images" : "documents";
      const init = await this.request(`${collection}?action=initializeUpload`, ctx.credentials, { method: "POST", safeToRetry: true, json: { initializeUploadRequest: { owner: ctx.account.remoteId, ...(item.kind === "video" ? { fileSizeBytes: asset.bytes, uploadCaptions: false, uploadThumbnail: false } : {}) } } });
      const data = init.value, urn = data?.[item.kind];
      invariant(urn, "LinkedIn did not initialize the media upload.");
      const instructions = data.uploadInstructions || [{ uploadUrl: data.uploadUrl, firstByte: 0, lastByte: asset.bytes - 1 }], parts = [];
      for (const instruction of instructions) {
        const hostname = new URL(instruction.uploadUrl).hostname;
        invariant(hostname === "www.linkedin.com" || hostname.endsWith(".linkedin.com") || hostname.endsWith(".licdn.com"), "LinkedIn returned an invalid upload endpoint.");
        invariant(Number.isInteger(instruction.firstByte) && Number.isInteger(instruction.lastByte) && instruction.firstByte >= 0 && instruction.lastByte >= instruction.firstByte && instruction.lastByte < asset.bytes, "LinkedIn returned an invalid media byte range.");
        const response = await this.http.request(instruction.uploadUrl, { method: "PUT", token: ctx.credentials.accessToken, headers: { "Content-Type": asset.mime, "Content-Length": String(instruction.lastByte - instruction.firstByte + 1) }, body: ctx.media.storage.stream(asset.key, { start: instruction.firstByte, end: instruction.lastByte }), raw: true, safeToRetry: true, timeoutMs: 15 * 60000 });
        parts.push(response.headers.get("etag")?.replaceAll('"', "")); await response.body?.cancel();
      }
      if (item.kind === "video") {
        invariant(parts.every(Boolean), "LinkedIn did not confirm all uploaded video parts.");
        await this.request("videos?action=finalizeUpload", ctx.credentials, { method: "POST", safeToRetry: true, json: { finalizeUploadRequest: { video: urn, uploadToken: data.uploadToken, uploadedPartIds: parts } } });
      }
      uploads.push({ urn, collection, kind: item.kind }); await ctx.checkpoint({ uploads });
    }
    return this.finish(ctx, uploads);
  }
  async finish(ctx, uploads) {
    for (const upload of uploads) {
      // LinkedIn's versioned Images GET rejects write-only w_member_social.
      // Its documented legacy Images GET supports the image owner's token.
      const memberImage = upload.kind === "image" && ctx.account.remoteId.startsWith("urn:li:person:");
      const result = await this.request(`${upload.collection}/${encodeURIComponent(upload.urn)}`, ctx.credentials, memberImage ? { headers: { "X-Restli-Protocol-Version": "2.0.0" } } : {});
      if (["PROCESSING_FAILED", "FAILED"].includes(result.status)) throw new ProviderError("LinkedIn could not process this file.");
      if (result.status !== "AVAILABLE") return { status: "processing", progress: { uploads }, pollAfterMs: 15000 };
    }
    if (ctx.progress.publicationId) return { status: "published", externalId: ctx.progress.publicationId, url: `https://www.linkedin.com/feed/update/${ctx.progress.publicationId}/` };
    const content = uploads.length > 1 ? { multiImage: { images: uploads.map(upload => ({ id: upload.urn })) } } : uploads.length ? { media: { id: uploads[0].urn, ...(ctx.content.title ? { title: ctx.content.title } : {}) } } : undefined;
    const response = await this.request("posts", ctx.credentials, { method: "POST", raw: true, json: { author: ctx.account.remoteId, commentary: ctx.content.caption, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, ...(content ? { content } : {}), lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false } });
    const id = response.headers.get("x-restli-id"); await response.body?.cancel();
    invariant(id, "LinkedIn did not confirm a published post.", { code: "unconfirmed_publication" }); await ctx.checkpoint({ publicationId: id });
    return { status: "published", externalId: id, url: `https://www.linkedin.com/feed/update/${id}/` };
  }
  poll(ctx) { return this.finish(ctx, ctx.progress.uploads || []); }
  async metrics({ credentials, account, delivery }) {
    if (account.remoteId.startsWith("urn:li:organization:")) {
      const field = delivery.externalId.startsWith("urn:li:ugcPost:") ? "ugcPosts" : "shares";
      const result = await this.request(`organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(account.remoteId)}&${field}=List(${encodeURIComponent(delivery.externalId)})`, credentials);
      const s = result.elements?.[0]?.totalShareStatistics || {};
      return { values: { impressions: s.impressionCount, likes: s.likeCount, comments: s.commentCount, shares: s.shareCount, clicks: s.clickCount } };
    }
    const result = await this.request(`socialActions/${encodeURIComponent(delivery.externalId)}`, credentials);
    return { values: { likes: result.likesSummary?.totalLikes, comments: result.commentsSummary?.aggregatedTotalComments }, note: "Member post analytics require restricted LinkedIn read permissions; some metrics are unavailable." };
  }
}
