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

export function marketingHref(path = "/", locationLike) {
  const origin = siteSurface(locationLike) === "integrated" ? localOrigin(locationLike) || MARKETING_ORIGIN : MARKETING_ORIGIN;
  return new URL(path, `${origin}/`).href;
}
