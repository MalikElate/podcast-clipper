import { inferFormat } from "./catalog.js";

export function supportsVideoCover(platform, content) {
  const format = content.format === "auto" || !content.format ? inferFormat(content.media) : content.format;
  return ["tiktok", "youtube", "instagram"].includes(platform)
    && ["video", "reel"].includes(format) && content.media.length === 1 && content.media[0]?.kind === "video"
    && !(platform === "tiktok" && content.settings?.deliveryMode === "inbox");
}

export function videoCoverErrors(platform, content) {
  if (!supportsVideoCover(platform, content)) return [];
  if (content.settings?.thumbnailMediaId) {
    if (content.settings.thumbnailVideoId && content.settings.thumbnailVideoId !== content.media[0].id) return ["Choose a cover for the selected video."];
    return customCoverImageErrors(content.thumbnail);
  }
  const cover = content.settings?.videoCover;
  if (cover === undefined) return [];
  const video = content.media[0];
  if (!cover || typeof cover !== "object" || Array.isArray(cover) || cover.mediaId !== video.id) return ["Choose a cover from the selected video."];
  if (!Number.isSafeInteger(cover.timestampMs) || cover.timestampMs < 0 || cover.timestampMs > 2147483647
    || !Number.isFinite(video.durationSec) || cover.timestampMs >= video.durationSec * 1000) return ["Choose a cover frame within the video’s duration."];
  return [];
}

export function videoCoverTimestamp(platform, content) {
  return !content.settings?.thumbnailMediaId && supportsVideoCover(platform, content) && !videoCoverErrors(platform, content).length
    ? content.settings?.videoCover?.timestampMs : undefined;
}

export function customCoverImageErrors(image) {
  if (!image || image.kind !== "image" || image.status !== "ready") return ["Upload a ready image for the video cover."];
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.mime)) return ["Choose a JPG, PNG, or WebP cover image."];
  if (!(image.bytes > 0 && image.bytes <= 10 * 1024 ** 2)) return ["Choose a cover image of up to 10 MB."];
  return [];
}

export function customVideoCover(platform, content) {
  return content.settings?.thumbnailMediaId && supportsVideoCover(platform, content) && !videoCoverErrors(platform, content).length ? content.thumbnail : null;
}
