import assert from "node:assert/strict";
import test from "node:test";
import { APP_ORIGIN, MARKETING_ORIGIN, appHref, isLocalMarketingPreview, marketingHref, safeReturnPath, signupHref, siteSurface } from "../src/siteUrls.js";

const location = (hostname, origin = `https://${hostname}`) => ({ hostname, origin });

test("production hosts resolve to distinct marketing and application surfaces", () => {
  assert.equal(siteSurface(location("findmeadow.com")), "marketing");
  assert.equal(siteSurface(location("www.findmeadow.com")), "marketing");
  assert.equal(siteSurface(location("app.findmeadow.com")), "app");
  assert.equal(appHref("/dashboard/connections", location("findmeadow.com")), `${APP_ORIGIN}/dashboard/connections`);
  assert.equal(marketingHref("/#pricing", location("app.findmeadow.com")), `${MARKETING_ORIGIN}/#pricing`);
});

test("the free signup link preserves only advertising attribution", () => {
  const campaign = {
    ...location("findmeadow.com"),
    search: "?utm_source=facebook&utm_campaign=launch&utm_content=claude&fbclid=abc123&email=private%40example.com&code=secret",
  };
  assert.equal(signupHref(campaign), `${APP_ORIGIN}/sign-up?fbclid=abc123&utm_source=facebook&utm_campaign=launch&utm_content=claude`);
  assert.equal(signupHref(location("findmeadow.com")), `${APP_ORIGIN}/sign-up`);
});

test("development keeps the combined local surface", () => {
  const local = location("localhost", "http://localhost:5173");
  assert.equal(siteSurface(local), "integrated");
  assert.equal(appHref("/dashboard", local), "http://localhost:5173/dashboard");
  assert.equal(marketingHref("/pricing", local), "http://localhost:5173/pricing/");
  const marketingPreview = { ...local, search: "?surface=marketing" };
  assert.equal(isLocalMarketingPreview(marketingPreview, true), true);
  assert.equal(isLocalMarketingPreview(marketingPreview, false), false);
  assert.equal(isLocalMarketingPreview({ ...location("findmeadow.com"), search: "?surface=marketing" }, true), false);
});

test("sign-in returns only to Meadow pages, such as the OAuth consent screen", () => {
  const app = location("app.findmeadow.com");
  const consent = "https://app.findmeadow.com/oauth-consent?client_id=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcodex%2Fclient.json&scope=meadow%3Aread&state=abc";
  assert.equal(safeReturnPath(consent, app), "/oauth-consent?client_id=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcodex%2Fclient.json&scope=meadow%3Aread&state=abc");
  assert.equal(safeReturnPath("/dashboard/swipe#top", app), "/dashboard/swipe#top");
  for (const unsafe of ["https://evil.example/oauth-consent", "//evil.example/x", "javascript:alert(1)", "https://findmeadow.com/", "/sign-in?redirect_url=/dashboard", "https://app.findmeadow.com/sign-up", "", null, undefined]) {
    assert.equal(safeReturnPath(unsafe, app), null, String(unsafe));
  }
});
