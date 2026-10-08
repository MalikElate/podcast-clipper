import { inferFormat } from "./catalog.js";

export function supportsVideoCover(platform, content) {
  const format = content.format === "auto" || !content.format ? inferFormat(content.media) : content.format;
  return ["tiktok", "youtube", "instagram"].includes(platform)
    && ["video", "reel"].includes(format) && content.media.length === 1 && content.media[0]?.kind === "video"
    && !(platform === "tiktok" && content.settings?.deliveryMode === "inbox");
}

export function videoCoverErrors(platform, content) {
  const cover = content.settings?.videoCover;
  if (cover === undefined || !supportsVideoCover(platform, content)) return [];
  const video = content.media[0];
  if (!cover || typeof cover !== "object" || Array.isArray(cover) || cover.mediaId !== video.id) return ["Choose a cover from the selected video."];
  if (!Number.isSafeInteger(cover.timestampMs) || cover.timestampMs < 0 || cover.timestampMs > 2147483647
    || !Number.isFinite(video.durationSec) || cover.timestampMs >= video.durationSec * 1000) return ["Choose a cover frame within the video’s duration."];
  return [];
}

export function videoCoverTimestamp(platform, content) {
  return supportsVideoCover(platform, content) && !videoCoverErrors(platform, content).length
    ? content.settings?.videoCover?.timestampMs : undefined;
}
