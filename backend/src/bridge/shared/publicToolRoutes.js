// Tool pages use directory-style canonical URLs. Keep saved links, crop presets,
// and campaign parameters working when moving public tools into one namespace.
export function legacyToolsPath(requestUrl) {
  const url = new URL(requestUrl, "https://findmeadow.com");
  if (url.pathname.replace(/\/+$/, "") === "/tiktok-roast") return `/tools/tiktok-roast/${url.search}${url.hash}`;
  if (url.pathname !== "/free-tools" && !url.pathname.startsWith("/free-tools/")) return null;
  const suffix = url.pathname.slice("/free-tools".length).replace(/\/+$/, "");
  return `/tools${suffix}/${url.search}${url.hash}`;
}
