import test from "node:test";
import assert from "node:assert/strict";
import { marketingPath, marketingHref } from "../src/siteUrls.js";

test("public pages are linked at the address the assets actually serve", () => {
  assert.equal(marketingPath("/pricing"), "/pricing/");
  assert.equal(marketingPath("/tiktok-publishing"), "/tiktok-publishing/");
  assert.equal(marketingPath("/free-tools/utm-builder"), "/free-tools/utm-builder/");
});

test("a path that already ends in a slash is left alone", () => {
  assert.equal(marketingPath("/free-tools/"), "/free-tools/");
  assert.equal(marketingPath("/"), "/");
});

test("fragments and queries keep their shape", () => {
  assert.equal(marketingPath("/#faq"), "/#faq");
  assert.equal(marketingPath("/#ways-to-use"), "/#ways-to-use");
  assert.equal(marketingPath("/pricing?checkout=pro"), "/pricing?checkout=pro");
});

test("absolute and non-path values pass through", () => {
  assert.equal(marketingPath("https://example.com/x"), "https://example.com/x");
  assert.equal(marketingPath(undefined), "/");
});

test("cross-origin marketing links carry the slash too", () => {
  const location = { hostname: "app.findmeadow.com", origin: "https://app.findmeadow.com" };
  assert.equal(marketingHref("/contact", location), "https://findmeadow.com/contact/");
  assert.equal(marketingHref("/#faq", location), "https://findmeadow.com/#faq");
});
