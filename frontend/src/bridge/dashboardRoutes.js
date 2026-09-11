export const DASHBOARD_PATHS = Object.freeze({
  compose: "/dashboard",
  calendar: "/dashboard/posts/calendar",
  posts: "/dashboard/posts",
  scheduled: "/dashboard/posts/scheduled",
  posted: "/dashboard/posts/posted",
  drafts: "/dashboard/posts/drafts",
  failed: "/dashboard/posts/failed",
  analytics: "/dashboard/analytics",
  clips: "/dashboard/clipping-studio",
  accounts: "/dashboard/connections",
  settings: "/dashboard/settings",
  "api-keys": "/dashboard/api-keys",
  billing: "/dashboard/billing",
});

const VIEW_BY_PATH = new Map(Object.entries(DASHBOARD_PATHS).map(([view, path]) => [path, view]));

function cleanPath(pathname = "") {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path;
}

export function dashboardPath(view) {
  return DASHBOARD_PATHS[view] || DASHBOARD_PATHS.compose;
}

export function dashboardView(pathname, search = "") {
  const legacyView = new URLSearchParams(search).get("view");
  if (legacyView && DASHBOARD_PATHS[legacyView]) return legacyView;
  return VIEW_BY_PATH.get(cleanPath(pathname)) || "compose";
}

export function isDashboardPath(pathname) {
  const path = cleanPath(pathname);
  return path === "/dashboard" || path.startsWith("/dashboard/");
}
