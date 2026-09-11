import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const ga = env.VITE_GOOGLE_ANALYTICS_ID?.trim();
  return {
  plugins: [react(), {
    name: "meadow-site-tags",
    transformIndexHtml() {
      const tags = [];
      for (const [name, value] of [["google-site-verification", env.VITE_GOOGLE_SITE_VERIFICATION], ["msvalidate.01", env.VITE_BING_SITE_VERIFICATION]]) {
        if (value?.trim()) tags.push({ tag: "meta", attrs: { name, content: value.trim() }, injectTo: "head" });
      }
      if (/^G-[A-Z0-9]+$/i.test(ga || "")) {
        tags.push({ tag: "script", attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ga}` }, injectTo: "head" });
        tags.push({ tag: "script", children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}');`, injectTo: "head" });
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
      "/downloads": "http://localhost:8787",
    },
  },
};
});
