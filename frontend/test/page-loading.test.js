import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const text = html => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("Accounts and Analytics distinguish pending reads from empty results", async t => {
  const cacheDir = await mkdtemp(join(tmpdir(), "meadow-page-loading-"));
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, cacheDir, plugins: [react()],
    server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  const previousWindow = globalThis.window;
  try {
    const { default: Accounts } = await server.ssrLoadModule("/src/bridge/Accounts.jsx");
    const { default: Analytics } = await server.ssrLoadModule("/src/bridge/Analytics.jsx");
    const props = {
      project: { id: "studio", name: "Studio", timeZone: "UTC" }, accounts: [],
      catalog: [{ id: "instagram", name: "Instagram", accountType: "Profiles", configured: true, formats: ["image", "video"] }],
      config: { connectionsReady: true, localPreview: true }, onChanged() {}, clearConnection() {},
    };

    await t.test("unknown accounts show a loading status instead of an empty board", () => {
      const html = renderToStaticMarkup(createElement(Accounts, { ...props, accountsReady: false }));
      assert.match(html, /role="status"/);
      assert.match(text(html), /Loading accounts/);
      assert.doesNotMatch(text(html), /0 connected|No profiles connected|Connect Instagram/i);
    });

    await t.test("confirmed empty accounts show the actual connection board", () => {
      const html = renderToStaticMarkup(createElement(Accounts, { ...props, accountsReady: true }));
      assert.match(text(html), /0 connected/);
      assert.match(text(html), /No profiles connected/i);
      assert.doesNotMatch(text(html), /Loading accounts/);
    });

    await t.test("failed account reads do not claim an empty list or remain pending", () => {
      const html = renderToStaticMarkup(createElement(Accounts, { ...props, accountsReady: false, accountsError: "Request failed" }));
      assert.equal(html, "");
    });

    await t.test("unknown analytics announce loading without claiming zero posts or missing metrics", () => {
      const html = renderToStaticMarkup(createElement(Analytics, props));
      assert.match(html, /role="status"/);
      assert.match(text(html), /Loading analytics/);
      assert.doesNotMatch(text(html), /Lifetime totals|No metrics synced|No published posts|Connect a social account/);
    });

    await t.test("both pages show loading while the workspace configuration is still pending", async () => {
      const { default: BridgeApp } = await server.ssrLoadModule("/src/bridge/BridgeApp.jsx");
      const { AuthContext } = await server.ssrLoadModule("/src/AuthContext.jsx");
      for (const [path, label] of [["/dashboard/connections", "Loading accounts"], ["/dashboard/analytics", "Loading analytics"]]) {
        globalThis.window = { location: { pathname: path, search: "" } };
        const html = renderToStaticMarkup(createElement(AuthContext.Provider,
          { value: { user: { id: "test-user", email: "preview@example.com" }, signOut() {} } }, createElement(BridgeApp)));
        assert.match(html, /role="status"/);
        assert.ok(text(html).includes(label));
      }
    });
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
