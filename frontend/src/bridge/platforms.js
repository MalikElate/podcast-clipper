// Canonical order for platform groups, account selectors and delivery icons.
export const PLATFORM_ORDER = ["x", "instagram", "linkedin", "facebook", "tiktok", "youtube", "bluesky", "threads", "pinterest", "google_business"];
export const PLATFORM_COLORS = { x: "#171717", instagram: "#e4405f", linkedin: "#0a66c2", facebook: "#1877f2", tiktok: "#111111", youtube: "#ff0033", bluesky: "#168aff", threads: "#111111", pinterest: "#e60023", google_business: "#4285f4" };
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
