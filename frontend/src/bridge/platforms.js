// Canonical order for platform groups, account selectors and delivery icons.
export const PLATFORM_ORDER = ["x", "instagram", "linkedin", "facebook", "tiktok", "snapchat", "youtube", "telegram", "twitch", "kick", "bluesky", "threads", "pinterest", "google_business"];
export const PLATFORM_COLORS = { x: "#171717", instagram: "#e4405f", linkedin: "#0a66c2", facebook: "#1877f2", tiktok: "#111111", snapchat: "#111111", youtube: "#ff0033", telegram: "#229ed9", twitch: "#9146ff", kick: "#238b00", bluesky: "#168aff", threads: "#111111", pinterest: "#e60023", google_business: "#4285f4" };
export function sortPlatforms(items) {
  const rank = item => {
    const index = PLATFORM_ORDER.indexOf(item.platform || item.id);
    return index < 0 ? PLATFORM_ORDER.length : index;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

// Preserve post chronology, media order and analytics rankings. Only platform
// collections are normalized; stable sorting preserves order within a platform.
export function normalizePlatformCollections(value) {
  if (Array.isArray(value)) return value.map(normalizePlatformCollections);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const normalized = normalizePlatformCollections(entry);
    return [key, ["platforms", "accounts", "deliveries", "destinations"].includes(key) && Array.isArray(normalized)
      ? sortPlatforms(normalized) : normalized];
  }));
}

// Mirrors the backend's inferFormat: the uploaded media decides the post type.
export const FORMAT_LABELS = { text: "Text only", image: "Picture", video: "Video", carousel: "Carousel", document: "Document", reel: "Reel", story: "Story" };
export function detectFormat(media) {
  if (!media.length) return "text";
  return media.length > 1 ? "carousel" : media[0].kind;
}

// Formats that can carry this media; the first one is what "Automatic" publishes.
export function formatsForMedia(media) {
  const format = detectFormat(media);
  if (format === "image") return ["image", "story"];
  if (format === "video") return ["video", "reel", "story"];
  return [format];
}

// Why a platform cannot take this media, or null when it can. Size, length and
// caption limits are still checked when the post is reviewed. Wording says
// "through Meadow" because formats reflect each platform's API, not its app.
export function unsupportedReason(capability, media) {
  if (!capability || !media.length) return null;
  const { name, formats = [] } = capability, format = detectFormat(media);
  const mediaFormats = formats.filter(item => item !== "text");
  if (mediaFormats.length === 1 && mediaFormats[0] === "video" && format !== "video") return `${name} only accepts videos through Meadow`;
  if (media.some(item => item.kind === "document")) {
    if (!formats.includes("document")) return `${name} can't publish documents through Meadow`;
    if (media.length > 1) return "Documents must be posted on their own";
  }
  if (format === "carousel") {
    if (!formats.includes("carousel")) return `${name} can't publish carousels through Meadow`;
    if (!capability.mixedCarousel && media.some(item => item.kind !== "image")) return `${name} carousels can only contain pictures`;
    if (capability.maxImages && media.length > capability.maxImages) return `${name} allows up to ${capability.maxImages} items per post`;
    return null;
  }
  return formats.includes(format) ? null : `${name} can't publish ${FORMAT_LABELS[format]?.toLowerCase() || format} posts through Meadow`;
}

// The post types a user picks before writing. Each one only lists accounts whose platform can publish it.
export const POST_TYPES = [
  { id: "text", label: "Text", description: "Words only, no media" },
  { id: "image", label: "Image", description: "One picture" },
  { id: "video", label: "Video", description: "One video" },
  { id: "carousel", label: "Carousel", description: "2 or more pictures or videos" },
];
export const ACCEPT_BY_TYPE = { text: "", image: "image/*", video: "video/*", carousel: "image/*,video/*" };
export const MAX_MEDIA_BY_TYPE = { text: 0, image: 1, video: 1, carousel: 35 };

// Only videos can be mixed into some platforms' carousels, so a carousel that contains one narrows the list.
export function supportsPostType(capability, type, media = []) {
  if (!capability?.formats?.includes(type)) return false;
  return type !== "carousel" || capability.mixedCarousel || !media.some(item => item.kind !== "image");
}

// Other ways a platform can publish the same media, such as a Story or Reel.
export function formatVariants(capability, type) {
  const variants = { image: ["image", "story"], video: ["video", "reel", "story"] }[type] || [type];
  return variants.filter(format => capability?.formats?.includes(format));
}
