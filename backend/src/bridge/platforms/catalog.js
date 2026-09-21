// Publishing capabilities are adapter-owned. They describe API support, not
// everything available in a platform's native app. Dynamic account restrictions
// (privacy choices, duration, rate limits, etc.) are checked again at delivery.
export const platformCatalog = {
  instagram: { id: "instagram", name: "Instagram", short: "IG", color: "#dc5c95", accountType: "Professional account", formats: ["image", "video", "carousel", "story"], captionLimit: 2200, maxImages: 10, mixedCarousel: true, videoMaxSeconds: 900, videoMaxBytes: 1000 * 1024 ** 2, imageMaxBytes: 8 * 1024 ** 2, needsPublicMedia: true },
  tiktok: { id: "tiktok", name: "TikTok", short: "Tk", color: "#54c7d4", accountType: "Creator account", formats: ["video", "image", "carousel"], captionLimit: 2200, maxImages: 35, mixedCarousel: false, videoMaxSeconds: null, videoMaxBytes: 4 * 1024 ** 3, imageMaxBytes: 20 * 1024 ** 2, needsPublicMedia: true },
  snapchat: { id: "snapchat", name: "Snapchat", short: "S", color: "#f2d900", accountType: "Public Profile", formats: ["image", "video", "story"], captionLimit: 250, maxImages: 1, mixedCarousel: false },
  youtube: { id: "youtube", name: "YouTube", short: "YT", color: "#f16666", accountType: "Channel", formats: ["video"], captionLimit: 5000, titleLimit: 100, titleRequired: true, videoMaxSeconds: 43200, videoMaxBytes: 256 * 1024 ** 3 },
  telegram: { id: "telegram", name: "Telegram", short: "Tg", color: "#5aa9e6", accountType: "Channel or group", formats: ["text", "image", "video", "carousel", "document"], captionLimit: 4096, maxImages: 10, mixedCarousel: true },
  facebook: { id: "facebook", name: "Facebook", short: "f", color: "#659af3", accountType: "Page", formats: ["text", "image", "video", "carousel", "reel", "story"], captionLimit: 63206, maxImages: 10, mixedCarousel: false, videoMaxSeconds: 14400, videoMaxBytes: 10 * 1024 ** 3, needsPublicMedia: true },
  x: { id: "x", name: "X", short: "X", color: "#c6d0df", accountType: "Profile", formats: ["text", "image", "video", "carousel"], captionLimit: 280, maxImages: 4, mixedCarousel: false, videoMaxSeconds: 140, videoMaxBytes: 512 * 1024 ** 2, imageMaxBytes: 5 * 1024 ** 2 },
  linkedin: { id: "linkedin", name: "LinkedIn", short: "in", color: "#73a9e4", accountType: "Profile or organization", formats: ["text", "image", "video", "carousel", "document"], captionLimit: 3000, maxImages: 20, mixedCarousel: false, videoMaxSeconds: 900, videoMaxBytes: 5 * 1024 ** 3, imageMaxBytes: 20 * 1024 ** 2, documentMaxBytes: 100 * 1024 ** 2 },
  pinterest: { id: "pinterest", name: "Pinterest", short: "P", color: "#e67e87", accountType: "Account and board", formats: ["image", "video", "carousel"], captionLimit: 800, titleLimit: 100, maxImages: 5, mixedCarousel: false, videoMaxSeconds: 900, videoMaxBytes: 2 * 1024 ** 3, imageMaxBytes: 20 * 1024 ** 2, needsPublicMedia: true },
  threads: { id: "threads", name: "Threads", short: "@", color: "#a69eed", accountType: "Profile", formats: ["text", "image", "video", "carousel"], captionLimit: 500, maxImages: 20, mixedCarousel: true, videoMaxSeconds: 300, videoMaxBytes: 1000 * 1024 ** 2, imageMaxBytes: 8 * 1024 ** 2, needsPublicMedia: true },
  bluesky: { id: "bluesky", name: "Bluesky", short: "B", color: "#6daaff", accountType: "Profile", formats: ["text", "image", "video", "carousel"], captionLimit: 300, maxImages: 4, mixedCarousel: false, videoMaxSeconds: 180, videoMaxBytes: 100 * 1024 ** 2, imageMaxBytes: 1024 ** 2 },
  google_business: { id: "google_business", name: "Google Business", short: "G", color: "#a5b57a", accountType: "Business location", formats: ["text", "image", "carousel"], captionLimit: 1500, maxImages: 10, mixedCarousel: false, imageMaxBytes: 5 * 1024 ** 2, needsPublicMedia: true },
};

export function inferFormat(media) {
  if (!media.length) return "text";
  if (media.length > 1) return "carousel";
  return media[0].kind;
}
