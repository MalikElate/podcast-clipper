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

// A copy takes its own bounce path and lands at its destination, including
// destinations on a wrapped second row. Coordinates are relative to the board.
export function dropKeyframes({ startX, startY, endX, endY, pegTop, pegHeight, copyIndex = 0 }) {
  const frames = [{ transform: `translate(${startX}px, ${startY}px) scale(.7)`, opacity: 0, offset: 0 }];
  for (let row = 0; row < 7; row += 1) {
    const progress = (row + 1) / 8;
    const direction = (row + copyIndex) % 2 ? 1 : -1;
    const bounce = direction * Math.min(21, Math.abs(endX - startX) * .12 + 8);
    const x = startX + (endX - startX) * progress + bounce;
    const y = pegTop + pegHeight * (row + .4) / 7;
    frames.push({ transform: `translate(${x}px, ${y}px) rotate(${direction * 12}deg)`, opacity: 1, offset: .1 + row * .105 });
  }
  frames.push({ transform: `translate(${endX}px, ${endY}px) scale(.65)`, opacity: 1, offset: .96 });
  frames.push({ transform: `translate(${endX}px, ${endY}px) scale(.45)`, opacity: 0, offset: 1 });
  return frames;
}
