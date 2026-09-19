import { PlatformProvider } from "./PlatformProvider.js";
import { invariant, ProviderError } from "../core/errors.js";

class GoogleProvider extends PlatformProvider {
  async revoke(credentials) {
    const response = await this.http.request("https://oauth2.googleapis.com/revoke", {
      method: "POST", form: { token: credentials.refreshToken || credentials.accessToken },
      raw: true, acceptStatuses: [400], safeToRetry: true,
    });
    if (response.status === 400) {
      const data = await response.json().catch(() => ({}));
      if (data.error !== "invalid_token") throw new ProviderError("Google could not revoke this authorization yet.", { retryable: true, code: "revocation_failed" });
    }
    return { remoteRevocation: true };
  }
  get oauth() {
    const prefix = this.id === "google_business" ? "GOOGLE_BUSINESS" : "YOUTUBE";
    const existingClientId = this.id === "google_business" ? this.env.YOUTUBE_CLIENT_ID : undefined;
    const existingClientSecret = this.id === "google_business" ? this.env.YOUTUBE_CLIENT_SECRET : undefined;
    return { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", clientId: this.env[`${prefix}_CLIENT_ID`] || this.env.GOOGLE_CLIENT_ID || existingClientId, clientSecret: this.env[`${prefix}_CLIENT_SECRET`] || this.env.GOOGLE_CLIENT_SECRET || existingClientSecret,
      pkce: true, scopes: this.id === "youtube" ? ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"] : ["https://www.googleapis.com/auth/business.manage"], extra: { access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true" } };
  }
}

export class YouTubeProvider extends GoogleProvider {
  constructor(deps) { super("youtube", deps); }
  async accounts(credentials) {
    const result = await this.http.request("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { token: credentials.accessToken });
    return (result.items || []).map(item => ({ remoteId: item.id, label: item.snippet.title, avatar: item.snippet.thumbnails?.default?.url, profileUrl: `https://www.youtube.com/channel/${item.id}` }));
  }
  validate(content) {
    const errors = super.validate(content);
    if (!["public", "unlisted", "private"].includes(content.settings?.privacy)) errors.push("Choose a YouTube visibility setting.");
    if (typeof content.settings?.madeForKids !== "boolean") errors.push("Choose whether this YouTube video is made for kids.");
    if (/<|>/.test(content.title)) errors.push("YouTube titles cannot contain < or >.");
    return errors;
  }
  async publish(ctx) {
    const { content, credentials, progress, checkpoint } = ctx;
    const asset = await ctx.media.prepare(content.media[0], "mp4");
    let uploadUrl = progress.uploadUrl;
    if (!uploadUrl) {
      const response = await this.http.request("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method: "POST", token: credentials.accessToken, raw: true, safeToRetry: true,
        headers: { "X-Upload-Content-Type": asset.mime, "X-Upload-Content-Length": String(asset.bytes) },
        json: { snippet: { title: content.title, description: content.caption, categoryId: "22" }, status: { privacyStatus: content.settings.privacy, selfDeclaredMadeForKids: content.settings.madeForKids, containsSyntheticMedia: Boolean(content.settings.syntheticMedia) } } });
      uploadUrl = response.headers.get("location");
      invariant(uploadUrl && new URL(uploadUrl).hostname === "www.googleapis.com", "YouTube did not return a valid upload session.");
      await checkpoint({ phase: "upload", uploadUrl, key: asset.key, bytes: asset.bytes, mime: asset.mime });
    }
    try {
      const video = await this.http.request(uploadUrl, { method: "PUT", token: credentials.accessToken, body: ctx.media.storage.stream(asset.key), headers: { "Content-Type": asset.mime, "Content-Length": String(asset.bytes) }, timeoutMs: 30 * 60000 });
      invariant(video.id, "YouTube did not return a video identifier.", { code: "unconfirmed_publication" });
      await checkpoint({ phase: "video_processing", videoId: video.id });
      return { status: "processing", externalId: video.id, progress: { phase: "video_processing", videoId: video.id } };
    } catch (error) {
      if (error.uncertain) return { status: "processing", progress: { phase: "upload", uploadUrl, key: asset.key, bytes: asset.bytes, mime: asset.mime }, pollAfterMs: 15000 };
      throw error;
    }
  }
  async poll(ctx) {
    const { progress, credentials, checkpoint } = ctx;
    let videoId = progress.videoId;
    if (progress.phase === "upload") {
      const response = await this.http.request(progress.uploadUrl, { method: "PUT", token: credentials.accessToken, raw: true, acceptStatuses: [308], safeToRetry: true, headers: { "Content-Length": "0", "Content-Range": `bytes */${progress.bytes}` } });
      if (response.status === 308) {
        const range = response.headers.get("range");
        const start = range ? Number(range.match(/-(\d+)$/)?.[1]) + 1 : 0;
        invariant(Number.isFinite(start) && start < progress.bytes, "YouTube returned an invalid upload range.");
        try {
          const video = await this.http.request(progress.uploadUrl, { method: "PUT", token: credentials.accessToken, body: ctx.media.storage.stream(progress.key, { start }), headers: { "Content-Type": progress.mime, "Content-Length": String(progress.bytes - start), "Content-Range": `bytes ${start}-${progress.bytes - 1}/${progress.bytes}` }, timeoutMs: 30 * 60000 });
          videoId = video.id;
        } catch (error) { if (error.uncertain) return { status: "processing", progress }; throw error; }
      } else videoId = (await response.json()).id;
      invariant(videoId, "YouTube did not confirm this upload.", { code: "unconfirmed_publication" });
      await checkpoint({ phase: "video_processing", videoId });
    }
    const result = await this.http.request(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(videoId)}`, { token: credentials.accessToken });
    const video = result.items?.[0];
    if (!video) throw new ProviderError("YouTube has not returned this video. Check the channel before retrying.", { uncertain: true });
    if (["failed", "rejected", "deleted"].includes(video.status?.uploadStatus) || video.processingDetails?.processingStatus === "failed") throw new ProviderError("YouTube rejected this video. Check the upload in YouTube Studio.");
    if (video.status?.uploadStatus === "processed" || video.processingDetails?.processingStatus === "succeeded") {
      if (video.status?.privacyStatus !== ctx.content.settings.privacy) throw new ProviderError("YouTube uploaded the video, but its visibility does not match your selection. Check the video in YouTube Studio and your API project's audit status before retrying.", { uncertain: true });
      return { status: "published", externalId: videoId, url: `https://www.youtube.com/watch?v=${videoId}`, progress: { videoId } };
    }
    return { status: "processing", progress: { phase: "video_processing", videoId }, pollAfterMs: 30000 };
  }
  async metrics({ credentials, delivery }) {
    const result = await this.http.request(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(delivery.externalId)}`, { token: credentials.accessToken });
    if (!result.items?.length) return { values: {}, removed: true, note: "This video is no longer available from YouTube." };
    const stats = result.items?.[0]?.statistics || {};
    const values = { views: stats.viewCount, likes: stats.likeCount, comments: stats.commentCount };
    let note;
    try {
      const start = new Date(delivery.publishedAt).toISOString().slice(0, 10), end = new Date().toISOString().slice(0, 10);
      const report = await this.http.request(`https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3DMINE&startDate=${start}&endDate=${end}&metrics=shares&dimensions=video&filters=${encodeURIComponent(`video==${delivery.externalId}`)}`, { token: credentials.accessToken });
      if (report.rows?.length) values.shares = report.rows[0][1];
    } catch (error) { if (error.reconnect) throw error; note = "YouTube share analytics are not available for this account or reporting period."; }
    return { values, note };
  }
}

export class GoogleBusinessProvider extends GoogleProvider {
  constructor(deps) { super("google_business", deps); }
  async accounts(credentials) {
    const token = credentials.accessToken;
    const candidates = [];
    let accountPageToken = "";
    do {
      const response = await this.http.request(`https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20${accountPageToken ? `&pageToken=${encodeURIComponent(accountPageToken)}` : ""}`, { token });
      for (const account of response.accounts || []) {
        let locationPageToken = "";
        do {
          const page = await this.http.request(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title&pageSize=100${locationPageToken ? `&pageToken=${encodeURIComponent(locationPageToken)}` : ""}`, { token });
          for (const location of page.locations || []) {
            candidates.push({ remoteId: `${account.name}/${location.name}`, label: location.title, metadata: { resourceName: `${account.name}/${location.name}` } });
            if (candidates.length === 100) return candidates;
          }
          locationPageToken = page.nextPageToken || "";
        } while (locationPageToken);
      }
      accountPageToken = response.nextPageToken || "";
    } while (accountPageToken);
    return candidates;
  }
  async publish(ctx) {
    const media = [];
    for (const item of ctx.content.media) {
      const asset = await ctx.media.prepare(item, "jpeg");
      media.push({ mediaFormat: "PHOTO", sourceUrl: ctx.media.url(item, { variant: asset.variant, external: true }) });
    }
    const result = await this.http.request(`https://mybusiness.googleapis.com/v4/${ctx.account.remoteId}/localPosts`, { method: "POST", token: ctx.credentials.accessToken, json: { languageCode: ctx.content.settings.languageCode || "en", summary: ctx.content.caption, topicType: "STANDARD", ...(media.length ? { media } : {}) } });
    invariant(result.name, "Google Business did not return a post identifier.", { code: "unconfirmed_publication" });
    await ctx.checkpoint({ publicationId: result.name });
    return result.state === "LIVE" ? { status: "published", externalId: result.name, url: result.searchUrl } : { status: "processing", externalId: result.name, progress: { publicationId: result.name } };
  }
  async poll(ctx) {
    const result = await this.http.request(`https://mybusiness.googleapis.com/v4/${ctx.progress.publicationId}`, { token: ctx.credentials.accessToken });
    if (result.state === "REJECTED") throw new ProviderError("Google Business rejected this post. Check the content in your Business Profile.");
    return result.state === "LIVE" ? { status: "published", externalId: result.name, url: result.searchUrl } : { status: "processing", progress: ctx.progress, pollAfterMs: 30000 };
  }
  async metrics() {
    return { values: {}, unavailableReason: "Google retired Business Profile post analytics. Metrics for individual local posts are unavailable through its API." };
  }
}
