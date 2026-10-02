const sentToPlatform = delivery => ["published", "awaiting_publish"].includes(delivery.status)
  || (delivery.progress?.chat?.sent?.length || delivery.chatMessagesSent || 0) > 0;

export function canDeletePost(post) {
  return post?.deletable === true
    && Array.isArray(post.deliveries)
    && post.deliveries.every(delivery => delivery
      && !["publishing", "processing"].includes(delivery.status)
      && !sentToPlatform(delivery));
}

export function eligibleSelection(posts, selectedIds) {
  const selected = new Set(selectedIds || []);
  const seen = new Set();
  return posts.filter(post => {
    if (!selected.has(post.id) || seen.has(post.id) || !canDeletePost(post)) return false;
    seen.add(post.id);
    return true;
  });
}
