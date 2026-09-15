const MARKETING_HOSTS = new Set(["findmeadow.com", "www.findmeadow.com"]);
const APP_ORIGIN = "https://app.findmeadow.com";

export function appDomainRedirect(requestUrl) {
  const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  const dashboardPath = url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/");
  if (!MARKETING_HOSTS.has(url.hostname.toLowerCase()) || !dashboardPath) return null;
  return new URL(`${url.pathname}${url.search}${url.hash}`, APP_ORIGIN).href;
}
