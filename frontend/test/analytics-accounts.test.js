import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const catalog = [
  { id: "tiktok", name: "TikTok", color: "#111111" },
  { id: "instagram", name: "Instagram", color: "#e1306c" },
  { id: "youtube", name: "YouTube", color: "#ff0033" },
];
const visibleText = html => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const updatedAt = Date.parse("2026-09-20T14:30:00Z");
const accountFixture = (overrides = {}) => ({
  id: "tiktok-studio", platform: "tiktok", label: "Meadow Studio", status: "connected",
  totals: {
    values: { engagement: 19, views: 0, impressions: null, likes: 12, comments: 3, shares: 4, saves: null, clicks: 9 },
    coverage: {},
  },
  posts: [{ id: "published", delivery: { status: "published", metricsUpdatedAt: updatedAt, metrics: { views: 0, likes: 12 } } }],
  ...overrides,
});

test("account analytics attribute measured and unavailable values to their social account", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const { AccountAnalyticsCard, aggregateDeliveryHistory, buildComparisonSeries } = await server.ssrLoadModule("/src/bridge/Analytics.jsx");
    const props = account => ({ account, catalog, timeZone: "UTC", selected: false, compareDisabled: false, onCompare() {}, onOpen() {} });
    const render = account => visibleText(renderToStaticMarkup(createElement(AccountAnalyticsCard, props(account))));

    await t.test("accounts with the same display name remain visibly distinguished by platform", () => {
      const html = renderToStaticMarkup(createElement(Fragment, null,
        createElement(AccountAnalyticsCard, props(accountFixture())),
        createElement(AccountAnalyticsCard, props(accountFixture({ id: "instagram-studio", platform: "instagram" }))),
      ));
      const text = visibleText(html);
      assert.equal(text.match(/Meadow Studio/g)?.length, 2);
      assert.match(text, /TikTok/);
      assert.match(text, /Instagram/);
    });

    await t.test("all eight metrics retain genuine zero and unavailable readings", () => {
      const text = render(accountFixture());
      for (const [label, value] of [["Engagement", "19"], ["Views", "0"], ["Impressions", "—"], ["Likes", "12"], ["Comments", "3"], ["Shares", "4"], ["Saves", "—"], ["Clicks", "9"]]) {
        assert.match(text, new RegExp(`${label}\\s+${value}(?:\\s|$)`));
      }
    });

    await t.test("drafts and TikTok inbox handoffs do not count as published posts or newer metric readings", () => {
      const latestPublished = Date.parse("2026-09-21T10:15:00Z");
      const text = render(accountFixture({ posts: [
        { id: "first", delivery: { status: "published", metricsUpdatedAt: updatedAt } },
        { id: "second", delivery: { status: "published", metricsUpdatedAt: latestPublished } },
        { id: "inbox", delivery: { status: "awaiting_publish", metricsUpdatedAt: Date.parse("2026-09-23T10:15:00Z") } },
        { id: "draft", delivery: { status: "draft" } },
      ] }));
      assert.match(text, /2 published posts/);
      assert.doesNotMatch(text, /[34] published posts/);
      const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(latestPublished);
      assert.ok(text.includes(formatted), `Expected latest published reading ${formatted} in ${text}`);
    });

    await t.test("a refresh failure and availability note coexist with the previous measured values", () => {
      const text = render(accountFixture({ posts: [{ id: "published", delivery: {
        status: "published", metricsUpdatedAt: updatedAt, metricsAttemptedAt: updatedAt + 60000,
        metricsError: "TikTok permission needs to be renewed.",
        metricsNote: "Private videos have no public view count.",
      } }] }));
      assert.match(text, /Likes\s+12/);
      assert.match(text, /TikTok permission needs to be renewed\./);
      assert.match(text, /Private videos have no public view count\./);
      assert.ok(text.includes(new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(updatedAt)));
    });

    await t.test("YouTube directs users to raw per-video metrics without displaying account aggregates", () => {
      const text = render(accountFixture({
        id: "youtube-studio", platform: "youtube",
        totals: { values: { engagement: 7777, views: 8888, likes: 9999 }, coverage: {} },
      }));
      assert.match(text, /YouTube/);
      assert.match(text, /Metrics available per video/);
      assert.match(text, /View video analytics/);
      assert.doesNotMatch(text, /7,?777|8,?888|9,?999/);
    });

    await t.test("comparison series combine delivery snapshots and carry totals across chart buckets", () => {
      const first = Date.parse("2026-09-20T10:00:00Z"), second = Date.parse("2026-09-21T10:00:00Z");
      const history = aggregateDeliveryHistory([
        { platform: "instagram", metricsHistory: [{ at: first, values: { views: 10, likes: 1 } }, { at: second, values: { views: 15, likes: 2 } }] },
        { platform: "tiktok", metricsHistory: [{ at: second, values: { views: 7, likes: 3 } }] },
      ]);
      assert.deepEqual(history.map(point => point.values.views), [10, 22]);
      assert.deepEqual(history.map(point => point.values.engagement), [1, 5]);
      const chart = buildComparisonSeries([{ id: "combined", label: "Combined", history }], "views", "day", "all", second);
      assert.deepEqual(chart.series[0].points.map(point => point.value), [10, 22]);
    });
  } finally {
    await server.close();
  }
});
