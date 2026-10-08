export function coverVideo(platform, format, settings, media) {
  return ["tiktok", "youtube", "instagram"].includes(platform) && ["video", "reel"].includes(format)
    && !(platform === "tiktok" && settings?.deliveryMode === "inbox")
    && media.length === 1 && media[0].kind === "video" && media[0].status === "ready" && media[0].durationSec > 0
    ? media[0] : null;
}

export function coverTime(timestampMs) { return `${(timestampMs / 1000).toFixed(1)}s`; }

export function selectedCover(settings, video) {
  const cover = settings?.videoCover;
  return cover?.mediaId === video?.id && Number.isSafeInteger(cover.timestampMs) && cover.timestampMs >= 0
    && cover.timestampMs < video.durationSec * 1000 ? cover : null;
}

export const COVER_IMAGE_MAX_BYTES = 10 * 1024 ** 2;
export function coverImageError(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a JPG, PNG, or WebP cover image.";
  if (!file.size || file.size > COVER_IMAGE_MAX_BYTES) return "Choose a cover image of up to 10 MB.";
  return "";
}

export function selectedCoverImage(settings, video, media) {
  if (settings.thumbnailVideoId && settings.thumbnailVideoId !== video.id) return null;
  return media.find(item => item.id === settings.thumbnailMediaId && item.kind === "image" && item.status === "ready") || null;
}

export function removeStaleCovers(overrides, mediaIds, frozenAccountIds = []) {
  let next = overrides;
  for (const [id, override] of Object.entries(overrides || {})) {
    const staleFrame = override.settings?.videoCover && !mediaIds.includes(override.settings.videoCover.mediaId);
    const staleImage = override.settings?.thumbnailVideoId && !mediaIds.includes(override.settings.thumbnailVideoId);
    if (!frozenAccountIds.includes(id) && (staleFrame || staleImage)) {
      const settings = { ...override.settings };
      if (staleFrame) delete settings.videoCover;
      if (staleImage) { delete settings.thumbnailMediaId; delete settings.thumbnailVideoId; }
      next = { ...next, [id]: { ...override, settings } };
    }
  }
  return next;
}
