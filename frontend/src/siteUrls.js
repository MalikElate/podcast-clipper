export const MARKETING_ORIGIN = "https://findmeadow.com";
export const APP_ORIGIN = "https://app.findmeadow.com";

const MARKETING_HOSTS = new Set(["findmeadow.com", "www.findmeadow.com"]);

function runtimeLocation(locationLike) {
  return locationLike || globalThis.location || null;
}

export function siteSurface(locationLike) {
  const hostname = runtimeLocation(locationLike)?.hostname?.toLowerCase();
  if (hostname === "app.findmeadow.com") return "app";
  if (MARKETING_HOSTS.has(hostname)) return "marketing";
  return "integrated";
}

function localOrigin(locationLike) {
  const location = runtimeLocation(locationLike);
  return location?.origin && location.origin !== "null" ? location.origin : null;
}

export function appHref(path = "/dashboard", locationLike) {
  const origin = siteSurface(locationLike) === "integrated" ? localOrigin(locationLike) || APP_ORIGIN : APP_ORIGIN;
  return new URL(path, `${origin}/`).href;
}

export function marketingHref(path = "/", locationLike) {
  const origin = siteSurface(locationLike) === "integrated" ? localOrigin(locationLike) || MARKETING_ORIGIN : MARKETING_ORIGIN;
  return new URL(path, `${origin}/`).href;
}
