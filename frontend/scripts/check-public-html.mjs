import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DASHBOARD_PATHS } from "../src/bridge/dashboardRoutes.js";

for (const [path, heading] of [["index.html", "Publish across every social media"], ["404.html", ">404<"], ["pricing/index.html", "Choose the space your publishing needs"], ["terms/index.html", "Terms of Service"], ["terms-of-service/index.html", "Terms of Service"], ["privacy/index.html", "Privacy Policy"], ["privacy-policy/index.html", "Privacy Policy"]]) {
  const html = await readFile(`dist/${path}`, "utf8");
  assert.match(html, /<h1/);
  assert.ok(html.includes(heading), `${path} must contain its own content without JavaScript`);
  assert.ok(!html.includes("Loading Meadow"));
  assert.ok(!html.includes("BridgeApp-"), "Public HTML must not preload the authenticated workspace");
}
for (const route of new Set(Object.values(DASHBOARD_PATHS))) {
  const html = await readFile(`dist${route}/index.html`, "utf8");
  assert.match(html, /<title>Dashboard · Meadow<\/title>/);
}
console.log("All public pages and dashboard routes have deployable HTML entry points.");
