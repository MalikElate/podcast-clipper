export function hasPostContent(post = {}) {
  const hasText = value => typeof value === "string" && value.trim().length > 0;
  const overrideHasText = Object.values(post.overrides || {}).some(override => hasText(override?.caption) || hasText(override?.title));
  return hasText(post.caption) || hasText(post.title) || Array.isArray(post.mediaIds) && post.mediaIds.length > 0 || overrideHasText;
}
