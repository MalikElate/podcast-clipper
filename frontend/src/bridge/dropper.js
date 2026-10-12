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

// Example posts for the /dashboard/dropper?demo walkthrough, so the funnel
// shows rejections even when every real post fits. They stay in the browser:
// never sent to the server and never selectable.
const DEMO_REJECTS = [
  { format: "photo", caption: "Photo dump from the shoot" },
  { format: "carousel", caption: "5 tips carousel" },
  { format: "video", caption: "Full podcast episode", duration: 2892 },
  { format: "text", caption: "Text-only update" },
  { format: "carousel", caption: "Before and after slides" },
  { format: "photo", caption: "Behind-the-scenes still" },
];

export function demoRejects(cards = [], platform = "tiktok", every = 3) {
  return [...cards].sort((a, b) => (a.publishedAt || 0) - (b.publishedAt || 0))
    .filter((_, index) => index % every === every - 1)
    .map((card, index) => ({ ...DEMO_REJECTS[index % DEMO_REJECTS.length], id: `demo-${index}`, platform, url: `https://www.${platform}.com/`, publishedAt: (card.publishedAt || 0) + 1, demo: true }));
}

export function durationLabel(seconds) {
  const total = Math.round(Number(seconds));
  return Number.isFinite(total) && total > 0 ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}` : "";
}

// A video drops into every destination whose length limit it fits. It is the
// wrong format only when it is too long for all of them.
export function videoFit(card, destinations = [], catalog = []) {
  const seconds = Number(card.duration);
  const tooLong = Number.isFinite(seconds) && seconds > 0 ? destinations.filter(account => {
    const limit = catalog.find(platform => platform.id === account.platform)?.videoMaxSeconds;
    return Number.isFinite(limit) && limit > 0 && seconds > limit;
  }) : [];
  return { fits: !destinations.length || tooLong.length < destinations.length, tooLong };
}

// One pass of the funnel, in milliseconds, paced like the reference: a post
// waits above the rim, is checked on it, then either glides through the funnel
// or is turned away there.
export const FUNNEL_STEP_MS = 1300;
export const FUNNEL_TIMING = { keep: { duration: 4600, check: 1564, exit: 4420 }, reject: { duration: 3000, check: 1650 } };
const timing = item => item.fits ? FUNNEL_TIMING.keep : FUNNEL_TIMING.reject;

// The newest posts, oldest first, so the latest video ends on top of the stack.
export function funnelFeed(cards = [], wrongFormat = [], { destinations = [], catalog = [], limit = 60 } = {}) {
  const videos = cards.map(card => ({ ...card, ...videoFit(card, destinations, catalog) }));
  return [...videos, ...wrongFormat.map(post => ({ ...post, fits: false, tooLong: [] }))]
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
