import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "vite";
import { DASHBOARD_PATHS } from "../src/bridge/dashboardRoutes.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";
import { GENERAL_PAGES } from "../src/marketing/generalPages.js";
import { FREE_TOOL_PAGES } from "../src/tools/freeToolsCatalog.js";

// Build public HTML once; no auth, API calls, or container startup at request time.
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
const pages = [
  ...FREE_TOOL_PAGES.map(page => ({ path: page.path.slice(1), kind: "free-tool", platformId: page.path, title: page.title, description: page.description })),
  { path: "tiktok-roast", kind: "tiktok-roast", title: "TikTok Niche or Not — Free Caption Review · Meadow", description: "Review public TikTok captions, get practical fixes, then use Meadow to schedule and cross-post what you create next." },
  { path: "", kind: null, title: "Meadow — Plan once, publish everywhere", description: "Connect your channels, create once, and schedule the right version of every post from one Meadow workspace." },
  { path: "404", kind: "not-found", title: "Page not found · Meadow", description: "The page could not be found. Head back to Meadow to keep your publishing work in one place." },
  { path: "pricing", kind: "pricing", title: "Pricing · Meadow", description: "Compare Meadow plans for creating, scheduling, and publishing across your social channels." },
  { path: "terms", kind: "terms", title: "Terms of Service · Meadow", description: "Read the terms for using Meadow's social publishing and scheduling service." },
  { path: "terms-of-service", kind: "terms", title: "Terms of Service · Meadow", description: "Read the terms for using Meadow's social publishing and scheduling service." },
  { path: "privacy", kind: "privacy", title: "Privacy Policy · Meadow", description: "Learn how Meadow handles account, content, and connected social-platform information." },
  { path: "privacy-policy", kind: "privacy", title: "Privacy Policy · Meadow", description: "Learn how Meadow handles account, content, and connected social-platform information." },
  ...PLATFORM_USE_CASES.map((platform) => ({
    path: platform.slug,
    kind: "platform",
    platformId: platform.id,
    title: platform.title,
    description: platform.description,
  })),
  ...GENERAL_PAGES.map((page) => ({
    path: page.path.slice(1),
    kind: "marketing",
    platformId: page.path,
    title: page.title,
    description: page.description,
  })),
];

const SITE_ORIGIN = "https://findmeadow.com";

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

// Assets serve /pricing/index.html at /pricing/, so shared links resolve without a redirect.
function canonicalUrl(path) {
  if (!path) return `${SITE_ORIGIN}/`;
  return path === "404" ? `${SITE_ORIGIN}/404` : `${SITE_ORIGIN}/${path}/`;
}

try {
  const { render } = await server.ssrLoadModule("/src/prerender.jsx");
  const template = await readFile("dist/index.html", "utf8");
  for (const page of pages) {
    const description = escapeAttribute(page.description);
    const html = template.replace('<div id="root"></div>', () => `<div id="root">${render(page.kind, page.platformId)}</div>`)
      .replace(/<title>.*?<\/title>/, () => `<title>${page.title}</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/>/, () => `<meta name="description" content="${description}" />`)
      .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, () => `<meta property="og:title" content="${escapeAttribute(page.title)}" />`)
      .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, () => `<meta property="og:description" content="${description}" />`)
      .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, () => `<meta property="og:url" content="${canonicalUrl(page.path)}" />`);
    const directory = page.path && page.path !== "404" ? `dist/${page.path}` : "dist";
    await mkdir(directory, { recursive: true });
    await writeFile(page.path === "404" ? "dist/404.html" : `${directory}/index.html`, html);
  }
  const dashboardHtml = template.replace(/<title>.*?<\/title>/, "<title>Dashboard · Meadow</title>");
  for (const route of new Set(Object.values(DASHBOARD_PATHS))) {
    const directory = `dist${route}`;
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/index.html`, dashboardHtml);
  }
} finally {
  await server.close();
}
