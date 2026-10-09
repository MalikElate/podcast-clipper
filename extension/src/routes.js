const paths = {
  accounts: "/dashboard/connections",
  posts: "/dashboard/posts",
  drafts: "/dashboard/posts/drafts",
  "api-keys": "/dashboard/api-keys",
};

// Shared composer links must target Meadow, not an extension URL.
export function dashboardPath(view) {
  return new URL(paths[view] || "/dashboard", "https://app.findmeadow.com").href;
}
