import assert from "node:assert/strict";
import test from "node:test";
import { analyticsKey, analyticsPath, analyticsEnabled, browserPrivacyOptOut, cleanAnalyticsUrl, sanitizeAnalyticsEvent, posthogOptions, productEventForRequest, setAnalyticsEnabled } from "../src/productAnalytics.js";
import { BridgeApi } from "../src/bridge/BridgeApi.js";

test("production tracking excludes previews and supports a kill switch", () => {
  assert.match(analyticsKey("app.findmeadow.com"), /^phc_/);
  for (const host of ["localhost", "127.0.0.1", "preview.workers.dev", "findmeadow.com.example.com"]) assert.equal(analyticsKey(host, { VITE_POSTHOG_KEY: "phc_test" }), "");
  assert.equal(analyticsKey("findmeadow.com", { VITE_POSTHOG_ENABLED: "false" }), "");
  assert.equal(analyticsKey("findmeadow.com", { VITE_BRIDGE_LOCAL_PREVIEW: "true" }), "");
});

test("callback secrets, post IDs, raw content, and old person properties cannot reach PostHog", () => {
  const result = sanitizeAnalyticsEvent({ event: "$pageview", uuid: "event-uuid", $set: { email: "private@example.com" }, properties: {
    token: "public-token", distinct_id: "user_private", $current_url: "https://app.findmeadow.com/dashboard/connections?code=secret&state=private#token",
    $session_entry_url: "https://findmeadow.com/?email=private@example.com", $referrer: "https://example.com/private/path?token=secret",
    $set: { email: "private@example.com" }, $initial_current_url: "https://findmeadow.com/?private=yes",
    $title: "A private post title", $elements: [{ text: "private caption" }], email: "private@example.com", caption: "private caption", access_token: "secret",
  } });
  assert.equal(result.properties.$current_url, "https://app.findmeadow.com/dashboard/connections");
  assert.equal(result.properties.$session_entry_url, "https://findmeadow.com/");
  assert.equal(result.properties.$referrer, "https://example.com/");
  assert.equal(result.properties.distinct_id, "$posthog_cookieless");
  assert.equal(result.properties.$cookieless_mode, true);
  assert.equal(result.properties.$process_person_profile, false);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|caption|\$set|\$title/);
  assert.equal(analyticsPath("/dashboard/posts/a-private-id"), "/dashboard/other");
  assert.equal(analyticsPath("/dashboard/posts/scheduled/"), "/dashboard/posts/scheduled");
  assert.equal(analyticsPath("/linkedin-scheduling"), "/other");
  assert.equal(cleanAnalyticsUrl("https://attacker.example/private"), undefined);
  assert.equal(cleanAnalyticsUrl("https://name:secret@findmeadow.com/privacy?secret=yes"), "https://findmeadow.com/privacy");
  for (const event of ["$identify", "$snapshot", "$autocapture", "$exception"]) assert.equal(sanitizeAnalyticsEvent({ event, properties: {} }), null);
});

test("cookie-free initialization disables recordings and content capture", () => {
  const options = posthogOptions();
  assert.equal(options.cookieless_mode, "always");
  assert.equal(options.person_profiles, "never");
  assert.equal(options.capture_pageview, "history_change");
  assert.equal(options.disable_session_recording, true);
  assert.equal(options.autocapture, false);
  assert.equal(options.disable_external_dependency_loading, true);
  assert.equal(options.capture_exceptions, false);
});

test("privacy signals and user opt-out prevent all events even if storage fails", () => {
  for (const nav of [{ globalPrivacyControl: true }, { doNotTrack: "1" }, { doNotTrack: "yes" }]) assert.equal(browserPrivacyOptOut(nav), true);
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  try {
    globalThis.window = { dispatchEvent() {} };
    globalThis.localStorage = { setItem() { throw new Error("Storage blocked"); } };
    setAnalyticsEnabled(false);
    assert.equal(analyticsEnabled(), false);
    assert.equal(sanitizeAnalyticsEvent({ event: "$pageview", properties: {} }), null);
    // Restore the preference without starting a browser SDK in this Node test.
    globalThis.window = undefined;
    setAnalyticsEnabled(true);
    assert.equal(analyticsEnabled(), true);
  } finally { globalThis.window = oldWindow; globalThis.localStorage = oldStorage; }
});

test("API analytics records successful actions once after auth refresh, never failures or previews", async () => {
  let attempts = 0;
  const tracked = [];
  const api = new BridgeApi({ getToken: async () => "token", track: (path, method) => tracked.push(productEventForRequest(path, method)), fetcher: async () => ++attempts === 1 ? Response.json({ code: "authentication_required" }, { status: 401 }) : Response.json({ saved: true }) });
  await api.project("private-project", "/posts/drafts", { method: "POST", body: { caption: "Private text" } });
  assert.equal(attempts, 2);
  assert.deepEqual(tracked, ["meadow_draft_saved"]);
  api.fetcher = async () => Response.json({ error: "Failed" }, { status: 500 });
  await assert.rejects(api.project("private-project", "/posts", { method: "POST" }));
  assert.equal(tracked.length, 1);
  api.fetcher = async () => Response.json({ saved: true });
  api.preview = true;
  await api.project("private-project", "/posts", { method: "POST" });
  assert.equal(tracked.length, 1);
  api.preview = false;
  api.track = () => { throw new Error("Analytics unavailable"); };
  assert.deepEqual(await api.project("private-project", "/posts", { method: "POST" }), { saved: true });
});

test("product events report accepted operations, not published posts or completed payments", () => {
  assert.equal(productEventForRequest("/projects/123/posts", "POST"), "meadow_post_submitted");
  assert.equal(productEventForRequest("/billing/checkout", "POST"), "meadow_checkout_started");
  assert.equal(productEventForRequest("/projects/123/connections/abc", "POST"), "meadow_account_connected");
  assert.equal(productEventForRequest("/projects/123/posts/preview", "POST"), undefined);
  assert.equal(productEventForRequest("/projects/123/posts", "GET"), undefined);
  assert.equal(productEventForRequest("/projects/123/media/uploads", "POST"), undefined);
});
