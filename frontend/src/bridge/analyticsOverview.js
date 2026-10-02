const DAY = 86400000;
export const overviewMetrics = ["views", "likes", "comments", "averageViews", "engagementRate"];
const measuredMetrics = ["views", "impressions", "likes", "comments", "shares", "saves", "clicks"];

function timestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const at = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(at) && at > 0 ? at : null;
}

// Calendar-day keys follow the workspace time zone, including DST transitions.
export function analyticsDay(at, timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = type => Number(parts.find(item => item.type === type).value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

export function summarizeAnalytics(records) {
  const eligible = records.filter(record => record.delivery.platform !== "youtube");
  const values = {}, coverage = {};
  for (const metric of measuredMetrics) {
    const available = eligible.map(record => record.delivery.metrics?.[metric]).filter(Number.isFinite);
    values[metric] = available.length ? available.reduce((sum, value) => sum + value, 0) : null;
    coverage[metric] = { available: available.length, total: eligible.length };
  }
  const interactions = ["likes", "comments", "shares", "saves"].map(metric => values[metric]).filter(Number.isFinite);
  values.engagement = interactions.length ? interactions.reduce((sum, value) => sum + value, 0) : null;
  values.averageViews = coverage.views.available ? values.views / coverage.views.available : null;
  const rated = eligible.filter(record => Number.isFinite(record.delivery.metrics?.views) && record.delivery.metrics.views > 0 && ["likes", "comments", "shares", "saves"].some(metric => Number.isFinite(record.delivery.metrics?.[metric])));
  values.engagementRate = rated.length ? rated.reduce((sum, record) => sum + ["likes", "comments", "shares", "saves"].reduce((total, metric) => total + (Number.isFinite(record.delivery.metrics[metric]) ? record.delivery.metrics[metric] : 0), 0), 0) / rated.reduce((sum, record) => sum + record.delivery.metrics.views, 0) * 100 : null;
  return { values, coverage, count: eligible.length };
}

export function buildAnalyticsOverview(data, { platform = "all", accountId = "", period = "30", now = Date.now(), timeZone = "UTC" } = {}) {
  const end = analyticsDay(now, timeZone) + DAY;
  const days = period === "all" ? null : Math.max(1, Number(period) || 30);
  const start = days ? end - days * DAY : null;
  const records = (data.posts || []).flatMap(post => (post.deliveries || []).filter(delivery => delivery.status === "published" && (platform === "all" || delivery.platform === platform) && (!accountId || delivery.accountId === accountId)).map(delivery => {
    // Creation and sync dates must not stand in for a missing publication date.
    const at = timestamp(delivery.publishedAt) || timestamp(post.publishedAt);
    return { post, delivery, at, day: at ? analyticsDay(at, timeZone) : null };
  }));
  const current = records.filter(record => days ? record.day !== null && record.day >= start && record.day < end : record.day === null || record.day < end);
  const previous = days ? records.filter(record => record.day !== null && record.day >= start - days * DAY && record.day < start) : [];
  const totals = summarizeAnalytics(current), previousTotals = summarizeAnalytics(previous);
  const changes = Object.fromEntries(overviewMetrics.map(metric => {
    const before = previousTotals.values[metric], after = totals.values[metric];
    // Zernio imports only 90 days; a prior 90-day cohort would be incomplete.
    const comparisonCovered = days && (!data.accounts?.some(account => account.analyticsSource === "zernio") || days * 2 <= 90);
    return [metric, comparisonCovered && Number.isFinite(after) && Number.isFinite(before) && before > 0 ? (after - before) / before * 100 : null];
  }));
  const posts = [...new Set(current.map(record => record.post.id))].map(id => {
    const matching = current.filter(record => record.post.id === id), post = matching[0].post;
    return { ...post, deliveries: matching.map(record => record.delivery), publishedAt: Math.max(0, ...matching.map(record => record.at || 0)) || null, totals: summarizeAnalytics(matching), count: matching.length };
  });
  return { current, previous, totals, changes, posts, start, end, unknownDates: records.filter(record => record.day === null).length,
    lastUpdated: Math.max(0, ...records.map(record => record.delivery.metricsUpdatedAt || 0)) };
}

export function buildPublishDateSeries(overview, metric = "views", grain = "day") {
  const eligible = overview.current.filter(record => record.delivery.platform !== "youtube" && record.day !== null);
  const start = Math.max(overview.start ?? Math.min(overview.end - DAY, ...eligible.map(record => record.day)), overview.end - 366 * DAY);
  const bucket = day => grain === "week" ? day - ((new Date(day).getUTCDay() + 6) % 7) * DAY : day;
  const points = [];
  for (let at = bucket(start); at < overview.end && points.length < 366; at += grain === "week" ? 7 * DAY : DAY) {
    const records = eligible.filter(record => bucket(record.day) === at);
    const available = records.map(record => record.delivery.metrics?.[metric]).filter(Number.isFinite);
    points.push({ at, count: records.length, value: available.length ? available.reduce((sum, value) => sum + value, 0) : records.length ? null : 0, available: available.length });
  }
  return points;
}
