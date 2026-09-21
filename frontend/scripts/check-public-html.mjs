import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DASHBOARD_PATHS } from "../src/bridge/dashboardRoutes.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";
import { GENERAL_PAGES } from "../src/marketing/generalPages.js";

for (const [path, heading] of [["index.html", "Publish your way."], ["404.html", ">404<"], ["pricing/index.html", "Choose the space your publishing needs"], ["terms/index.html", "Terms of Service"], ["terms-of-service/index.html", "Terms of Service"], ["privacy/index.html", "Privacy Policy"], ["privacy-policy/index.html", "Privacy Policy"]]) {
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
const landingHtml = await readFile("dist/index.html", "utf8");
assert.ok(landingHtml.includes('aria-label="Learn about Telegram publishing"'), "Homepage must include Telegram in its platform grid");
assert.ok(landingHtml.includes("all eleven platforms"), "Homepage must show the current platform count");
assert.ok(!landingHtml.includes("Telegram and Snapchat are coming soon"));
for (const platform of PLATFORM_USE_CASES) {
  const html = await readFile(`dist/${platform.slug}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${platform.title}</title>`), `${platform.slug} must have a platform-specific title`);
  assert.ok(html.includes(`content="${platform.description}"`), `${platform.slug} must have a platform-specific description`);
  assert.ok(html.includes(platform.headline), `${platform.slug} must render its own heading without JavaScript`);
  assert.ok(landingHtml.includes(`href="/${platform.slug}"`), `${platform.slug} must be linked from the homepage`);
  if (platform.comingSoon) {
    assert.ok(html.includes("Coming soon"), `${platform.slug} must disclose its upcoming status`);
    assert.ok(html.includes("Production activation is still pending"));
    assert.ok(!html.includes(">Start posting "), `${platform.slug} must not offer immediate publishing`);
  }
}
for (const page of GENERAL_PAGES) {
  const html = await readFile(`dist${page.path}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${page.title}</title>`), `${page.path} must have its own title`);
  assert.ok(html.includes(`content="${page.description}"`), `${page.path} must have its own description`);
  assert.ok(html.includes(page.headline), `${page.path} must render its own heading without JavaScript`);
  assert.ok(html.includes("application/ld+json"), `${page.path} must include FAQ structured data`);
  assert.ok(!html.includes("BridgeApp-"), "Public HTML must not preload the authenticated workspace");
  assert.ok(landingHtml.includes(`href="${page.path}"`), `${page.path} must be linked from the homepage`);
  assert.ok(html.includes('href="/telegram-publishing"'), `${page.path} must link to Telegram publishing`);
  assert.ok(html.includes("Can I publish to Telegram channels and groups?"), `${page.path} must explain Telegram setup`);
  for (const id of ["twitch", "kick"]) assert.ok(html.includes(`href="/${id}-publishing"`), `${page.path} must link to ${id}`);
  assert.ok(html.includes("Twitch and Kick chat publishing — coming soon"));
}
console.log("All public pages and dashboard routes have deployable HTML entry points.");
