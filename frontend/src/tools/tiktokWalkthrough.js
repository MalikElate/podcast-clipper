export function postVerdict(post) {
  switch (post?.bucket) {
    case "strong": return { label: "NOT SLOP", tone: "fresh" };
    case "thin": return { label: "MID", tone: "mid" };
    case "filler": return { label: "SLOP", tone: "slop" };
    default: return { label: "UNSCORED", tone: "unscored" };
  }
}

function boundedCount(value, maximum) {
  if (value === Infinity) return maximum;
  if (!Number.isFinite(value)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(value)));
}

export function runningSlopScore(posts, revealedCount) {
  if (!Array.isArray(posts)) return null;
  const count = boundedCount(revealedCount, posts.length);
  let total = 0;
  let scored = 0;
  for (let index = 0; index < count; index += 1) {
    const bucket = posts[index]?.bucket;
    if (bucket !== "strong" && bucket !== "thin" && bucket !== "filler") continue;
    scored += 1;
    total += bucket === "filler" ? 1 : bucket === "thin" ? 0.5 : 0;
  }
  return scored ? Math.round(100 * total / scored) : null;
}

export function nextWalkthroughStep(step, postCount) {
  const count = Number.isFinite(postCount) ? Math.max(0, Math.floor(postCount)) : 0;
  if (!count) return { index: 0, phase: "complete" };
  const index = boundedCount(step?.index, count - 1);
  if (step?.phase === "reading") return { index, phase: "verdict" };
  if (step?.phase === "verdict") {
    return index === count - 1
      ? { index, phase: "complete" }
      : { index: index + 1, phase: "reading" };
  }
  if (step?.phase === "complete") return { index, phase: "complete" };
  return { index, phase: "reading" };
}
