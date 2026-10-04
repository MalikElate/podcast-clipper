// What Meadow can publish to each platform, shown on the public platform pages.
// The composer reads these same numbers from the API after sign-in, but the
// marketing pages are prerendered without one, so they need this build-time copy.
// platform-specs.test.js compares every value against the backend catalog and
// fails when the two drift apart.
export const PLATFORM_SPECS = {
  instagram: { accountType: "Professional account", captionLimit: 2200, formats: ["image", "video", "carousel", "story"], maxImages: 10, mixedCarousel: true, videoMaxSeconds: 900, videoMaxBytes: 1000 * 1024 ** 2, imageMaxBytes: 8 * 1024 ** 2 },
  tiktok: { accountType: "Creator account", captionLimit: 2200, formats: ["video", "image", "carousel"], maxImages: 35, mixedCarousel: false, videoMaxSeconds: null, videoMaxBytes: 4 * 1024 ** 3, imageMaxBytes: 20 * 1024 ** 2 },
  youtube: { accountType: "Channel", captionLimit: 5000, titleLimit: 100, titleRequired: true, formats: ["video"], videoMaxSeconds: 43200, videoMaxBytes: 256 * 1024 ** 3 },
  x: { accountType: "Profile", captionLimit: 280, formats: ["text", "image", "video", "carousel"], maxImages: 4, mixedCarousel: false, videoMaxSeconds: 140, videoMaxBytes: 512 * 1024 ** 2, imageMaxBytes: 5 * 1024 ** 2 },
  linkedin: { accountType: "Profile or organization", captionLimit: 3000, formats: ["text", "image", "video", "carousel", "document"], maxImages: 20, mixedCarousel: false, videoMaxSeconds: 900, videoMaxBytes: 5 * 1024 ** 3, imageMaxBytes: 20 * 1024 ** 2, documentMaxBytes: 100 * 1024 ** 2 },
  facebook: { accountType: "Page", captionLimit: 63206, formats: ["text", "image", "video", "carousel", "reel", "story"], maxImages: 10, mixedCarousel: false, videoMaxSeconds: 14400, videoMaxBytes: 10 * 1024 ** 3 },
  telegram: { accountType: "Channel or group", captionLimit: 4096, formats: ["text", "image", "video", "carousel", "document"], maxImages: 10, mixedCarousel: true, imageMaxBytes: 10 * 1024 ** 2, videoMaxBytes: 50 * 1024 ** 2, documentMaxBytes: 50 * 1024 ** 2 },
  threads: { accountType: "Profile", captionLimit: 500, formats: ["text", "image", "video", "carousel"], maxImages: 20, mixedCarousel: true, videoMaxSeconds: 300, videoMaxBytes: 1000 * 1024 ** 2, imageMaxBytes: 8 * 1024 ** 2 },
  bluesky: { accountType: "Profile", captionLimit: 300, formats: ["text", "image", "video", "carousel"], maxImages: 4, mixedCarousel: false, videoMaxSeconds: 180, videoMaxBytes: 100 * 1024 ** 2, imageMaxBytes: 1024 ** 2 },
  pinterest: { accountType: "Account and board", captionLimit: 800, titleLimit: 100, formats: ["image", "video", "carousel"], maxImages: 5, mixedCarousel: false, videoMaxSeconds: 900, videoMaxBytes: 2 * 1024 ** 3, imageMaxBytes: 20 * 1024 ** 2 },
  google_business: { accountType: "Business location", captionLimit: 1500, formats: ["text", "image", "carousel"], maxImages: 10, mixedCarousel: false, imageMaxBytes: 5 * 1024 ** 2 },
  twitch: { accountType: "Channel chat", captionLimit: 500, formats: ["text"] },
  kick: { accountType: "Channel chat", captionLimit: 500, formats: ["text"] },
};

const FORMAT_NAMES = { text: "Text", image: "Photo", video: "Video", carousel: "Carousel", story: "Story", reel: "Reel", document: "Document" };

export function formatBytes(bytes) {
  if (!bytes) return null;
  const mb = bytes / 1024 ** 2;
  return mb >= 1024 ? `${Number((mb / 1024).toFixed(1))} GB` : `${Math.round(mb).toLocaleString()} MB`;
}

export function formatDuration(seconds) {
  if (!seconds) return null;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const minuteLabel = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return rest ? `${minuteLabel} ${rest} seconds` : minuteLabel;
}

// Rows for the spec list. Only facts the adapter actually enforces are listed, so a
// platform that has no limit for something shows nothing rather than a guess.
export function specRows(platformId, platformName) {
  const spec = PLATFORM_SPECS[platformId];
  if (!spec) return [];
  const rows = [
    { label: "Account needed", value: spec.accountType },
    { label: "Post types", value: spec.formats.map(format => FORMAT_NAMES[format] || format).join(", ") },
    { label: "Text limit", value: `${spec.captionLimit.toLocaleString()} characters` },
  ];
  if (spec.titleLimit) rows.push({ label: spec.titleRequired ? "Title (required)" : "Title (optional)", value: `Up to ${spec.titleLimit} characters` });
  if (spec.formats.includes("carousel")) {
    rows.push({ label: "Carousel", value: `Up to ${spec.maxImages} items, ${spec.mixedCarousel ? "photos and videos can be mixed" : "photos only"}` });
  } else if (spec.maxImages > 1) {
    rows.push({ label: "Photos per post", value: `Up to ${spec.maxImages}` });
  }
  // A platform may cap a video's length, its size, both, or state no length cap
  // at all. Each combination has to read as a sentence on its own.
  const videoSize = formatBytes(spec.videoMaxBytes);
  const videoLength = formatDuration(spec.videoMaxSeconds);
  const uncapped = spec.videoMaxSeconds === null && spec.formats.includes("video");
  if (videoLength || videoSize) {
    let value;
    if (videoLength && videoSize) value = `Up to ${videoLength} and ${videoSize}`;
    else if (videoLength) value = `Up to ${videoLength}`;
    else if (uncapped) value = `No length limit through Meadow, up to ${videoSize}`;
    else value = `Up to ${videoSize}`;
    rows.push({ label: "Video", value });
  }
  if (spec.imageMaxBytes) rows.push({ label: "Photo size", value: `Up to ${formatBytes(spec.imageMaxBytes)}` });
  if (spec.documentMaxBytes) rows.push({ label: "Document size", value: `Up to ${formatBytes(spec.documentMaxBytes)}` });
  return rows.map(row => ({ ...row, label: row.label, platformName }));
}
