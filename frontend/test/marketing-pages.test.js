import assert from "node:assert/strict";
import test from "node:test";
import { GENERAL_PAGES, PUBLIC_MARKETING_PAGES, findMarketingPage } from "../src/marketing/generalPages.js";
import { PLATFORM_USE_CASES, getPlatformUseCaseBySlug } from "../src/platformUseCases.js";
import { isDashboardPath } from "../src/bridge/dashboardRoutes.js";

test("cross-platform pages have unique paths that do not collide with other routes", () => {
  assert.deepEqual(GENERAL_PAGES.map(page => page.path), ["/social-media-scheduler", "/social-media-scheduling-api", "/manage-social-media-accounts", "/manage-multiple-social-media-accounts", "/cross-posting"]);
  const taken = new Set(["/pricing", "/terms", "/privacy", "/terms-of-service", "/privacy-policy", ...PLATFORM_USE_CASES.map(platform => `/${platform.slug}`)]);
  for (const page of GENERAL_PAGES) {
    assert.equal(taken.has(page.path), false);
    assert.equal(isDashboardPath(page.path), false);
    assert.equal(findMarketingPage(page.path), page);
  }
  assert.equal(findMarketingPage("/youtube-publishing"), null);
});

test("cross-platform pages have search metadata and answered questions", () => {
  for (const page of PUBLIC_MARKETING_PAGES) {
    assert.ok(page.title.length <= 70, `${page.path} title length`);
    assert.ok(page.description.length >= 80 && page.description.length <= 200, `${page.path} description length`);
    assert.ok(page.faqs.length >= 5);
    assert.equal(new Set(page.faqs.map(item => item.q)).size, page.faqs.length, `${page.path} has duplicate questions`);
  }
});

test("the six publishing use cases resolve as distinct public routes", () => {
  const paths = ["/post-to-multiple-tiktok-accounts", "/post-to-multiple-instagram-accounts", "/bulk-scheduling", "/social-media-calendar", "/schedule-first-comment", "/agencies"];
  for (const path of paths) {
    const page = findMarketingPage(path);
    assert.equal(page?.kind, "publishing-use-case", path);
    assert.equal(isDashboardPath(path), false);
  }
  assert.equal(new Set(PUBLIC_MARKETING_PAGES.map(page => page.path)).size, PUBLIC_MARKETING_PAGES.length);
});

test("the Hootsuite comparison is a distinct public route with sourced content", () => {
  const page = findMarketingPage("/hootsuite-alternative");
  assert.equal(page.kind, "alternative");
  assert.equal(isDashboardPath(page.path), false);
  assert.equal(new Set(PUBLIC_MARKETING_PAGES.map(item => item.path)).size, PUBLIC_MARKETING_PAGES.length);
  assert.equal(page.checkedAt, "2026-10-12");
  assert.ok(page.comparison.length >= 8);
  assert.equal(new Set(page.comparison.map(row => row.feature)).size, page.comparison.length);
  for (const row of page.comparison) assert.ok(row.meadow && row.hootsuite);
  for (const source of page.sources) assert.match(new URL(source.href).hostname, /(?:^|\.)hootsuite\.com$/);
  assert.ok(page.faqs.some(item => item.q.includes("automatically") && item.a.includes("no automatic Hootsuite migration")));
});

test("the complete Buffer through Upload-Post range resolves as sourced public comparisons", () => {
  const competitors = ["buffer", "later", "postiz", "publer", "sprout-social", "metricool", "post-bridge", "zernio", "blotato", "planoly", "loomly", "tailwind", "coschedule", "ayrshare", "upload-post"];
  const pages = competitors.map(slug => findMarketingPage(`/alternatives/${slug}`));
  assert.equal(PUBLIC_MARKETING_PAGES.filter(page => page.path.startsWith("/alternatives/")).length, competitors.length);
  assert.equal(new Set(pages.map(page => page.headline)).size, competitors.length);
  for (const page of pages) {
    assert.equal(page.kind, "alternative");
    assert.equal(isDashboardPath(page.path), false);
    assert.ok(page.competitor && page.fit.meadow && page.fit.competitor);
    assert.ok(page.comparison.length >= 8);
    assert.equal(new Set(page.comparison.map(row => row.feature)).size, page.comparison.length);
    for (const row of page.comparison) assert.ok(row.meadow && row.competitor);
    assert.ok(page.sources.length > 0);
    for (const source of page.sources) assert.equal(new URL(source.href).protocol, "https:");
  }
  assert.match(findMarketingPage("/alternatives/zernio").disclosure, /Meadow uses Zernio/);
});

test("all twelve agent and API topics resolve without claiming the MCP protocol route", () => {
  const paths = ["/social-media-mcp-server", "/claude", "/chatgpt", "/claude-code", "/best-social-media-tools-for-ai-agents", "/blog/post-to-social-media-with-ai-agents", "/youtube-mcp", "/instagram-mcp", "/social-media-api", "/tiktok-api", "/instagram-api", "/youtube-api"];
  for (const path of paths) {
    assert.equal(findMarketingPage(path)?.kind, "agent-api", path);
    assert.equal(isDashboardPath(path), false, path);
  }
  assert.equal(findMarketingPage("/mcp"), null, "MCP transport must remain separate from public HTML");
  assert.equal(new Set(PUBLIC_MARKETING_PAGES.map(page => page.path)).size, PUBLIC_MARKETING_PAGES.length);
});

test("Telegram is included in the public platform catalog and marketing pages", () => {
  assert.equal(PLATFORM_USE_CASES.filter(platform => !platform.chatOnly).length, 11);
  const telegram = getPlatformUseCaseBySlug("telegram-publishing");
  assert.equal(telegram.id, "telegram");
  assert.match(telegram.intro, /channels and groups/);
  assert.match(telegram.sectionBody, /administrator with permission to post/);
  assert.match(telegram.sectionBody, /metrics are not available/);
  for (const page of GENERAL_PAGES) {
    assert.match(page.title, /11/);
    assert.match(page.description, /Telegram/);
    assert.ok(page.faqs.some(faq => /Telegram channels and groups/.test(faq.q)));
    assert.doesNotMatch(JSON.stringify(page), /\bten\b|\b10 (?:Social )?Platforms/);
  }
});

test("Twitch and Kick describe chat capabilities without launch labels", () => {
  assert.deepEqual(PLATFORM_USE_CASES.filter(platform => platform.chatOnly).map(platform => platform.id), ["twitch", "kick"]);
  for (const id of ["twitch", "kick"]) {
    const platform = getPlatformUseCaseBySlug(`${id}-publishing`);
    assert.match(platform.title, /Chat Publishing & Scheduling/);
    assert.doesNotMatch(JSON.stringify(platform), /coming[ -]soon/i);
    assert.match(platform.headline, /chat publishing, organized in one place/);
    assert.match(platform.sectionBody, /not video uploads or live broadcasting/);
    assert.match(platform.sectionBody, /analytics are not available/);
  }
  for (const page of GENERAL_PAGES) assert.ok(page.faqs.some(faq => faq.q.includes("Twitch and Kick") && faq.a.includes("Connection availability depends on platform configuration")));
});
