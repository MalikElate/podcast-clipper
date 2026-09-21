import assert from "node:assert/strict";
import test from "node:test";
import { GENERAL_PAGES, findMarketingPage } from "../src/marketing/generalPages.js";
import { PLATFORM_USE_CASES, getPlatformUseCaseBySlug } from "../src/platformUseCases.js";
import { isDashboardPath } from "../src/bridge/dashboardRoutes.js";

test("cross-platform pages have unique paths that do not collide with other routes", () => {
  assert.deepEqual(GENERAL_PAGES.map(page => page.path), ["/social-media-scheduler", "/cross-posting"]);
  const taken = new Set(["/pricing", "/terms", "/privacy", "/terms-of-service", "/privacy-policy", ...PLATFORM_USE_CASES.map(platform => `/${platform.slug}`)]);
  for (const page of GENERAL_PAGES) {
    assert.equal(taken.has(page.path), false);
    assert.equal(isDashboardPath(page.path), false);
    assert.equal(findMarketingPage(page.path), page);
  }
  assert.equal(findMarketingPage("/youtube-publishing"), null);
});

test("cross-platform pages have search metadata and answered questions", () => {
  for (const page of GENERAL_PAGES) {
    assert.ok(page.title.length <= 70, `${page.path} title length`);
    assert.ok(page.description.length >= 80 && page.description.length <= 200, `${page.path} description length`);
    assert.ok(page.faqs.length >= 5);
    assert.equal(new Set(page.faqs.map(item => item.q)).size, page.faqs.length, `${page.path} has duplicate questions`);
  }
});

test("Telegram is included in the public platform catalog and both marketing pages", () => {
  assert.equal(PLATFORM_USE_CASES.filter(platform => !platform.comingSoon).length, 11);
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

test("Twitch and Kick are listed as upcoming chat integrations, not available video destinations", () => {
  assert.deepEqual(PLATFORM_USE_CASES.filter(platform => platform.comingSoon).map(platform => platform.id), ["twitch", "kick"]);
  for (const id of ["twitch", "kick"]) {
    const platform = getPlatformUseCaseBySlug(`${id}-publishing`);
    assert.match(platform.title, /Coming Soon/);
    assert.match(platform.headline, /chat publishing is coming soon/);
    assert.match(platform.sectionBody, /not video uploads or live broadcasting/);
    assert.match(platform.sectionBody, /analytics are not available/);
  }
  for (const page of GENERAL_PAGES) assert.ok(page.faqs.some(faq => faq.q.includes("Twitch and Kick") && faq.a.includes("coming soon")));
});
