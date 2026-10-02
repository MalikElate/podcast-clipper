export const POSTHOG_PROXY_PATH = "/sprout";
const API_ORIGIN = "https://us.i.posthog.com";
const ASSET_ORIGIN = "https://us-assets.i.posthog.com";
const FORWARDED_HEADERS = ["accept", "accept-encoding", "content-type", "content-encoding", "user-agent", "if-none-match", "if-modified-since"];

export function isPosthogProxyPath(pathname) {
  return pathname === POSTHOG_PROXY_PATH || pathname.startsWith(`${POSTHOG_PROXY_PATH}/`);
}

const unavailable = () => new Response("Analytics temporarily unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });

export async function handlePosthogProxy(request, fetcher = fetch) {
  const url = new URL(request.url);
  if (!isPosthogProxyPath(url.pathname)) return new Response("Not found", { status: 404 });
  if (!["GET", "HEAD", "POST", "OPTIONS"].includes(request.method)) {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, POST, OPTIONS", "Cache-Control": "no-store" } });
  }
  const path = url.pathname.slice(POSTHOG_PROXY_PATH.length) || "/";
  const asset = path.startsWith("/static/") || path.startsWith("/array/");
  const target = new URL(asset ? ASSET_ORIGIN : API_ORIGIN);
  // Assign components separately so a path beginning // cannot change the host.
  target.pathname = path;
  target.search = url.search;
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  // Same-origin requests may include Clerk cookies and sensitive page referrers.
  // Only transport headers above and Cloudflare's trusted client IP go upstream.
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Forwarded-For", ip);
  try {
    const response = await fetcher(new Request(target, {
      method: request.method, headers, redirect: "manual",
      body: ["GET", "HEAD"].includes(request.method) ? null : await request.arrayBuffer(),
    }));
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("set-cookie");
    if (!asset || (!response.ok && response.status !== 304) || !["GET", "HEAD"].includes(request.method)) responseHeaders.set("Cache-Control", "no-store");
    if (response.status >= 300 && response.status < 400 && responseHeaders.has("location")) {
      const location = new URL(responseHeaders.get("location"), target);
      if (![API_ORIGIN, ASSET_ORIGIN].includes(location.origin)) return unavailable();
      responseHeaders.set("location", `${POSTHOG_PROXY_PATH}${location.pathname}${location.search}`);
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return unavailable();
  }
}
