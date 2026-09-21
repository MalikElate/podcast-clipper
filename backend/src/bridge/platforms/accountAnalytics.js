import { invariant, ProviderError } from "../core/errors.js";

const DAY = 86400000;
const count = value => Number.isSafeInteger(value) && value >= 0;
export function reportingWindow(now, days) {
  const midnight = Date.parse(new Date(now).toISOString().slice(0, 10));
  return { days, startDate: new Date(midnight - days * DAY).toISOString().slice(0, 10), endDate: new Date(midnight - DAY).toISOString().slice(0, 10), timeZone: "UTC" };
}
function report(provider, window, value, source, metric, basis, extra = {}) {
  invariant(count(value), "The platform returned invalid analytics.");
  return { ...window, value, source, metric, basis, observedAt: new Date(provider.clock()).toISOString(), partial: false, ...extra };
}

export async function tiktokAccountAnalytics(provider, credentials) {
  const window = reportingWindow(provider.clock(), 180);
  const start = Date.parse(window.startDate), end = Date.parse(window.endDate) + DAY;
  let cursor = end, value = 0, complete = false;
  const seen = new Set(), cursors = new Set(), deadline = Date.now() + 45000;
  for (let page = 0; page < 25 && Date.now() < deadline; page++) {
    invariant(!cursors.has(cursor), "TikTok repeated its analytics page."); cursors.add(cursor);
    const result = await provider.http.request("https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,view_count", { method: "POST", token: credentials.accessToken, json: { max_count: 20, cursor }, safeToRetry: true, timeoutMs: 15000 });
    const data = result.data;
    invariant(Array.isArray(data?.videos) && typeof data.has_more === "boolean", "TikTok returned invalid analytics.");
    let beforeWindow = false;
    for (const video of data.videos) {
      invariant(typeof video.id === "string" && Number.isSafeInteger(video.create_time), "TikTok returned an invalid video.");
      const created = video.create_time * 1000;
      if (created < start) { beforeWindow = true; continue; }
      if (created >= end || seen.has(video.id)) continue;
      invariant(count(video.view_count), "TikTok did not report video views.");
      seen.add(video.id); value += video.view_count;
    }
    if (!data.has_more || beforeWindow) { complete = true; break; }
    invariant(Number.isSafeInteger(data.cursor) && data.cursor < cursor, "TikTok returned invalid analytics pagination."); cursor = data.cursor;
  }
  return report(provider, window, value, "tiktok_video_list", "video_views", "recent_posts", { postCount: seen.size, partial: !complete });
}

export async function pinterestAccountAnalytics(provider, credentials) {
  if (provider.sandbox) throw new ProviderError("Pinterest Sandbox does not provide analytics.", { code: "analytics_sandbox" });
  const window = reportingWindow(provider.clock(), 90);
  const query = new URLSearchParams({ start_date: window.startDate, end_date: window.endDate, metric_types: "IMPRESSION", split_field: "NO_SPLIT", from_claimed_content: "BOTH" });
  const result = await provider.request(`user_account/analytics?${query}`, credentials, { timeoutMs: 20000 });
  const metrics = result.all;
  invariant(count(metrics?.summary_metrics?.IMPRESSION), "Pinterest did not report account impressions.");
  // Missing, estimated, or still-processing dates must not look like a complete report.
  const ready = new Set((metrics.daily_metrics || []).filter(row => row.data_status === "READY" && count(row.metrics?.IMPRESSION) && typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date >= window.startDate && row.date <= window.endDate && Number.isFinite(Date.parse(row.date)) && new Date(row.date).toISOString().slice(0, 10) === row.date).map(row => row.date));
  return report(provider, window, metrics.summary_metrics.IMPRESSION, "pinterest_account_analytics", "pin_impressions", "period", { partial: ready.size < 90 });
}

export async function xAccountAnalytics(provider, account, credentials) {
  const window = reportingWindow(provider.clock(), 180);
  const start = Date.parse(window.startDate), end = Date.parse(window.endDate) + DAY;
  const posts = new Map(), cursors = new Set(), deadline = Date.now() + 45000;
  let next, complete = false;
  // Include older posts: period analytics can count their new impressions too.
  for (let page = 0; page < 32 && Date.now() < deadline; page++) {
    const query = new URLSearchParams({ max_results: "100", "tweet.fields": "created_at,public_metrics", exclude: "retweets", ...(next ? { pagination_token: next } : {}) });
    const result = await provider.request(`users/${encodeURIComponent(account.remoteId)}/tweets?${query}`, credentials, { timeoutMs: 15000 });
    invariant(!result.errors?.length && Array.isArray(result.data || []) && Number.isSafeInteger(result.meta?.result_count), "X returned incomplete account analytics.");
    for (const post of result.data || []) {
      invariant(typeof post.id === "string" && Number.isFinite(Date.parse(post.created_at)), "X returned an invalid post.");
      posts.set(post.id, post);
    }
    next = result.meta.next_token;
    if (!next) { complete = posts.size < 3200; break; }
    invariant(typeof next === "string" && !cursors.has(next), "X repeated its analytics page."); cursors.add(next);
  }
  const ids = [...posts.keys()];
  if (!ids.length) return report(provider, window, 0, "x_post_metrics", "post_impressions", "recent_posts", { postCount: 0, partial: !complete });
  // Use actual period impressions when this account's API access permits it.
  try {
    let value = 0;
    for (let offset = 0; offset < ids.length; offset += 100) {
      invariant(Date.now() < deadline, "X analytics exceeded its request budget.");
      const batch = ids.slice(offset, offset + 100), seen = new Set();
      const query = new URLSearchParams({ ids: batch.join(","), start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), granularity: "total", "analytics.fields": "impressions" });
      const result = await provider.request(`tweets/analytics?${query}`, credentials, { timeoutMs: 15000 });
      invariant(!result.errors?.length && Array.isArray(result.data), "X period analytics are unavailable.");
      for (const row of result.data) {
        invariant(batch.includes(row.id) && !seen.has(row.id) && count(row.impressions), "X returned invalid period impressions.");
        seen.add(row.id); value += row.impressions;
      }
      invariant(seen.size === batch.length, "X omitted period analytics for some posts.");
    }
    return report(provider, window, value, "x_post_analytics", "post_impressions", "period", { postCount: ids.length, partial: !complete });
  } catch (error) {
    if (error.reconnect) throw error;
  }
  let value = 0, postCount = 0;
  for (const post of posts.values()) {
    const created = Date.parse(post.created_at);
    if (created < start || created >= end) continue;
    invariant(count(post.public_metrics?.impression_count), "X did not report post impressions.");
    value += post.public_metrics.impression_count; postCount++;
  }
  return report(provider, window, value, "x_post_metrics", "post_impressions", "recent_posts", { postCount, partial: !complete });
}
