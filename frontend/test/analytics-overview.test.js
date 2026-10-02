import assert from "node:assert/strict";
import test from "node:test";
import { analyticsDay, buildAnalyticsOverview, buildPublishDateSeries, summarizeAnalytics } from "../src/bridge/analyticsOverview.js";

const now = Date.parse("2026-10-02T12:00:00Z");
const record = (id, date, metrics, options = {}) => ({ id, createdAt: Date.parse(date), ...options, deliveries: [{ id: `delivery-${id}`, accountId: "studio", platform: "tiktok", status: "published", publishedAt: Date.parse(date), metrics, ...options.delivery }] });
const report = posts => ({ posts, accounts: [{ analyticsSource: "zernio" }] });
const overview = (posts, options = {}) => buildAnalyticsOverview(report(posts), { now, timeZone: "UTC", ...options });

test("date filters use publication dates rather than newer sync readings and exclude drafts", () => {
  const result = overview([
    record("current", "2026-10-01", { views: 100 }, { delivery: { metricsUpdatedAt: now } }),
    record("old", "2026-08-31", { views: 200 }, { delivery: { metricsUpdatedAt: now } }),
    record("draft", "2026-10-01", { views: 9000 }, { delivery: { status: "draft" } }),
    record("future", "2026-10-03", { views: 7000 }),
  ]);
  assert.deepEqual(result.posts.map(post => post.id), ["current"]);
  assert.equal(result.totals.values.views, 100);
  assert.equal(result.previous[0].post.id, "old");
  assert.equal(result.changes.views, -50);
});

test("platform and account filters apply to posts, totals, and chart records together", () => {
  const first = record("shared", "2026-10-01", { views: 10 });
  first.deliveries.push({ ...first.deliveries[0], id: "instagram", accountId: "other", platform: "instagram", metrics: { views: 900 } });
  const result = overview([first], { platform: "tiktok", accountId: "studio" });
  assert.equal(result.totals.values.views, 10);
  assert.equal(result.posts[0].deliveries.length, 1);
  assert.equal(buildPublishDateSeries(result).find(point => point.at === Date.parse("2026-10-01")).value, 10);
  assert.equal(overview([first], { accountId: "unrelated" }).posts.length, 0);
});

test("zeros remain measured while unknown metrics never dilute averages or rates", () => {
  const result = overview([
    record("zero", "2026-10-01", { views: 0, likes: 0, comments: 0 }),
    record("measured", "2026-10-01", { views: 100, likes: 8, comments: 2, shares: 0 }),
    record("pending", "2026-10-01", { views: null, likes: 999, comments: null }),
  ]);
  assert.equal(result.totals.values.averageViews, 50);
  assert.equal(result.totals.values.engagementRate, 10);
  assert.equal(result.totals.coverage.views.available, 2);
  assert.equal(result.totals.coverage.views.total, 3);
  assert.equal(result.totals.values.saves, null);
  const zero = summarizeAnalytics([result.current[0]]);
  assert.equal(zero.values.views, 0);
  assert.equal(zero.values.averageViews, 0);
  assert.equal(zero.values.engagementRate, null);
});

test("YouTube remains available per video and is excluded from derived and combined metrics", () => {
  const result = overview([record("tiktok", "2026-10-01", { views: 10, likes: 1 }), record("youtube", "2026-10-01", { views: 9999, likes: 500 }, { delivery: { platform: "youtube" } })]);
  assert.equal(result.totals.values.views, 10);
  assert.equal(result.totals.values.engagementRate, 10);
  assert.equal(result.totals.count, 1);
  assert.equal(result.posts[1].deliveries[0].metrics.views, 9999);
  assert.equal(buildPublishDateSeries(result).find(point => point.at === Date.parse("2026-10-01")).count, 1);
});

test("publication charts group lifetime readings by day and week, preserving missing-day gaps", () => {
  const result = overview([record("one", "2026-09-29", { views: 20 }), record("two", "2026-09-30", { views: 30 }), record("pending", "2026-10-01", { views: null })], { period: "7" });
  const days = buildPublishDateSeries(result);
  assert.equal(days.find(point => point.at === Date.parse("2026-09-29")).value, 20);
  assert.equal(days.find(point => point.at === Date.parse("2026-10-01")).value, null);
  assert.equal(days.find(point => point.at === Date.parse("2026-10-02")).value, 0);
  const week = buildPublishDateSeries(result, "views", "week").find(point => point.at === Date.parse("2026-09-28"));
  assert.equal(week.value, 50); assert.equal(week.count, 3); assert.equal(week.available, 2);
});

test("calendar boundaries follow the selected time zone including DST", () => {
  assert.equal(analyticsDay(Date.parse("2026-10-02T00:30:00Z"), "America/Los_Angeles"), Date.parse("2026-10-01"));
  const result = overview([record("today", "2026-10-01T23:30:00Z", { views: 7 }), record("tomorrow", "2026-10-02T08:30:00Z", { views: 90 })], { now: Date.parse("2026-10-02T00:30:00Z"), period: "1", timeZone: "America/Los_Angeles" });
  assert.equal(result.totals.values.views, 7);
  assert.equal(analyticsDay(Date.parse("2026-03-08T09:30:00Z"), "America/Los_Angeles"), analyticsDay(Date.parse("2026-03-08T10:30:00Z"), "America/Los_Angeles"));
});

test("unknown imported publication dates are not replaced with a sync date", () => {
  const unknown = record("unknown", "2026-10-01", { views: 500 }, { source: "connected_account", delivery: { publishedAt: null, metricsUpdatedAt: now } });
  const legacy = record("legacy", "2026-10-01", { views: 50 }, { delivery: { publishedAt: null } });
  const result = overview([unknown, legacy]);
  assert.equal(result.posts.length, 0); assert.equal(result.unknownDates, 2);
  const all = overview([unknown, legacy], { period: "all" });
  assert.equal(all.totals.values.views, 550);
  assert.equal(all.posts[0].publishedAt, null);
  assert.ok(buildPublishDateSeries(all).every(point => point.count === 0));
});

test("All available totals retain older posts while the chart covers the latest year", () => {
  const result = overview([record("old", "2024-01-01", { views: 400 }), record("new", "2026-10-01", { views: 100 })], { period: "all" });
  assert.equal(result.totals.values.views, 500);
  const points = buildPublishDateSeries(result);
  assert.equal(points.length, 366);
  assert.equal(points.at(-2).value, 100);
});

test("comparisons omit percentages when previous measurements or a full prior window are unavailable", () => {
  assert.equal(overview([record("new", "2026-10-01", { views: 10 })]).changes.views, null);
  assert.equal(overview([record("new", "2026-10-01", { views: 10 }), record("zero", "2026-08-31", { views: 0 })]).changes.views, null);
  assert.equal(overview([record("new", "2026-10-01", { views: 10 }), record("old", "2026-07-01", { views: 20 })], { period: "90" }).changes.views, null);
  assert.equal(overview([record("new", "2026-10-01", { views: 10 })], { period: "all" }).changes.views, null);
});
