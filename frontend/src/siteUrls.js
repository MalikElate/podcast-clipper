export const MARKETING_ORIGIN = "https://findmeadow.com";
export const APP_ORIGIN = "https://app.findmeadow.com";

const MARKETING_HOSTS = new Set(["findmeadow.com", "www.findmeadow.com"]);
const CAMPAIGN_PARAMETERS = ["fbclid", "gclid", "msclkid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"];

function runtimeLocation(locationLike) {
  return locationLike || globalThis.location || null;
}

export function siteSurface(locationLike) {
  const hostname = runtimeLocation(locationLike)?.hostname?.toLowerCase();
  if (hostname === "app.findmeadow.com") return "app";
  if (MARKETING_HOSTS.has(hostname)) return "marketing";
  return "integrated";
}

export function isLocalMarketingPreview(locationLike, isDevelopment) {
  const location = runtimeLocation(locationLike);
  return Boolean(isDevelopment)
    && siteSurface(location) === "integrated"
    && new URLSearchParams(location?.search || "").get("surface") === "marketing";
}

function localOrigin(locationLike) {
  const location = runtimeLocation(locationLike);
  return location?.origin && location.origin !== "null" ? location.origin : null;
}

/** The same-origin page to return to after signing in, or null. Clerk sends
 * an absolute `redirect_url`, such as the OAuth consent page an MCP client is
 * waiting on. Other origins are ignored so sign-in cannot become an open
 * redirect, and sign-in or sign-up pages are ignored so it cannot loop. */
export function safeReturnPath(value, locationLike) {
  const origin = localOrigin(locationLike);
  if (typeof value !== "string" || !value || !origin) return null;
  let url;
  try { url = new URL(value, origin); } catch { return null; }
  if (url.origin !== origin || /^\/sign-(in|up)(\/|$)/.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function appHref(path = "/dashboard", locationLike) {
  const origin = siteSurface(locationLike) === "integrated" ? localOrigin(locationLike) || APP_ORIGIN : APP_ORIGIN;
  return new URL(path, `${origin}/`).href;
}

export function signupHref(locationLike) {
  const location = runtimeLocation(locationLike);
  const url = new URL(appHref("/sign-up", locationLike));
  const source = new URLSearchParams(location?.search || "");
  for (const name of CAMPAIGN_PARAMETERS) {
    const value = source.get(name);
    if (value) url.searchParams.set(name, value.slice(0, 500));
  }
  return url.href;
}

// Public pages are built as <path>/index.html, which the asset layer serves at the
// trailing-slash address and redirects to from the bare one. Linking without the
// slash costs every visitor and crawler a redirect, so the links carry it instead.
// A fragment, a query or an app route is left exactly as written.
export function marketingPath(path = "/") {
  if (typeof path !== "string" || !path.startsWith("/")) return path;
  if (path.endsWith("/") || path.includes("#") || path.includes("?")) return path;
  return `${path}/`;
}

export function marketingHref(path = "/", locationLike) {
  const origin = siteSurface(locationLike) === "integrated" ? localOrigin(locationLike) || MARKETING_ORIGIN : MARKETING_ORIGIN;
  return new URL(marketingPath(path), `${origin}/`).href;
}
