const MARKETING_HOSTS = new Set(["findmeadow.com", "www.findmeadow.com"]);
const APP_ORIGIN = "https://app.findmeadow.com";

export function appDomainRedirect(requestUrl) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const dashboardPath = url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/");
  if (!MARKETING_HOSTS.has(url.hostname.toLowerCase()) || !dashboardPath) return null;
  return new URL(`${url.pathname}${url.search}${url.hash}`, APP_ORIGIN).href;
}

// Dashboard shells are built as /dashboard/…/index.html, which the asset layer only serves at the
// trailing-slash address after a redirect. Fetching that address directly saves opening the app a round trip.
export function dashboardShellUrl(requestUrl) {
  const url = new URL(requestUrl);
  const dashboardPath = url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/");
  if (!dashboardPath || url.pathname.endsWith("/")) return null;
  url.pathname += "/";
  return url.href;
}
