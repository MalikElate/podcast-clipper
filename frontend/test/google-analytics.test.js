import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_ANALYTICS_ID,
  captureGoogleRequestSuccess,
  cleanSignupCallbackReferrer,
  googleAnalyticsAvailable,
  googleAnalyticsEnabled,
  googleAnalyticsPage,
  initGoogleAnalytics,
  migrateLegacyGoogleAnalyticsPreference,
  queueGoogleSignup,
} from "../src/googleAnalytics.js";
import { analyticsEnabled, setAnalyticsEnabled } from "../src/productAnalytics.js";

function browser(href = "https://findmeadow.com/start/?utm_source=facebook", { enabled = true, initialize = true, referrer = "", preview = false, measurementId = GOOGLE_ANALYTICS_ID, cookies = [], session = new Map(), local = new Map() } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), scripts = [], jar = new Map(), cookieWrites = [];
  for (const entry of cookies) {
    const [name, value] = entry.split("=");
    jar.set(name, value);
  }
  Object.defineProperty(doc, "cookie", {
    configurable: true,
    get: () => [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    set(value) {
      cookieWrites.push(value);
      const [pair] = value.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index), cookieValue = pair.slice(index + 1);
      if (/;\s*Max-Age=0(?:;|$)/i.test(value)) jar.delete(name);
      else jar.set(name, cookieValue);
    },
  });
  win.location = new URL(href);
  win.history = Object.fromEntries(["pushState", "replaceState"].map(method => [method, function (_state, _title, url) {
    if (url) win.location = new URL(url, win.location.href);
    return "navigation-result";
  }]));
  const storage = session;
  win.sessionStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
  win.localStorage = {
    getItem: key => local.get(key) ?? null,
    setItem: (key, value) => local.set(key, String(value)),
    removeItem: key => local.delete(key),
  };
  doc.referrer = referrer;
  doc.head = { appendChild: script => scripts.push(script) };
  doc.createElement = () => ({});
  let interval;
  win.setInterval = callback => { interval = callback; return 1; };
  let allowed = enabled;
  const controller = initialize ? initGoogleAnalytics({ win, doc, enabled: () => allowed, measurementId, preview }) : undefined;
  const commands = () => Array.from(win.dataLayer || [], args => Array.from(args));
  const events = () => commands().filter(args => args[0] === "event");
  return {
    win, doc, jar, cookieWrites, scripts, storage, local, controller, commands, events,
    preference(value) { allowed = value; win.dispatchEvent(new Event("meadow:analytics-preference")); },
    quietPreference(value) { allowed = value; },
    tick() { interval?.(); },
  };
}

function withBrowserGlobals(b, callback, navigator = {}) {
  const names = ["window", "document", "location", "navigator", "localStorage"];
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of [["window", b.win], ["document", b.doc], ["location", b.win.location], ["navigator", navigator], ["localStorage", b.win.localStorage]]) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  try { return callback(); }
  finally {
    // Reset the module's in-memory preference between independent browser
    // fixtures without starting PostHog or changing their saved cookies.
    globalThis.window = undefined;
    globalThis.localStorage = undefined;
    setAnalyticsEnabled(true);
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
      else delete globalThis[name];
    }
  }
}

function changeUsagePreference(enabled) {
  // Exercise the shared preference writer without loading the separate
  // PostHog SDK; restore the preference event for the GA controller.
  const win = globalThis.window;
  globalThis.window = undefined;
  try { setAnalyticsEnabled(enabled); }
  finally { globalThis.window = win; }
  win?.dispatchEvent(new Event("meadow:analytics-preference"));
}

test("GA4 starts automatically on production with no separate Google choice", () => {
  const b = browser(undefined, { initialize: false });
  withBrowserGlobals(b, () => {
    migrateLegacyGoogleAnalyticsPreference();
    assert.equal(googleAnalyticsEnabled(), true);
    initGoogleAnalytics();
    assert.equal(b.scripts.length, 1);
    assert.deepEqual(b.events().map(command => command[1]), ["page_view"]);
    assert.equal(b.cookieWrites.length, 0, "a new visitor does not receive a Google preference cookie");
    changeUsagePreference(false);
    assert.equal(googleAnalyticsEnabled(), false);
    assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
    changeUsagePreference(true);
    assert.equal(googleAnalyticsEnabled(), true);
    assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], false);
    assert.equal(b.scripts.length, 1);
  });
});

test("a legacy Google decline migrates before analytics starts and the shared control can enable it later", () => {
  const b = browser(undefined, { initialize: false, cookies: ["meadow_ga_analytics=off", "_ga=old", "_ga_TEST123=old"] });
  b.storage.set("meadow.ga4.signup.pending", String(Date.now()));
  withBrowserGlobals(b, () => {
    migrateLegacyGoogleAnalyticsPreference();
    assert.equal(analyticsEnabled(), false, "PostHog sees the migrated opt-out before initialization");
    assert.equal(googleAnalyticsEnabled(), false);
    assert.equal(b.jar.get("meadow_analytics"), "off");
    assert.equal(b.local.get("meadow.product-analytics.disabled"), "true");
    assert.equal(b.jar.has("meadow_ga_analytics"), false);
    assert.equal(b.jar.has("_ga"), false);
    assert.equal(b.jar.has("_ga_TEST123"), false);
    assert.equal(b.storage.has("meadow.ga4.signup.pending"), false);
    const savedIndex = b.cookieWrites.findIndex(value => value.startsWith("meadow_analytics=off;") && value.includes("Domain=.findmeadow.com"));
    const retiredIndex = b.cookieWrites.findIndex(value => value.startsWith("meadow_ga_analytics=;"));
    assert.ok(savedIndex >= 0 && retiredIndex > savedIndex);
    assert.equal(b.cookieWrites.filter(value => value.startsWith("meadow_ga_analytics=;")).length, 2);
    initGoogleAnalytics();
    assert.equal(b.scripts.length, 0);
    changeUsagePreference(true);
    assert.equal(googleAnalyticsEnabled(), true);
    assert.equal(b.scripts.length, 1);
  });
  const nextVisit = browser(undefined, { initialize: false, cookies: ["meadow_analytics=off"] });
  withBrowserGlobals(nextVisit, () => {
    initGoogleAnalytics();
    assert.equal(googleAnalyticsEnabled(), false);
    assert.equal(nextVisit.scripts.length, 0);
  });
});

test("retiring legacy Google acceptance never overrides the shared usage opt-out", () => {
  const b = browser(undefined, { initialize: false, cookies: ["meadow_ga_analytics=on", "meadow_analytics=off"] });
  withBrowserGlobals(b, () => {
    migrateLegacyGoogleAnalyticsPreference();
    initGoogleAnalytics();
    assert.equal(b.jar.has("meadow_ga_analytics"), false);
    assert.equal(b.jar.get("meadow_analytics"), "off");
    assert.equal(b.cookieWrites.some(value => value.startsWith("meadow_analytics=on;")), false);
    assert.equal(b.scripts.length, 0);
  });
});

test("a legacy decline arriving from an older tab is migrated without recursive preference events", () => {
  const b = browser(undefined, { initialize: false });
  withBrowserGlobals(b, () => {
    initGoogleAnalytics();
    assert.equal(b.scripts.length, 1);
    let preferenceEvents = 0;
    b.win.addEventListener("meadow:analytics-preference", () => { preferenceEvents++; });
    b.doc.cookie = "meadow_ga_analytics=off; Path=/";
    b.tick();
    assert.equal(preferenceEvents, 1);
    assert.equal(analyticsEnabled(), false);
    assert.equal(b.jar.has("meadow_ga_analytics"), false);
    assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
    const count = b.events().length;
    b.tick();
    assert.equal(preferenceEvents, 1);
    assert.equal(b.events().length, count);
  });
});

test("legacy declines stay off and are retained if shared preference storage is unavailable", () => {
  for (const blocked of ["cookies", "localStorage"]) {
    const b = browser(undefined, { initialize: false, cookies: ["meadow_ga_analytics=off"] });
    if (blocked === "cookies") Object.defineProperty(b.doc, "cookie", { get: () => "meadow_ga_analytics=off", set() {} });
    else b.win.localStorage.setItem = () => { throw new Error("Storage blocked"); };
    withBrowserGlobals(b, () => {
      let preferenceEvents = 0;
      b.win.addEventListener("meadow:analytics-preference", () => { preferenceEvents++; });
      migrateLegacyGoogleAnalyticsPreference();
      assert.equal(analyticsEnabled(), false);
      initGoogleAnalytics();
      b.tick();
      assert.equal(b.scripts.length, 0);
      assert.equal(b.win.gtag, undefined);
      assert.match(b.doc.cookie, /meadow_ga_analytics=off/);
      assert.equal(b.cookieWrites.some(value => value.startsWith("meadow_ga_analytics=;")), false);
      assert.equal(preferenceEvents, 3, "each attempt dispatches once without recursively repeating migration");
    });
  }
});

test("shared cookie, saved local opt-outs, and browser privacy signals block GA4", () => {
  const fixtures = [
    [{ cookies: ["meadow_analytics=off"] }, {}],
    [{ local: new Map([["meadow.product-analytics.disabled", "true"]]) }, {}],
    [{}, { globalPrivacyControl: true }],
    [{}, { doNotTrack: "1" }],
    [{}, { doNotTrack: "yes" }],
  ];
  for (const [options, navigator] of fixtures) {
    const b = browser(undefined, { ...options, initialize: false });
    withBrowserGlobals(b, () => {
      assert.equal(googleAnalyticsEnabled(), false);
      initGoogleAnalytics();
      assert.equal(b.scripts.length, 0);
      assert.equal(queueGoogleSignup(b.win), false);
      captureGoogleRequestSuccess("/projects/project-123/connections/connection-456", "POST", {}, b.win);
      assert.equal(b.events().length, 0);
    }, navigator);
  }
});

test("a newly enabled browser privacy signal stops an already-loaded Google tag", () => {
  for (const signal of [{ globalPrivacyControl: true }, { doNotTrack: "1" }]) {
    const navigator = {};
    const b = browser(undefined, { initialize: false, cookies: ["_ga=client-id"] });
    withBrowserGlobals(b, () => {
      initGoogleAnalytics();
      assert.equal(b.scripts.length, 1);
      const count = b.events().length;
      Object.assign(navigator, signal);
      b.tick();
      assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
      assert.equal(b.jar.has("_ga"), false);
      b.win.history.pushState({}, "", "/pricing");
      assert.equal(b.events().length, count);
    }, navigator);
  }
});

test("no Google script or event loads when usage is off, on previews, or on untrusted hosts", () => {
  const optedOut = browser(undefined, { enabled: false });
  assert.equal(optedOut.scripts.length, 0);
  assert.equal(optedOut.win.gtag, undefined);
  optedOut.preference(true);
  assert.equal(optedOut.scripts.length, 1);
  for (const href of ["http://localhost:5173/start", "https://preview.workers.dev/start", "https://findmeadow.com.example.org/start", "http://findmeadow.com/start"]) {
    assert.equal(browser(href).scripts.length, 0, href);
  }
  assert.equal(browser(undefined, { preview: true }).scripts.length, 0);
  assert.equal(browser(undefined, { measurementId: "invalid" }).scripts.length, 0);
  assert.equal(googleAnalyticsAvailable({ win: optedOut.win, preview: false }), true);
  assert.equal(googleAnalyticsAvailable({ win: optedOut.win, preview: true }), false);
});

test("the one loaded tag disables automatic pageviews and advertising storage", () => {
  const b = browser("https://findmeadow.com/start/?utm_source=facebook&utm_campaign=launch&fbclid=secret", {
    enabled: true,
    referrer: "https://example.com/private/path?utm_source=secret",
  });
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`);
  assert.equal(b.scripts[0].referrerPolicy, "strict-origin");
  assert.deepEqual(b.commands().filter(command => command[0] === "consent"), [
    ["consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" }],
    ["consent", "update", { analytics_storage: "granted" }],
  ]);
  const config = b.commands().find(command => command[0] === "config");
  assert.equal(config[1], GOOGLE_ANALYTICS_ID);
  assert.equal(config[2].send_page_view, false);
  assert.equal(config[2].allow_google_signals, false);
  assert.equal(config[2].allow_ad_personalization_signals, false);
  assert.equal(config[2].page_location, "https://findmeadow.com/start?utm_source=facebook&utm_campaign=launch");
  assert.equal(config[2].page_referrer, "https://example.com/");
  assert.deepEqual(b.events(), [["event", "page_view", {
    send_to: GOOGLE_ANALYTICS_ID,
    page_location: "https://findmeadow.com/start?utm_source=facebook&utm_campaign=launch",
    page_referrer: "https://example.com/",
  }]]);
  assert.equal(initGoogleAnalytics({ win: b.win, doc: b.doc }), b.controller);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.events().length, 1);
});

test("GA4 reports only static, safe URLs and omits private identifiers", () => {
  assert.equal(googleAnalyticsPage("https://findmeadow.com/start/?utm_source=facebook&utm_medium=paid_social&utm_campaign=launch&fbclid=click-id&gclid=ad-id"),
    "https://findmeadow.com/start?utm_source=facebook&utm_medium=paid_social&utm_campaign=launch");
  assert.equal(googleAnalyticsPage("https://app.findmeadow.com/dashboard/connections?utm_campaign=contains%20spaces"),
    "https://app.findmeadow.com/dashboard/connections");
  for (const href of [
    "https://app.findmeadow.com/dashboard/connections?code=secret&state=secret",
    "https://app.findmeadow.com/dashboard/posts/private-post-id",
    "https://findmeadow.com/?email=someone@example.com",
    "https://findmeadow.com/#access_token=secret",
    "https://evil.example/start",
  ]) assert.equal(googleAnalyticsPage(href), "", href);
  const privateReferrer = browser("https://findmeadow.com/start", { enabled: true, referrer: "https://example.com/oauth?code=private" });
  assert.equal(privateReferrer.scripts.length, 1);
  assert.equal(privateReferrer.commands().find(command => command[0] === "config")[2].page_referrer, "https://example.com/");
  assert.doesNotMatch(JSON.stringify(privateReferrer.commands()), /private|code=/);
});

test("navigation sends one safe pageview per page and disables tracking on private routes", () => {
  const b = browser("https://app.findmeadow.com/dashboard", { enabled: true, cookies: ["_ga=client-id", "_ga_TEST=client-id"] });
  assert.equal(b.win.history.pushState({}, "", "/dashboard/connections"), "navigation-result");
  const updatedConfig = b.commands().filter(command => command[0] === "config").at(-1)[2];
  assert.equal(updatedConfig.update, true);
  assert.equal(updatedConfig.send_page_view, false);
  assert.equal(updatedConfig.page_location, "https://app.findmeadow.com/dashboard/connections");
  assert.equal(updatedConfig.page_referrer, "https://app.findmeadow.com/dashboard");
  b.win.history.replaceState({}, "", "/dashboard/connections#socials");
  assert.equal(b.events().length, 2);
  b.win.history.replaceState({}, "", "/dashboard/connections?code=secret&state=secret");
  assert.equal(b.commands().at(-1)[0], "consent");
  assert.equal(b.commands().at(-1)[2].analytics_storage, "denied");
  assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
  assert.equal(b.jar.has("_ga"), false);
  assert.equal(b.jar.has("_ga_TEST"), false);
  assert.equal(b.events().length, 2);
  b.win.history.replaceState({}, "", "/dashboard/connections");
  assert.equal(b.events().length, 3);
  assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], false);
  assert.equal(b.commands().filter(command => command[0] === "consent" && command[1] === "update").at(-1)[2].analytics_storage, "granted");
  b.preference(false);
  b.win.history.pushState({}, "", "/dashboard");
  assert.equal(b.events().length, 3);
  assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
  assert.equal(b.scripts.length, 1);
});

test("signup conversion survives the cross-page redirect and records no account data", () => {
  const b = browser("https://app.findmeadow.com/sign-up/complete?utm_source=facebook");
  withBrowserGlobals(b, () => {
    assert.equal(queueGoogleSignup(b.win), true);
    assert.ok(Number(b.storage.get("meadow.ga4.signup.pending")) > 0);
    b.win.history.replaceState({}, "", "/dashboard?utm_source=facebook");
    assert.equal(b.events().filter(command => command[1] === "sign_up").length, 1);
    b.win.history.replaceState({}, "", "/dashboard");
    assert.equal(b.events().filter(command => command[1] === "sign_up").length, 1);
    assert.equal(b.storage.has("meadow.ga4.signup.pending"), false);
    assert.doesNotMatch(JSON.stringify(b.events()), /email|name|user_id|private/);
  });
  const optedOut = browser("https://app.findmeadow.com/sign-up/complete", { enabled: false, cookies: ["meadow_analytics=off"] });
  withBrowserGlobals(optedOut, () => assert.equal(queueGoogleSignup(optedOut.win), false));
});

test("turning off shared usage analytics discards a signup conversion pending the dashboard redirect", () => {
  const b = browser("https://app.findmeadow.com/sign-up/complete", { initialize: false });
  withBrowserGlobals(b, () => {
    initGoogleAnalytics();
    assert.equal(queueGoogleSignup(b.win), true);
    changeUsagePreference(false);
    assert.equal(b.storage.has("meadow.ga4.signup.pending"), false);
    b.win.history.replaceState({}, "", "/dashboard");
    assert.equal(b.events().filter(command => command[1] === "sign_up").length, 0);
  });
});

test("private signup callback parameters are never sent with a queued conversion", () => {
  const b = browser("https://app.findmeadow.com/sign-up/complete?__clerk_ticket=private");
  withBrowserGlobals(b, () => assert.equal(queueGoogleSignup(b.win), true));
  assert.equal(b.scripts.length, 0);
  b.win.history.replaceState({}, "", "/dashboard");
  assert.equal(b.events().filter(command => command[1] === "sign_up").length, 1);
  assert.doesNotMatch(JSON.stringify(b.events()), /private|__clerk_ticket/);
});

test("signup callback is scrubbed before a new dashboard document loads", () => {
  const session = new Map();
  const first = browser("https://app.findmeadow.com/sign-up/complete?__clerk_ticket=private", {
    enabled: true, referrer: "https://accounts.clerk.com/oauth?state=private",
    session,
  });
  withBrowserGlobals(first, () => {
    assert.equal(queueGoogleSignup(first.win), true);
    assert.equal(cleanSignupCallbackReferrer(first.win), true);
  });
  assert.equal(first.win.location.href, "https://app.findmeadow.com/sign-up/complete");
  assert.doesNotMatch(JSON.stringify(first.commands()), /private|__clerk_ticket|state=/);
  const second = browser("https://app.findmeadow.com/dashboard", {
    enabled: true, referrer: first.win.location.href,
    session,
  });
  assert.equal(second.scripts.length, 1);
  assert.equal(second.events().filter(command => command[1] === "sign_up").length, 1);
  assert.doesNotMatch(JSON.stringify(second.commands()), /private|__clerk_ticket/);
});

test("OAuth connection tracking resumes only after callback URL cleanup", () => {
  const b = browser("https://app.findmeadow.com/dashboard/connections?connection=private", {
    enabled: true, referrer: "https://accounts.google.com/oauth?code=private&state=private",
  });
  assert.equal(b.scripts.length, 0);
  b.win.history.replaceState({}, "", "/dashboard/connections");
  assert.equal(b.scripts.length, 1);
  withBrowserGlobals(b, () => captureGoogleRequestSuccess("/projects/project-123/connections/connection-456", "POST", {}, b.win));
  assert.equal(b.events().filter(command => command[1] === "social_account_connected").length, 1);
  assert.doesNotMatch(JSON.stringify(b.commands()), /private|code=|state=|project-123|connection-456/);
});

test("an already-open tab polls a shared usage opt-out from another tab", () => {
  const b = browser("https://app.findmeadow.com/dashboard", {
    initialize: false, cookies: ["_ga=client-id"],
  });
  withBrowserGlobals(b, () => {
    initGoogleAnalytics();
    b.doc.cookie = "meadow_analytics=off; Path=/";
    b.tick();
    assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
    assert.equal(b.jar.has("_ga"), false);
    const eventCount = b.events().length;
    b.win.history.pushState({}, "", "/dashboard/connections");
    assert.equal(b.events().length, eventCount);
  });
});

test("effective usage-analytics opt-out discards a pending signup conversion", () => {
  const b = browser("https://app.findmeadow.com/sign-up/complete");
  withBrowserGlobals(b, () => {
    assert.equal(queueGoogleSignup(b.win), true);
    b.preference(false);
    assert.equal(b.storage.has("meadow.ga4.signup.pending"), false);
  });
});

test("successful API action mapping sends only selected, non-identifying conversions", () => {
  const b = browser("https://app.findmeadow.com/dashboard/posts/scheduled");
  withBrowserGlobals(b, () => {
    captureGoogleRequestSuccess("/projects/private-workspace/connections/private-account", "POST", {}, b.win);
    captureGoogleRequestSuccess("/projects/private-workspace/posts", "POST", {
      items: [{ caption: "private caption", accountIds: ["private-account"], schedule: { mode: "scheduled", localDateTime: "2026-10-01T09:00" } }],
    }, b.win);
    captureGoogleRequestSuccess("/projects/private-workspace/posts", "POST", { items: [{ schedule: { mode: "now" } }] }, b.win);
    captureGoogleRequestSuccess("/projects/private-workspace/posts/drafts", "POST", { items: [{ schedule: { mode: "scheduled" } }] }, b.win);
    captureGoogleRequestSuccess("/billing/checkout", "POST", {}, b.win);
    assert.deepEqual(b.events().map(command => command[1]), ["page_view", "social_account_connected", "post_scheduled"]);
    assert.doesNotMatch(JSON.stringify(b.events()), /private|caption|accountIds|localDateTime/);
  });
});
