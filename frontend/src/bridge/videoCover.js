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

export function removeStaleCovers(overrides, mediaIds, frozenAccountIds = []) {
  let next = overrides;
  for (const [id, override] of Object.entries(overrides || {})) {
    if (!frozenAccountIds.includes(id) && override.settings?.videoCover && !mediaIds.includes(override.settings.videoCover.mediaId)) {
      const settings = { ...override.settings }; delete settings.videoCover;
      next = { ...next, [id]: { ...override, settings } };
    }
  }
  return next;
}
