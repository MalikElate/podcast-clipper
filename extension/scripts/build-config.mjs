import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "../../frontend/node_modules/@vitejs/plugin-react/dist/index.js";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const unpacked = path.join(root, "dist/findmeadow");
export function buildConfig() {
  return {
    configFile: false,
    root,
    base: "./",
    publicDir: false,
    plugins: [
      { name: "extension-api-and-routes", enforce: "pre", resolveId(id, importer) {
        if (id.endsWith("/BridgeApi.js")) return path.join(root, "src/api.js");
        if (id.endsWith("/dashboardRoutes.js")) return path.join(root, "src/routes.js");
        if (id.endsWith("/composerSubmission.js") && importer !== path.join(root, "src/submission.js")) return path.join(root, "src/submission.js");
      } },
      react(),
      { name: "cross-posting-only", generateBundle(_options, bundle) {
        const excluded = /\/(?:BridgeApp|AccountDropper|ConnectAgent|productAnalytics|googleAnalytics|metaPixel|authToken)\.(?:jsx?|tsx?)$|\/node_modules\/(?:@clerk|posthog-js)\//;
        for (const entry of Object.values(bundle)) {
          if (entry.type !== "chunk") continue;
          for (const id of Object.keys(entry.modules)) {
            if (excluded.test(id)) throw new Error("Extension unexpectedly includes a dashboard/auth/analytics module: " + id);
          }
        }
      } },
    ],
    resolve: { alias: {
      "/meadow-flower-mark-v2.webp": path.join(root, "../frontend/public/meadow-flower-mark-v2.webp"),
      "react-dom": path.join(root, "../frontend/node_modules/react-dom"),
      "react": path.join(root, "../frontend/node_modules/react"),
    } },
    build: {
      outDir: unpacked,
      emptyOutDir: true,
      target: "chrome120",
      sourcemap: false,
      rollupOptions: { input: path.join(root, "app.html") },
    },
  };
}
