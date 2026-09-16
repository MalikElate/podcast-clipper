import assert from "node:assert/strict";
import test from "node:test";
import { GENERAL_PAGES, findMarketingPage } from "../src/marketing/generalPages.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";
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
