import { PLATFORM_ORDER } from "./platforms.js";
import { belongsToSection, failed, pending, postSectionDate } from "./postListOrder.js";

const scheduled = new Set([...pending, "processing", "publishing"]);
const failedStatuses = new Set(failed);
const contentTypes = new Set(["text", "image", "video", "carousel", "document"]);
const dateFormatters = new Map();

function relevantDelivery(delivery, section) {
  if (section === "scheduled") return scheduled.has(delivery.status);
  if (section === "posted") return delivery.status === "published";
  if (section === "failed") return failedStatuses.has(delivery.status);
  return section === "posts";
}

function matchingDeliveries(post, section, accountId = "", platform = "") {
  return (post.deliveries || []).filter(delivery => relevantDelivery(delivery, section)
    && (!accountId || delivery.accountId === accountId)
    && (!platform || delivery.platform === platform));
}

function accountPlatform(accounts, id) {
  return accounts.find(account => account.id === id)?.platform;
}

function localDate(time, timeZone) {
  if (!dateFormatters.has(timeZone)) dateFormatters.set(timeZone, new Intl.DateTimeFormat("en", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }));
  const parts = Object.fromEntries(dateFormatters.get(timeZone).formatToParts(new Date(time)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function postDatePresetRange(preset, timeZone, now = Date.now()) {
  if (preset === "all") return { fromDate: "", toDate: "" };
  const days = { last_7_days: 7, last_30_days: 30, last_90_days: 90 }[preset];
  if (!days) throw new RangeError(`Unknown post date preset: ${preset}`);

  const toDate = localDate(now, timeZone);
  const [year, month, day] = toDate.split("-").map(Number);
  const fromDate = new Date(Date.UTC(year, month - 1, day - days + 1)).toISOString().slice(0, 10);
  return { fromDate, toDate };
}

// Use the same event as the card label, narrowed to the selected destination when needed.
export function cardPostDate(post, section, accountId = "", platform = "") {
  if (!platform || section === "drafts" || section === "posts") return postSectionDate(post, section, accountId);
  const times = matchingDeliveries(post, section, accountId, platform).map(delivery => {
    if (section === "scheduled") return Number.isFinite(delivery.requestedAt) ? delivery.requestedAt : delivery.dueAt;
    if (section === "posted") return delivery.publishedAt;
    return delivery.updatedAt;
  }).filter(Number.isFinite);
  if (times.length) return { label: { scheduled: "Scheduled", posted: "Published", failed: "Failed" }[section], time: Math.max(...times) };
  return { label: "Created", time: Number.isFinite(post.createdAt) ? post.createdAt : 0 };
}

// The broad media type stays stable when a destination publishes a video as a Reel
// or an image/video as a Story. Explicit base types also describe incomplete drafts.
export function postContentType(post) {
  if (contentTypes.has(post.format)) return post.format;
  if (post.format === "reel") return "video";
  const media = post.media || [];
  if (media.length > 1 || (post.mediaIds || []).length > 1) return "carousel";
  if (media.length === 1) return contentTypes.has(media[0].kind) ? media[0].kind : "";
  return (post.mediaIds || []).length ? "" : post.format === "story" ? "" : "text";
}

export function matchesPostCardFilters(post, {
  section, accountId = "", platform = "", contentType = "", fromDate = "", toDate = "", timeZone = "UTC", accounts = [],
}) {
  if (!belongsToSection(post, section)) return false;

  if (section === "drafts") {
    const selected = post.accountIds || [];
    if (accountId && !selected.includes(accountId)) return false;
    if (platform && !selected.some(id => (!accountId || id === accountId) && accountPlatform(accounts, id) === platform)) return false;
  } else if (section === "posts" && !platform) {
    // Keep the All view's existing account behavior, including historical posts.
    if (accountId && !post.accountIds?.includes(accountId) && !(post.deliveries || []).some(delivery => delivery.accountId === accountId)) return false;
  } else if (accountId || platform) {
    if (!matchingDeliveries(post, section, accountId, platform).length) {
      if (section !== "posts" || !(post.accountIds || []).some(id => (!accountId || id === accountId) && accountPlatform(accounts, id) === platform)) return false;
    }
  }

  if (contentType && postContentType(post) !== contentType) return false;
  if (fromDate || toDate) {
    const day = localDate(cardPostDate(post, section, accountId, platform).time, timeZone);
    if (fromDate && day < fromDate || toDate && day > toDate) return false;
  }
  return true;
}

export function availableCardPlatforms(posts, section, accounts) {
  const platforms = new Set();
  for (const post of posts) {
    if (!belongsToSection(post, section)) continue;
    if (section === "drafts" || section === "posts" && post.status === "draft") {
      for (const id of post.accountIds || []) {
        const platform = accountPlatform(accounts, id);
        if (platform) platforms.add(platform);
      }
    }
    if (section !== "drafts") for (const delivery of post.deliveries || []) {
      if (!relevantDelivery(delivery, section)) continue;
      const platform = delivery.platform || accountPlatform(accounts, delivery.accountId);
      if (platform) platforms.add(platform);
    }
  }
  return [...platforms].sort((a, b) => {
    const left = PLATFORM_ORDER.indexOf(a), right = PLATFORM_ORDER.indexOf(b);
    return (left < 0 ? PLATFORM_ORDER.length : left) - (right < 0 ? PLATFORM_ORDER.length : right) || a.localeCompare(b);
  });
}
