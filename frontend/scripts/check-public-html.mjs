import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DASHBOARD_PATHS } from "../src/bridge/dashboardRoutes.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";
import { PUBLIC_MARKETING_PAGES } from "../src/marketing/generalPages.js";
import { FREE_TOOL_PAGES, FREE_TOOLS, MEDIA_GUIDES, schedulerFor } from "../src/tools/freeToolsCatalog.js";
import { CONTENT_PAGES, BLOG_HUB } from "../src/blog/catalog.js";
import { BLOG_ARTICLES } from "../src/blog/articles.js";
import { CONTENT_PATHS } from "../src/blog/routes.js";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, LEGAL_ENTITY } from "../src/siteContact.js";

for (const [path, heading] of [["tools/tiktok-roast/index.html", "TikTok <span>Niche or Not"], ["index.html", "Creator tools for your AI"], ["404.html", ">404<"], ["pricing/index.html", "<h1>Pricing</h1>"], ["docs/index.html", "Meadow docs"], ["developers/index.html", "Let an AI client draft, schedule and publish your posts."], ["terms/index.html", "Terms of Service"], ["terms-of-service/index.html", "Terms of Service"], ["privacy/index.html", "Privacy Policy"], ["privacy-policy/index.html", "Privacy Policy"]]) {
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
for (const excluded of ["/404", "/start/", "/terms-of-service/", "/privacy-policy/"]) {
  assert.ok(!sitemapUrls.includes(`https://findmeadow.com${excluded}`), `The sitemap must leave out ${excluded}`);
}
const funnelHtml = await readFile("dist/start/index.html", "utf8");
assert.ok(funnelHtml.includes("Create once."), "The ad funnel must render its promise without JavaScript");
assert.ok(funnelHtml.includes("Publish everywhere."), "The ad funnel must render its cross-platform outcome without JavaScript");
assert.ok(funnelHtml.includes("Start Posting for Free"), "The ad funnel must present a free-signup action");
assert.ok(funnelHtml.includes("Connect social accounts on the free plan"), "The ad funnel must explain the free offer without claiming a regional limit");
assert.ok(funnelHtml.includes('href="https://app.findmeadow.com/sign-up"'), "The ad funnel must link directly to account creation");
assert.ok(funnelHtml.includes('<meta name="robots" content="noindex, follow" />'), "The paid landing page must stay out of the sitemap and search results");
assert.ok(!funnelHtml.includes('<link rel="canonical"'), "The paid landing page must not claim an indexed canonical URL");
for (const path of ["sign-in/index.html", "sign-up/index.html", "sign-up/complete/index.html", "oauth-consent/index.html"]) {
  const html = await readFile(`dist/${path}`, "utf8");
  assert.ok(html.includes('<meta name="robots" content="noindex, follow" />'), `${path} must stay out of search results`);
  assert.ok(!html.includes('<link rel="canonical"'), `${path} must not claim a canonical address`);
}
const oauthConsentHtml = await readFile("dist/oauth-consent/index.html", "utf8");
assert.ok(oauthConsentHtml.includes('<meta name="referrer" content="strict-origin-when-cross-origin" />'), "The OAuth consent route must preserve its origin on Clerk submissions");
for (const url of sitemapUrls) assert.match(url, /^https:\/\/findmeadow\.com\//, `Sitemap entry ${url} must use the canonical host`);

// The developer overview points to a separate, publicly rendered reference.
const developersHtml = await readFile("dist/developers/index.html", "utf8");
const docsHtml = await readFile("dist/docs/index.html", "utf8");
assert.ok(developersHtml.includes('href="https://findmeadow.com/docs/">Read the docs</a>'), "The developer overview must link to the docs page");
assert.ok(!developersHtml.includes("dev-tool-list") && !developersHtml.includes("@modelcontextprotocol/inspector"), "The technical reference must live on the docs page");
assert.ok(docsHtml.includes("https://findmeadow.com/mcp"), "The docs page must give the server URL");
assert.ok(docsHtml.includes('"@type":"FAQPage"'), "The docs page must answer questions in a form search engines read");
assert.ok(docsHtml.includes("publish_post") && docsHtml.includes("meadow:publish"), "The docs page must name the publishing tool and the permission it needs");
for (const id of ["quickstart", "tools", "webhooks", "faq"]) {
  assert.ok(docsHtml.includes(`href="#${id}"`) && docsHtml.includes(`id="${id}"`), `The docs page must have a reachable ${id} section`);
}
for (const overclaim of ["publish to 13", "Publish to 13", "publish to eleven platforms"]) {
  for (const html of [developersHtml, docsHtml]) assert.ok(!html.includes(overclaim), `Developer pages must not claim they can ${overclaim}`);
}
assert.ok(sitemapUrls.includes("https://findmeadow.com/developers/"), "The developer page must appear in the sitemap");
assert.ok(sitemapUrls.includes("https://findmeadow.com/docs/"), "The docs page must appear in the sitemap");
assert.ok(docsHtml.includes('<link rel="canonical" href="https://findmeadow.com/docs/" />'), "The docs page must use its own canonical address");

// People must be able to reach a person, and search engines must see how.
const contactHtml = await readFile("dist/contact/index.html", "utf8");
for (const detail of [`mailto:${CONTACT_EMAIL}`, `tel:${CONTACT_PHONE}`, CONTACT_PHONE_DISPLAY, LEGAL_ENTITY]) {
  assert.ok(contactHtml.includes(detail), `The contact page must show ${detail}`);
}
assert.ok(contactHtml.includes('"@type":"ContactPoint"'), "The contact page must describe its contact point for search engines");
assert.ok(sitemapUrls.includes("https://findmeadow.com/contact/"), "The contact page must appear in the sitemap");

// A tool that never points anywhere leaves the visitor at a dead end and the
// page without an internal link to the product it exists to introduce.
for (const tool of FREE_TOOLS) {
  const html = await readFile(`dist${tool.path}/index.html`, "utf8");
  const { path } = schedulerFor(tool);
  assert.ok(html.includes(`href="${path}"`), `${tool.path} must link to ${path}`);
}
for (const platform of PLATFORM_USE_CASES) {
  const html = await readFile(`dist/${platform.slug}/index.html`, "utf8");
  assert.ok(html.includes('href="https://findmeadow.com/#ways-to-use"'), `${platform.slug} must link to the API and MCP section`);
}

const roastHtml = await readFile("dist/tools/tiktok-roast/index.html", "utf8");
assert.ok(roastHtml.includes('<link rel="canonical" href="https://findmeadow.com/tools/tiktok-roast/" />'), "TikTok roast must use its new canonical URL");
assert.ok(roastHtml.includes('<meta property="og:url" content="https://findmeadow.com/tools/tiktok-roast/" />'), "TikTok roast must use its new preview URL");
assert.ok(sitemapUrls.includes("https://findmeadow.com/tools/tiktok-roast/"), "TikTok roast must appear under tools in the sitemap");
assert.ok(!sitemapUrls.includes("https://findmeadow.com/tiktok-roast/"), "The sitemap must omit the retired TikTok roast URL");
assert.ok(!roastHtml.includes("Meadow is a social media scheduling tool, and I’m not sure what this has to do with our main product."), "tools/tiktok-roast/index.html still contains removed intro copy");
assert.ok(roastHtml.includes("Find out if you’re making niche content or just normie posting."), "tools/tiktok-roast/index.html missing requested subheader");
assert.ok(!roastHtml.includes("Turn the roast into your next post."), "tools/tiktok-roast/index.html still contains removed copy");
assert.ok(!roastHtml.includes("Meadow, with the gloves off."), "tools/tiktok-roast/index.html still contains the removed roaster name");
assert.ok(!roastHtml.includes("A little heat. A lot of room to grow."), "tools/tiktok-roast/index.html still contains the removed roaster note");
assert.ok(roastHtml.includes('class="landing-header site-header"'), "tools/tiktok-roast/index.html must use the standard Meadow navbar");
assert.ok(!roastHtml.includes('class="roast-nav"'), "tools/tiktok-roast/index.html must not use its old custom navbar");
for (const navItem of ['href="https://findmeadow.com/contact/"><strong>support</strong></a>', 'href="https://findmeadow.com/#ways-to-use"><strong>API/MCP</strong></a>', ">Sign in</button>", 'href="https://app.findmeadow.com/sign-up">Try for free']) assert.ok(roastHtml.includes(navItem), `tools/tiktok-roast/index.html missing standard navbar item ${navItem}`);
for (const route of new Set(Object.values(DASHBOARD_PATHS))) {
  const html = await readFile(`dist${route}/index.html`, "utf8");
  assert.match(html, /<title>Dashboard · Meadow<\/title>/);
  assert.ok(html.includes('<meta name="robots" content="noindex, follow" />'), `${route} must stay out of search results`);
  assert.ok(!html.includes('<link rel="canonical"'), `${route} must not claim a canonical address`);
}
const landingHtml = await readFile("dist/index.html", "utf8");
// Search engines read these from the served HTML, so assert the rendered page
// rather than the module that builds them.
assert.ok(landingHtml.includes('href="/developers/"'), "The developer page must be reachable from the footer");
assert.ok(landingHtml.includes('href="/docs/">Docs</a>'), "The docs page must be reachable from the footer");
for (const type of ["Organization", "WebSite", "SoftwareApplication"]) {
  assert.ok(landingHtml.includes(`"@type":"${type}"`), `The homepage must describe itself as a ${type}`);
}
assert.ok(!landingHtml.includes('"priceCurrency":"USD"'), "Static schema must not advertise one currency to every region");
for (const path of ["index.html", "pricing/index.html", ...PUBLIC_MARKETING_PAGES.map(page => `${page.path.slice(1)}/index.html`)]) {
  const html = path === "index.html" ? landingHtml : await readFile(`dist/${path}`, "utf8");
  assert.ok(html.includes("Checking local prices…"), `${path} must wait for the server pricing quote`);
  assert.doesNotMatch(html, /Billed \$\d+ yearly/, `${path} must not prerender global dollar prices`);
}
for (const unearned of ["aggregateRating", "reviewCount", "ratingValue"]) {
  assert.ok(!landingHtml.includes(unearned), `The homepage must not claim ${unearned}`);
}
for (const id of ["workflows", "publish-with-an-agent"]) {
  const section = landingHtml.match(new RegExp(`<section\\b[^>]*id="${id}"[\\s\\S]*?<\\/section>`))?.[0];
  assert.ok(section, `Homepage must retain the ${id} section`);
  const actions = section.match(/<div class="scheduling-use-case-actions">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(actions, `${id} must have a signup action`);
  assert.equal([...actions.matchAll(/<(?:a|button)\b/g)].length, 1, `${id} must have only one action`);
  assert.ok(actions.includes('href="https://app.findmeadow.com/sign-up">Try for free '), `${id} must link directly to free signup`);
}
assert.ok(landingHtml.includes('href="https://findmeadow.com/contact/"><strong>support</strong></a>'), "Homepage navbar must link to the support page");
assert.ok(!landingHtml.includes('platform-mega-menu'), "Homepage navbar must not render the old platform dropdown");
assert.ok(landingHtml.includes("Show up for every audience."), "Homepage platform section must use the requested heading");
assert.ok(!landingHtml.includes("Go where your audience is."), "Homepage platform section must not use the old heading");
assert.ok(landingHtml.indexOf('class="home-hero-platforms"') < landingHtml.indexOf('Creator tools for your AI'), "Homepage platform logos must appear above the headline");
assert.ok(landingHtml.indexOf('Creator tools for your AI') < landingHtml.indexOf('class="hero-demo"'), "Homepage demo must appear below the hero copy");
assert.ok(!landingHtml.includes("Free plan includes 5 connections."), "Homepage hero must not show the free connection count");
assert.ok(landingHtml.indexOf('class="footer-brand-row"') < landingHtml.indexOf('class="footer-columns"'), "Footer brand must appear above its link columns");
for (const removed of ["footer-network-row", "footer-disclaimer", "footer-legal-row", "footer-help-link", "footer-locale"]) {
  assert.ok(!landingHtml.includes(`class="${removed}"`), `Footer must not render ${removed}`);
}
assert.ok(!landingHtml.includes("Platform features, formats, and connection availability can vary by destination."));
assert.ok(landingHtml.includes('aria-label="Learn about Telegram publishing"'), "Homepage must include Telegram in its platform grid");
assert.ok(landingHtml.includes("all these platforms"), "Homepage must introduce its current platform list");
assert.ok(!landingHtml.includes('class="upcoming-platforms"'), "Upcoming logos belong in the existing platform sections");
for (const id of ["twitch", "kick"]) assert.ok(landingHtml.includes(`data-platform="${id}"`), `${id} must appear in the homepage logo showcase`);
for (const platform of PLATFORM_USE_CASES) {
  const html = await readFile(`dist/${platform.slug}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${platform.title}</title>`), `${platform.slug} must have a platform-specific title`);
  assert.ok(html.includes(`content="${platform.description}"`), `${platform.slug} must have a platform-specific description`);
  assert.ok(html.includes(platform.headline), `${platform.slug} must render its own heading without JavaScript`);
  assert.ok(landingHtml.includes(`href="/${platform.slug}/"`), `${platform.slug} must be linked from the homepage`);
  assert.ok(html.includes(`<meta property="og:url" content="https://findmeadow.com/${platform.slug}/" />`), `${platform.slug} must declare its own link preview URL`);
  assert.ok(html.includes(`<link rel="canonical" href="https://findmeadow.com/${platform.slug}/" />`), `${platform.slug} must name its own canonical address`);
  assert.ok(sitemapUrls.includes(`https://findmeadow.com/${platform.slug}/`), `${platform.slug} must appear in the sitemap`);
  if (platform.chatOnly) {
    assert.doesNotMatch(html, /coming[ -]soon/i);
    assert.ok(html.includes("depend on platform configuration"));
    assert.ok(html.includes('class="btn-small-primary" href="https://app.findmeadow.com/sign-up">Try for free'), `${platform.slug} must use the shared free signup action`);
    assert.doesNotMatch(html, />Start posting /, `${platform.slug} must not offer video publishing`);
  }
}
for (const page of PUBLIC_MARKETING_PAGES) {
  const html = await readFile(`dist${page.path}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${page.title}</title>`), `${page.path} must have its own title`);
  assert.ok(html.includes(`content="${page.description}"`), `${page.path} must have its own description`);
  assert.ok(html.includes(page.headline), `${page.path} must render its own heading without JavaScript`);
  assert.ok(html.includes("application/ld+json"), `${page.path} must include FAQ structured data`);
  assert.ok(!html.includes("BridgeApp-"), "Public HTML must not preload the authenticated workspace");
  assert.ok(landingHtml.includes(`href="${page.path}/"`), `${page.path} must be linked from the homepage`);
  assert.ok(html.includes(`<meta property="og:url" content="https://findmeadow.com${page.path}/" />`), `${page.path} must declare its own link preview URL`);
  assert.ok(html.includes(`<link rel="canonical" href="https://findmeadow.com${page.path}/" />`), `${page.path} must name its own canonical address`);
  assert.ok(sitemapUrls.includes(`https://findmeadow.com${page.path}/`), `${page.path} must appear in the sitemap`);
  assert.ok(html.includes('href="/telegram-publishing/"'), `${page.path} must link to Telegram publishing`);
  assert.ok(html.includes("Can I publish to Telegram channels and groups?"), `${page.path} must explain Telegram setup`);
  for (const id of ["twitch", "kick"]) assert.ok(html.includes(`href="/${id}-publishing/"`), `${page.path} must link to ${id}`);
  assert.ok(!html.includes('class="upcoming-platforms"'));
  for (const name of ["Twitch", "Kick"]) assert.ok(html.includes(`aria-label="${name}"`), `${page.path} must include ${name} in its logo sections`);
  if (page.kind === "alternative") {
    const competitor = page.competitor || "Hootsuite";
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${page.path} must have one main heading`);
    assert.ok(html.replace(/<!--.*?-->/gs, "").includes(`Meadow vs. ${competitor}`), `${page.path} must identify the correct competitor`);
    assert.ok(html.includes('id="comparison"'), `${page.path} must render its comparison`);
    assert.ok(html.includes('href="https://app.findmeadow.com/sign-up"'), `${page.path} must offer free signup`);
    for (const row of page.comparison) {
      assert.ok(html.includes(row.feature) && html.includes(row.meadow) && html.includes(row.competitor ?? row.hootsuite), `${page.path} must render both sides of ${row.feature}`);
    }
    assert.equal((html.match(new RegExp(`data-label="${competitor}"`, "g")) || []).length, page.comparison.length, `${page.path} must label every competitor cell on mobile`);
    if (page.disclosure) assert.ok(html.includes(page.disclosure), `${page.path} must render its provider disclosure`);
    for (const source of page.sources) assert.ok(html.includes(`href="${source.href}"`), `${page.path} must link to its sources`);
    assert.ok(!html.includes('"aggregateRating"'), `${page.path} must not invent reviews`);
  }
}
const toolsHubHtml = await readFile("dist/tools/index.html", "utf8");
assert.ok(landingHtml.includes('href="/tools/"'), "Homepage must link to the free tools hub");
assert.ok(landingHtml.includes('href="/tools/tiktok-roast/"'), "Homepage must link to the moved TikTok roast");
assert.ok(toolsHubHtml.includes('href="/tools/tiktok-roast/"'), "Hub must link to the moved TikTok roast");
assert.ok(toolsHubHtml.includes('"url":"https://findmeadow.com/tools/tiktok-roast/"'), "Hub structured data must use the moved TikTok roast URL");
assert.ok(!sitemapUrls.some(url => new URL(url).pathname.startsWith("/free-tools")), "The sitemap must only list the new tool URLs");
for (const page of FREE_TOOL_PAGES) {
  const html = await readFile(`dist${page.path}/index.html`, "utf8");
  assert.ok(html.includes(`<title>${page.title}</title>`), `${page.path} must have its own title`);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${page.path} must have one main heading`);
  assert.ok(html.includes(page.name), `${page.path} must render its own content without JavaScript`);
  assert.ok(html.includes(`<link rel="canonical" href="https://findmeadow.com${page.path}/" />`), `${page.path} must declare its canonical URL`);
  assert.ok(html.includes(`<meta property="og:url" content="https://findmeadow.com${page.path}/" />`), `${page.path} must use its new URL for link previews`);
  assert.doesNotMatch(html, /(?:href|"url"|"item")[=:]"(?:https:\/\/findmeadow\.com)?\/(?:free-tools|tiktok-roast)(?:\/|")/, `${page.path} must not link to retired tool URLs`);
  assert.ok(sitemapUrls.includes(`https://findmeadow.com${page.path}/`), `${page.path} must be in the sitemap`);
  assert.ok(!html.includes('name="robots"'), `${page.path} must be indexable`);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
  assert.ok(schemas.some(schema => schema['@graph']?.some(item => item['@type'] === 'BreadcrumbList')), `${page.path} must contain valid structured data`);
  assert.ok(!html.includes('BridgeApp-'), `${page.path} must not preload the dashboard`);
}
for (const page of [...FREE_TOOLS, ...MEDIA_GUIDES]) assert.ok(toolsHubHtml.includes(`href="${page.path}/"`), `Hub must link to ${page.path}`);
for (const guide of MEDIA_GUIDES) {
  const html = await readFile(`dist${guide.path}/index.html`, "utf8");
  assert.ok(html.includes(`href="/tools/social-media-image-cropper/?preset=${guide.slug}-0"`), `${guide.path} must link to crop presets at the new URL`);
}
const guideHubHtml = await readFile('dist/blog/index.html', 'utf8');
assert.deepEqual([...CONTENT_PATHS].sort(), CONTENT_PAGES.map(page => page.path).sort(), 'Client routes must match the prerendered content catalog');
assert.ok(landingHtml.includes('href="/blog/"'), 'The homepage footer must expose the guide hub');
assert.ok(guideHubHtml.includes('href="/blog/post-to-social-media-with-ai-agents/"'), 'The existing publishing guide must remain discoverable');
for (const page of CONTENT_PAGES) {
  const html = await readFile(`dist${page.path}/index.html`, 'utf8');
  const canonical = `https://findmeadow.com${page.path}/`;
  assert.ok(html.includes(`<title>${page.title}</title>`), `${page.path} must have its own title`);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${page.path} must have one main heading`);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}" />`), `${page.path} must declare its canonical URL`);
  assert.ok(html.includes(`<meta property="og:url" content="${canonical}" />`), `${page.path} must use its canonical URL in previews`);
  assert.ok(sitemapUrls.includes(canonical), `${page.path} must appear in the sitemap`);
  assert.ok(!html.includes('name="robots"'), `${page.path} must be indexable`);
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(match => JSON.parse(match[1])['@graph'] || []);
  assert.ok(schemas.some(schema => schema['@type'] === 'BreadcrumbList'), `${page.path} must have breadcrumbs`);
  if (page === BLOG_HUB) continue;
  for (const section of page.sections) {
    assert.ok(html.includes(`id="${section.id}"`), `${page.path} must render section ${section.id} without JavaScript`);
    assert.ok(html.includes(`href="#${section.id}"`), `${page.path} contents must link to ${section.id}`);
  }
  if (page.slug) {
    assert.ok(guideHubHtml.includes(`href="${page.path}/"`), `Guide hub must link to ${page.path}`);
    const article = schemas.find(schema => schema['@type'] === 'Article');
    assert.equal(article?.dateModified, page.updated, `${page.path} must declare its review date`);
    assert.ok(html.includes('<meta property="og:type" content="article" />'), `${page.path} must use article previews`);
    assert.ok(sitemap.includes(`<loc>${canonical}</loc><lastmod>${page.updated}</lastmod>`), `${page.path} must expose its review date in the sitemap`);
    for (const tool of page.relatedTools || []) assert.ok(sitemapUrls.includes(`https://findmeadow.com${tool.href}`), `${page.path} must link to a real tool: ${tool.href}`);
    for (const source of page.sources) assert.ok(html.includes(source.label.replaceAll('&', '&amp;')), `${page.path} must show its source attribution`);
  }
}
assert.equal(new Set([...FREE_TOOL_PAGES, ...CONTENT_PAGES, ...PUBLIC_MARKETING_PAGES].map(page => page.path)).size, FREE_TOOL_PAGES.length + CONTENT_PAGES.length + PUBLIC_MARKETING_PAGES.length, 'Public catalogs must not compete for the same route');
assert.equal(BLOG_ARTICLES.length, 10, 'Publish all ten reviewed article topics');
console.log("All public pages, free tools, articles, guides, and dashboard routes have deployable HTML entry points.");
