import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DASHBOARD_PATHS } from "../src/bridge/dashboardRoutes.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";
import { GENERAL_PAGES } from "../src/marketing/generalPages.js";
import { FREE_TOOL_PAGES, FREE_TOOLS, MEDIA_GUIDES } from "../src/tools/freeToolsCatalog.js";

for (const [path, heading] of [["tiktok-roast/index.html", "TikTok <span>Niche or Not"], ["index.html", "Post to every platform from one dashboard"], ["404.html", ">404<"], ["pricing/index.html", "Choose the space your publishing needs"], ["terms/index.html", "Terms of Service"], ["terms-of-service/index.html", "Terms of Service"], ["privacy/index.html", "Privacy Policy"], ["privacy-policy/index.html", "Privacy Policy"]]) {
  const html = await readFile(`dist/${path}`, "utf8");
  assert.match(html, /<h1/);
  assert.ok(html.includes(heading), `${path} must contain its own content without JavaScript`);
  assert.ok(!html.includes("Loading Meadow"));
  assert.ok(!html.includes("BridgeApp-"), "Public HTML must not preload the authenticated workspace");
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image" />'), `${path} must request a large link preview card`);
  assert.ok(html.includes('<meta property="og:image" content="https://findmeadow.com/meadow-og-v1.png" />'), `${path} must declare its link preview image`);
  assert.match(html, /<link rel="canonical" href="https:\/\/findmeadow\.com\/[^"]*" \/>/, `${path} must name the findmeadow.com address to index`);
  assert.ok(!html.includes('<meta name="robots"'), `${path} must stay indexable`);
}
await readFile("dist/meadow-og-v1.png");

// Duplicated legal routes point at one address so search engines do not split them.
for (const [duplicate, canonical] of [["terms-of-service", "terms"], ["privacy-policy", "privacy"]]) {
  const html = await readFile(`dist/${duplicate}/index.html`, "utf8");
  assert.ok(html.includes(`<link rel="canonical" href="https://findmeadow.com/${canonical}/" />`), `/${duplicate}/ must defer to /${canonical}/`);
  assert.ok(html.includes(`<meta property="og:url" content="https://findmeadow.com/${canonical}/" />`), `/${duplicate}/ must share the canonical preview URL`);
}

const robotsTxt = await readFile("dist/robots.txt", "utf8");
assert.match(robotsTxt, /^User-agent: \*$/m, "robots.txt must carry a directive, not only comments");
assert.match(robotsTxt, /^Sitemap: https:\/\/findmeadow\.com\/sitemap\.xml$/m, "robots.txt must point at the sitemap");

const sitemap = await readFile("dist/sitemap.xml", "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
assert.ok(sitemapUrls.includes("https://findmeadow.com/"), "The sitemap must list the homepage");
assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, "The sitemap must not repeat an address");
for (const excluded of ["/404", "/terms-of-service/", "/privacy-policy/"]) {
  assert.ok(!sitemapUrls.includes(`https://findmeadow.com${excluded}`), `The sitemap must leave out ${excluded}`);
}
for (const url of sitemapUrls) assert.match(url, /^https:\/\/findmeadow\.com\//, `Sitemap entry ${url} must use the canonical host`);

const roastHtml = await readFile("dist/tiktok-roast/index.html", "utf8");
assert.ok(!roastHtml.includes("Meadow is a social media scheduling tool, and I’m not sure what this has to do with our main product."), "tiktok-roast/index.html still contains removed intro copy");
assert.ok(roastHtml.includes("Find out if you’re making niche content or just normie posting."), "tiktok-roast/index.html missing requested subheader");
assert.ok(!roastHtml.includes("Turn the roast into your next post."), "tiktok-roast/index.html still contains removed copy");
assert.ok(!roastHtml.includes("Meadow, with the gloves off."), "tiktok-roast/index.html still contains the removed roaster name");
assert.ok(!roastHtml.includes("A little heat. A lot of room to grow."), "tiktok-roast/index.html still contains the removed roaster note");
assert.ok(roastHtml.includes('class="landing-header site-header"'), "tiktok-roast/index.html must use the standard Meadow navbar");
assert.ok(!roastHtml.includes('class="roast-nav"'), "tiktok-roast/index.html must not use its old custom navbar");
for (const navItem of ['href="https://findmeadow.com/#platforms">Platforms</a>', 'href="https://findmeadow.com/#ways-to-use">API/MCP</a>', ">Sign in</button>", ">Start posting "]) assert.ok(roastHtml.includes(navItem), `tiktok-roast/index.html missing standard navbar item ${navItem}`);
for (const route of new Set(Object.values(DASHBOARD_PATHS))) {
  const html = await readFile(`dist${route}/index.html`, "utf8");
  assert.match(html, /<title>Dashboard · Meadow<\/title>/);
  assert.ok(html.includes('<meta name="robots" content="noindex, follow" />'), `${route} must stay out of search results`);
  assert.ok(!html.includes('<link rel="canonical"'), `${route} must not claim a canonical address`);
}
const landingHtml = await readFile("dist/index.html", "utf8");
assert.ok(landingHtml.includes('href="https://findmeadow.com/#platforms">Platforms</a>'), "Homepage navbar must jump to the platform section");
assert.ok(!landingHtml.includes('platform-mega-menu'), "Homepage navbar must not render the old platform dropdown");
assert.ok(landingHtml.includes("Show up for every audience."), "Homepage platform section must use the requested heading");
assert.ok(!landingHtml.includes("Go where your audience is."), "Homepage platform section must not use the old heading");
assert.ok(landingHtml.indexOf('class="home-hero-platforms"') < landingHtml.indexOf('Post to every platform from one dashboard'), "Homepage platform logos must appear above the headline");
assert.ok(landingHtml.indexOf('Post to every platform from one dashboard') < landingHtml.indexOf('class="hero-demo"'), "Homepage demo must appear below the hero copy");
assert.ok(!landingHtml.includes("Free plan includes 5 connections."), "Homepage hero must not show the free connection count");
assert.ok(landingHtml.indexOf('class="footer-brand-row"') < landingHtml.indexOf('class="footer-columns"'), "Footer brand must appear above its link columns");
for (const removed of ["footer-network-row", "footer-disclaimer", "footer-legal-row", "footer-help-link", "footer-locale"]) {
  assert.ok(!landingHtml.includes(`class="${removed}"`), `Footer must not render ${removed}`);
}
assert.ok(!landingHtml.includes("Platform features, formats, and connection availability can vary by destination."));
assert.ok(landingHtml.includes('aria-label="Learn about Telegram publishing"'), "Homepage must include Telegram in its platform grid");
assert.ok(landingHtml.includes("all these platforms"), "Homepage must introduce its current platform list");
assert.ok(landingHtml.includes('>More coming soon</span>'), "Homepage platform grid must include its coming-soon tile");
assert.ok(!landingHtml.includes('class="upcoming-platforms"'), "Upcoming logos belong in the existing platform sections");
for (const id of ["twitch", "kick"]) assert.ok(landingHtml.includes(`data-platform="${id}"`), `${id} must appear in the homepage logo showcase`);
for (const platform of PLATFORM_USE_CASES) {
  const html = await readFile(`dist/${platform.slug}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${platform.title}</title>`), `${platform.slug} must have a platform-specific title`);
  assert.ok(html.includes(`content="${platform.description}"`), `${platform.slug} must have a platform-specific description`);
  assert.ok(html.includes(platform.headline), `${platform.slug} must render its own heading without JavaScript`);
  assert.ok(landingHtml.includes(`href="/${platform.slug}"`), `${platform.slug} must be linked from the homepage`);
  assert.ok(html.includes(`<meta property="og:url" content="https://findmeadow.com/${platform.slug}/" />`), `${platform.slug} must declare its own link preview URL`);
  assert.ok(html.includes(`<link rel="canonical" href="https://findmeadow.com/${platform.slug}/" />`), `${platform.slug} must name its own canonical address`);
  assert.ok(sitemapUrls.includes(`https://findmeadow.com/${platform.slug}/`), `${platform.slug} must appear in the sitemap`);
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
  assert.ok(html.includes(`<meta property="og:url" content="https://findmeadow.com${page.path}/" />`), `${page.path} must declare its own link preview URL`);
  assert.ok(html.includes(`<link rel="canonical" href="https://findmeadow.com${page.path}/" />`), `${page.path} must name its own canonical address`);
  assert.ok(sitemapUrls.includes(`https://findmeadow.com${page.path}/`), `${page.path} must appear in the sitemap`);
  assert.ok(html.includes('href="/telegram-publishing"'), `${page.path} must link to Telegram publishing`);
  assert.ok(html.includes("Can I publish to Telegram channels and groups?"), `${page.path} must explain Telegram setup`);
  for (const id of ["twitch", "kick"]) assert.ok(html.includes(`href="/${id}-publishing"`), `${page.path} must link to ${id}`);
  assert.ok(!html.includes('class="upcoming-platforms"'));
  for (const name of ["Twitch", "Kick"]) assert.ok(html.includes(`aria-label="${name}"`), `${page.path} must include ${name} in its logo sections`);
}
const toolsHubHtml = await readFile("dist/free-tools/index.html", "utf8");
assert.ok(landingHtml.includes('href="/free-tools/"'), "Homepage must link to the free tools hub");
for (const page of FREE_TOOL_PAGES) {
  const html = await readFile(`dist${page.path}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${page.title}</title>`), `${page.path} must have its own title`);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${page.path} must have one main heading`);
  assert.ok(html.includes(page.name), `${page.path} must render its own content without JavaScript`);
  assert.ok(html.includes(`<link rel="canonical" href="https://findmeadow.com${page.path}/" />`), `${page.path} must declare its canonical URL`);
  assert.ok(sitemapUrls.includes(`https://findmeadow.com${page.path}/`), `${page.path} must be in the sitemap`);
  assert.ok(!html.includes('name="robots"'), `${page.path} must be indexable`);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  assert.ok(schemas.some(schema => schema['@graph']?.some(item => item['@type'] === 'BreadcrumbList')), `${page.path} must contain valid structured data`);
  assert.ok(!html.includes('BridgeApp-'), `${page.path} must not preload the dashboard`);
}
for (const page of [...FREE_TOOLS, ...MEDIA_GUIDES]) assert.ok(toolsHubHtml.includes(`href="${page.path}/"`), `Hub must link to ${page.path}`);
console.log("All public pages, free tools, guides, and dashboard routes have deployable HTML entry points.");
