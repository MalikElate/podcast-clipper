import test from "node:test";
import assert from "node:assert/strict";
import { FREE_TOOLS, MEDIA_GUIDES, schedulerFor } from "../src/tools/freeToolsCatalog.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";
import { GENERAL_PAGES } from "../src/marketing/generalPages.js";

const realPaths = new Set([...PLATFORM_USE_CASES.map(p => `/${p.slug}/`), ...GENERAL_PAGES.map(p => `${p.path}/`)]);

test("every tool points at a page that exists", () => {
  for (const page of [...FREE_TOOLS, ...MEDIA_GUIDES]) {
    const { path } = schedulerFor(page);
    assert.ok(realPaths.has(path), `${page.slug} links to ${path}, which is not a real page`);
  }
});

test("a tool made for one platform points at that platform", () => {
  for (const [slug, expected] of [
    ["youtube-title-checker", "/youtube-publishing/"],
    ["youtube-tag-generator", "/youtube-publishing/"],
    ["tiktok-caption-generator", "/tiktok-publishing/"],
    ["tiktok-username-checker", "/tiktok-publishing/"],
    ["instagram-grid-maker", "/instagram-publishing/"],
    ["instagram-handle-checker", "/instagram-publishing/"],
    ["linkedin-text-formatter", "/linkedin-publishing/"],
  ]) {
    assert.equal(schedulerFor({ slug }).path, expected, `${slug} must point at ${expected}`);
  }
});

test("a tool with no single destination points at the all-platform scheduler", () => {
  for (const slug of ["utm-builder", "social-media-image-cropper"]) {
    const scheduler = schedulerFor({ slug });
    assert.equal(scheduler.path, "/social-media-scheduler/");
    assert.equal(scheduler.platform, null);
  }
});

test("a platform prefix does not match a longer unrelated word", () => {
  // "x-image-sizes" is X; "xylophone-tips" would not be.
  assert.equal(schedulerFor({ slug: "x-image-sizes" }).platform, "X");
  assert.equal(schedulerFor({ slug: "xylophone-tips" }).platform, null);
});

test("every size guide reaches its platform's scheduler", () => {
  for (const guide of MEDIA_GUIDES) {
    assert.ok(schedulerFor(guide).platform, `${guide.slug} must name a platform`);
  }
});
