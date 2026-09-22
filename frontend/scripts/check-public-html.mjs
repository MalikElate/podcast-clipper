import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DASHBOARD_PATHS } from "../src/bridge/dashboardRoutes.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";
import { GENERAL_PAGES } from "../src/marketing/generalPages.js";

for (const [path, heading] of [["tiktok-roast/index.html", "TikTok <span>Niche or Not"], ["index.html", "Publish your way."], ["404.html", ">404<"], ["pricing/index.html", "Choose the space your publishing needs"], ["terms/index.html", "Terms of Service"], ["terms-of-service/index.html", "Terms of Service"], ["privacy/index.html", "Privacy Policy"], ["privacy-policy/index.html", "Privacy Policy"]]) {
  const html = await readFile(`dist/${path}`, "utf8");
  assert.match(html, /<h1/);
  assert.ok(html.includes(heading), `${path} must contain its own content without JavaScript`);
  assert.ok(!html.includes("Loading Meadow"));
  assert.ok(!html.includes("BridgeApp-"), "Public HTML must not preload the authenticated workspace");
}

const roastHtml = await readFile("dist/tiktok-roast/index.html", "utf8");
assert.ok(!roastHtml.includes("Meadow is a social media scheduling tool, and I’m not sure what this has to do with our main product."), "tiktok-roast/index.html still contains removed intro copy");
assert.ok(roastHtml.includes("Find out if you’re making niche content or just normie posting."), "tiktok-roast/index.html missing requested subheader");
assert.ok(!roastHtml.includes("Turn the roast into your next post."), "tiktok-roast/index.html still contains removed copy");
assert.ok(!roastHtml.includes("Meadow, with the gloves off."), "tiktok-roast/index.html still contains the removed roaster name");
assert.ok(!roastHtml.includes("A little heat. A lot of room to grow."), "tiktok-roast/index.html still contains the removed roaster note");
assert.ok(roastHtml.includes('class="landing-header site-header"'), "tiktok-roast/index.html must use the standard Meadow navbar");
assert.ok(!roastHtml.includes('class="roast-nav"'), "tiktok-roast/index.html must not use its old custom navbar");
for (const navItem of ['href="/#platforms"', 'href="/pricing"', ">Sign in</button>", ">Start posting "]) assert.ok(roastHtml.includes(navItem), `tiktok-roast/index.html missing standard navbar item ${navItem}`);
for (const route of new Set(Object.values(DASHBOARD_PATHS))) {
  const html = await readFile(`dist${route}/index.html`, "utf8");
  assert.match(html, /<title>Dashboard · Meadow<\/title>/);
}
const landingHtml = await readFile("dist/index.html", "utf8");
assert.ok(landingHtml.indexOf('class="footer-brand-row"') < landingHtml.indexOf('class="footer-columns"'), "Footer brand must appear above its link columns");
for (const removed of ["footer-network-row", "footer-disclaimer", "footer-legal-row", "footer-help-link", "footer-locale"]) {
  assert.ok(!landingHtml.includes(`class="${removed}"`), `Footer must not render ${removed}`);
}
assert.ok(!landingHtml.includes("Platform features, formats, and connection availability can vary by destination."));
assert.ok(landingHtml.includes('aria-label="Learn about Telegram publishing"'), "Homepage must include Telegram in its platform grid");
assert.ok(landingHtml.includes("all these platforms"), "Homepage must introduce its current platform list");
assert.doesNotMatch(landingHtml, /coming[ -]soon/i);
assert.ok(!landingHtml.includes('class="upcoming-platforms"'), "Upcoming logos belong in the existing platform sections");
for (const id of ["twitch", "kick"]) assert.ok(landingHtml.includes(`data-platform="${id}"`), `${id} must appear in the homepage logo showcase`);
for (const platform of PLATFORM_USE_CASES) {
  const html = await readFile(`dist/${platform.slug}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${platform.title}</title>`), `${platform.slug} must have a platform-specific title`);
  assert.ok(html.includes(`content="${platform.description}"`), `${platform.slug} must have a platform-specific description`);
  assert.ok(html.includes(platform.headline), `${platform.slug} must render its own heading without JavaScript`);
  assert.ok(landingHtml.includes(`href="/${platform.slug}"`), `${platform.slug} must be linked from the homepage`);
  if (platform.chatOnly) {
    assert.doesNotMatch(html, /coming[ -]soon/i);
    assert.ok(html.includes("depend on platform configuration"));
    assert.equal(html.match(/>Start posting /g)?.length || 0, 1, `${platform.slug} must only show Start posting in the shared navbar`);
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
  assert.ok(!html.includes('class="upcoming-platforms"'));
  for (const name of ["Twitch", "Kick"]) assert.ok(html.includes(`aria-label="${name}"`), `${page.path} must include ${name} in its logo sections`);
}
console.log("All public pages and dashboard routes have deployable HTML entry points.");
