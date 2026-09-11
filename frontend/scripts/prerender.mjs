import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "vite";

// Build public HTML once; no auth, API calls, or container startup at request time.
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { render } = await server.ssrLoadModule("/src/prerender.jsx");
  const template = await readFile("dist/index.html", "utf8");
  for (const [path, kind] of [["", null], ["404", "not-found"], ["pricing", "pricing"], ["terms", "terms"], ["terms-of-service", "terms"], ["privacy", "privacy"], ["privacy-policy", "privacy"]]) {
    const html = template.replace('<div id="root"></div>', () => `<div id="root">${render(kind)}</div>`)
      .replace(/<title>.*?<\/title>/, `<title>${kind === "terms" ? "Terms of Service · Meadow" : kind === "privacy" ? "Privacy Policy · Meadow" : kind === "pricing" ? "Pricing · Meadow" : kind === "not-found" ? "Page not found · Meadow" : "Meadow — Publish across every social account"}</title>`);
    const directory = path ? `dist/${path}` : "dist";
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/index.html`, html);
  }
} finally {
  await server.close();
}
