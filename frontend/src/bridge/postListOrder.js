export const pending = ["queued", "scheduled", "retrying"];
export const failed = ["failed", "needs_review", "needs_account"];

const scheduled = [...pending, "processing", "publishing"];

export function belongsToSection(post, section) {
  if (section === "scheduled") return post.deliveries.some(delivery => scheduled.includes(delivery.status));
  if (section === "posted") return post.deliveries.some(delivery => delivery.status === "published");
  if (section === "drafts") return post.status === "draft";
  if (section === "failed") return post.status === "needs_attention" || post.deliveries.some(delivery => failed.includes(delivery.status));
  return true;
}

function latestDeliveryTime(post, statuses, timeForDelivery, accountId) {
  const times = post.deliveries.filter(delivery => (!accountId || delivery.accountId === accountId) && statuses.includes(delivery.status)).map(timeForDelivery).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

export function postSectionDate(post, section, accountId = "") {
  const created = Number.isFinite(post.createdAt) ? post.createdAt : 0;
  if (section === "drafts" || section === "posts" && post.status === "draft") return { label: "Last saved", time: Number.isFinite(post.updatedAt) ? post.updatedAt : created };
  const event = section === "scheduled"
    ? latestDeliveryTime(post, scheduled, delivery => Number.isFinite(delivery.requestedAt) ? delivery.requestedAt : delivery.dueAt, accountId)
    : section === "posted"
      ? latestDeliveryTime(post, ["published"], delivery => delivery.publishedAt, accountId)
      : section === "failed"
        ? latestDeliveryTime(post, failed, delivery => delivery.updatedAt, accountId)
        : null;
  if (event !== null) return { label: section === "scheduled" ? "Scheduled" : section === "posted" ? "Published" : "Failed", time: event };
  return { label: "Created", time: created };
}

export function newestPostFirst(section, a, b, accountId = "") {
  return (section === "posts" ? (b.createdAt || 0) - (a.createdAt || 0) : postSectionDate(b, section, accountId).time - postSectionDate(a, section, accountId).time)
    || (b.createdAt || 0) - (a.createdAt || 0)
    || String(a.id).localeCompare(String(b.id));
}
