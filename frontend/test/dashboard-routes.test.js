import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_PATHS, dashboardPath, dashboardView, isDashboardPath } from "../src/bridge/dashboardRoutes.js";

test("every dashboard view has a unique readable path", () => {
  const paths = Object.values(DASHBOARD_PATHS);
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(dashboardPath("compose"), "/dashboard");
  assert.equal(dashboardPath("accounts"), "/dashboard/connections");
  assert.equal(dashboardPath("api-keys"), "/dashboard/api-keys");
  assert.ok(paths.every(path => path === "/dashboard" || path.startsWith("/dashboard/")));
});

test("dashboard paths and legacy OAuth links resolve to the correct view", () => {
  for (const [view, path] of Object.entries(DASHBOARD_PATHS)) {
    assert.equal(dashboardView(`${path}/`), view);
  }
  assert.equal(dashboardView("/", "?view=accounts&connection=example"), "accounts");
  assert.equal(dashboardView("/dashboard/unknown"), "compose");
  assert.equal(isDashboardPath("/dashboard/posts/scheduled"), true);
  assert.equal(isDashboardPath("/privacy"), false);
});
