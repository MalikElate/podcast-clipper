import assert from "node:assert/strict";
import test from "node:test";
import { DASHBOARD_PATHS, dashboardPath, dashboardSearch, dashboardView, isDashboardPath } from "../src/bridge/dashboardRoutes.js";

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

test("a draft compose link survives refresh without leaking unrelated return parameters", () => {
  const draftId = "8efc8408-75d7-476a-bbcb-d846bf5019d2";
  const search = `?draft=${draftId}&connection=private&checkout=success&session_id=cs_private`;
  assert.equal(dashboardView("/dashboard/", search), "compose");
  assert.equal(dashboardPath("compose") + dashboardSearch("compose", search), `/dashboard?draft=${draftId}`);
  assert.equal(dashboardSearch("compose", "?draft="), "");
});

test("draft identity is scoped to the composer while billing keeps only billing returns", () => {
  const search = "?draft=draft-private&checkout=success&session_id=cs_live_123&portal_return=1";
  assert.equal(dashboardSearch("drafts", search), "");
  assert.equal(dashboardSearch("posts", search), "");
  assert.equal(dashboardSearch("billing", search), "?checkout=success&session_id=cs_live_123&portal_return=1");
});
