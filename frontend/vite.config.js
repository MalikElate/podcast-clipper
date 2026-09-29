import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { clerkScriptUrls } from "./src/clerkScripts.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
  plugins: [react(), {
    name: "meadow-site-tags",
    transformIndexHtml() {
      const tags = [];
      for (const [name, value] of [["google-site-verification", env.VITE_GOOGLE_SITE_VERIFICATION], ["msvalidate.01", env.VITE_BING_SITE_VERIFICATION]]) {
        if (value?.trim()) tags.push({ tag: "meta", attrs: { name, content: value.trim() }, injectTo: "head" });
      }
      // Start Clerk's scripts with the HTML so sign-in state is ready as soon as the app bundle runs.
      // crossorigin matches the anonymous-mode script tags Clerk inserts, so the preloads are reused.
      const clerkScripts = env.VITE_BRIDGE_LOCAL_PREVIEW === "true" ? null : clerkScriptUrls(env.VITE_CLERK_PUBLISHABLE_KEY);
      if (clerkScripts) {
        for (const href of [clerkScripts.clerkJS, clerkScripts.clerkUI]) tags.push({ tag: "link", attrs: { rel: "preload", as: "script", href, crossorigin: "anonymous" }, injectTo: "head" });
      }

      return tags;
    },
  }],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/media": "http://localhost:8787",
      "/oauth": "http://localhost:8787",
    },
  },
};
});
