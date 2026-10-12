export const DROPPER_SOURCE_PLATFORMS = new Set(["tiktok", "youtube", "instagram", "facebook", "threads"]);
const CHAT_ONLY = new Set(["twitch", "kick"]);
const OCCUPIED_STATUSES = new Set(["queued", "downloading", "submitting", "scheduled"]);

export const dropperSourceAccounts = accounts => accounts.filter(account => account.status === "connected" && DROPPER_SOURCE_PLATFORMS.has(account.platform));

export function dropperDestinationAccounts(accounts, catalog, sourceAccountId) {
  return accounts.filter(account => account.id !== sourceAccountId && account.status === "connected" && !CHAT_ONLY.has(account.platform)
    && catalog.find(platform => platform.id === account.platform)?.formats?.some(format => ["video", "reel"].includes(format)));
}

export function selectableDropperCards(cards, queue) {
  const occupied = new Set(queue.filter(item => OCCUPIED_STATUSES.has(item.status)).map(item => item.cardId));
  return cards.filter(card => card.pushable && !occupied.has(card.id));
}

export function currentDropperItem(queue, { running = false, inFlight = false, now = Date.now() } = {}) {
  if (running || inFlight) {
    const preparing = queue.find(item => ["downloading", "submitting"].includes(item.status));
    const due = queue.find(item => item.status === "queued" && item.slotAt <= now);
    if (preparing || due) return preparing || due;
  }
  // A fast preparation can finish between queue polls. Show that recent drop
  // once as well, without replaying old history or claiming it was published.
  return queue.filter(item => item.status === "scheduled" && Number.isFinite(item.dispatchedAt)
    && item.dispatchedAt <= now && now - item.dispatchedAt < 60000 && !["removed", "cancelled"].includes(item.postStatus))
    .sort((a, b) => b.dispatchedAt - a.dispatchedAt)[0] || null;
}

export function intervalMinutes(value, unit) {
  if (!/^[1-9]\d*$/.test(String(value))) return null;
  const multiplier = { minutes: 1, hours: 60, days: 1440 }[unit];
  const result = Number(value) * multiplier;
  return Number.isSafeInteger(result) && result >= 1 && result <= 10080 ? result : null;
}

export function intervalInput(minutes = 480) {
  if (minutes % 1440 === 0) return { value: String(minutes / 1440), unit: "days" };
  if (minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

export function intervalLabel(minutes) {
  const { value, unit } = intervalInput(minutes);
  return `${value} ${Number(value) === 1 ? unit.slice(0, -1) : unit}`;
}

// Preparation and scheduling are distinct from a platform confirming publication.
export function dropperQueueStatus(item, formatDate, now = Date.now()) {
  if (item.status === "queued") return item.slotAt > now ? `Waiting until ${formatDate(item.slotAt)}` : "Waiting to prepare";
  if (item.status === "downloading") return "Preparing the video";
  if (item.status === "submitting") return "Adding to Posts";
  if (item.status === "scheduled") {
    const posting = { published: "Published", publishing: "Publishing to your accounts", partially_published: "Partly published · check Posts", awaiting_publish: "Finish publishing in TikTok", needs_attention: "Needs attention in Posts", cancelled: "Cancelled in Posts", removed: "Removed from Posts" };
    return posting[item.postStatus] || (item.slotAt > now ? `In Posts · due ${formatDate(item.slotAt)}` : "In Posts · check posting status");
  }
  if (item.status === "cancelled") return "Cancelled before being added to Posts";
  if (item.status === "failed") return item.error || "Could not prepare this video";
  return "Checking status";
}

const FORMAT_LABELS = { photo: "photo post", carousel: "carousel", text: "text post", post: "not a video" };
export const wrongFormatLabel = format => FORMAT_LABELS[format] || FORMAT_LABELS.post;

// One pass of the funnel, in milliseconds. A post lands on the rim, is checked,
// then either drops through (videos) or is turned away (every other format).
export const FUNNEL_STEP_MS = 750;
export const FUNNEL_TIMING = { keep: { duration: 2600, check: 880, exit: 2400 }, reject: { duration: 1900, check: 890 } };
const timing = item => item.fits ? FUNNEL_TIMING.keep : FUNNEL_TIMING.reject;

// The newest posts, oldest first, so the latest video ends on top of the stack.
export function funnelFeed(cards = [], wrongFormat = [], limit = 16) {
  return [...cards.map(card => ({ ...card, fits: true })), ...wrongFormat.map(post => ({ ...post, fits: false }))]
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0)).slice(0, limit).reverse();
}

export const funnelDuration = feed => feed.reduce((end, item, index) => Math.max(end, index * FUNNEL_STEP_MS + timing(item).duration), 0);

export function funnelProgress(feed, elapsed) {
  const active = [], landed = [];
  let wrong = 0;
  feed.forEach((item, index) => {
    const start = index * FUNNEL_STEP_MS, { duration, check, exit } = timing(item);
    if (elapsed >= start && elapsed < start + duration) active.push({ item, index });
    if (!item.fits && elapsed >= start + check) wrong += 1;
    if (item.fits && elapsed >= start + exit) landed.unshift(item);
  });
  return { active, landed, wrong, done: elapsed >= funnelDuration(feed) };
}
