import assert from "node:assert/strict";
import test from "node:test";
import { APP_ORIGIN, MARKETING_ORIGIN, appHref, marketingHref, siteSurface } from "../src/siteUrls.js";

const location = (hostname, origin = `https://${hostname}`) => ({ hostname, origin });

test("production hosts resolve to distinct marketing and application surfaces", () => {
  assert.equal(siteSurface(location("findmeadow.com")), "marketing");
  assert.equal(siteSurface(location("www.findmeadow.com")), "marketing");
  assert.equal(siteSurface(location("app.findmeadow.com")), "app");
  assert.equal(appHref("/dashboard/connections", location("findmeadow.com")), `${APP_ORIGIN}/dashboard/connections`);
  assert.equal(marketingHref("/#pricing", location("app.findmeadow.com")), `${MARKETING_ORIGIN}/#pricing`);
});

test("development keeps the combined local surface", () => {
  const local = location("localhost", "http://localhost:5173");
  assert.equal(siteSurface(local), "integrated");
  assert.equal(appHref("/dashboard", local), "http://localhost:5173/dashboard");
  assert.equal(marketingHref("/pricing", local), "http://localhost:5173/pricing");
});
