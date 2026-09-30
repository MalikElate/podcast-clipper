import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_ANALYTICS_ID,
  captureGoogleRequestSuccess,
  cleanSignupCallbackReferrer,
  googleAnalyticsAvailable,
  googleAnalyticsChoice,
  googleAnalyticsEnabled,
  googleAnalyticsPage,
  initGoogleAnalytics,
  queueGoogleSignup,
  setGoogleAnalyticsConsent,
} from "../src/googleAnalytics.js";
import { setAnalyticsEnabled } from "../src/productAnalytics.js";

function browser(href = "https://findmeadow.com/start/?utm_source=facebook", { enabled = false, referrer = "", preview = false, measurementId = GOOGLE_ANALYTICS_ID, cookies = [], session = new Map() } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), scripts = [], jar = new Map();
  for (const entry of cookies) {
    const [name, value] = entry.split("=");
    jar.set(name, value);
  }
  Object.defineProperty(doc, "cookie", {
    get: () => [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    set(value) {
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
  doc.referrer = referrer;
  doc.head = { appendChild: script => scripts.push(script) };
  doc.createElement = () => ({});
  let interval;
  win.setInterval = callback => { interval = callback; return 1; };
  let allowed = enabled;
  const controller = initGoogleAnalytics({ win, doc, enabled: () => allowed, measurementId, preview });
  const commands = () => Array.from(win.dataLayer || [], args => Array.from(args));
  const events = () => commands().filter(args => args[0] === "event");
  return {
    win, doc, jar, scripts, storage, controller, commands, events,
    preference(value) { allowed = value; win.dispatchEvent(new Event("meadow:analytics-preference")); },
    quietPreference(value) { allowed = value; },
    tick() { interval?.(); },
  };
}

function withBrowserGlobals(b, callback, navigator = {}) {
  const names = ["window", "document", "location", "navigator"];
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of [["window", b.win], ["document", b.doc], ["location", b.win.location], ["navigator", navigator]]) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  try { return callback(); }
  finally {
    for (const name of names) {
      if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
      else delete globalThis[name];
    }
  }
}

test("GA4 requires an explicit Google choice in addition to the existing usage preference", () => {
  const b = browser(undefined, { cookies: ["_ga=old", "_ga_TEST123=old"] });
  withBrowserGlobals(b, () => {
    assert.equal(googleAnalyticsChoice(), null);
    assert.equal(googleAnalyticsEnabled(), false);
    setGoogleAnalyticsConsent(true);
    assert.equal(googleAnalyticsChoice(), "on");
    assert.equal(googleAnalyticsEnabled(), true);
    setAnalyticsEnabled(false);
    assert.equal(googleAnalyticsEnabled(), false);
    // Restore the global preference without starting the PostHog SDK in this test.
    globalThis.window = undefined;
    setAnalyticsEnabled(true);
    globalThis.window = b.win;
    setGoogleAnalyticsConsent(false);
    assert.equal(googleAnalyticsChoice(), "off");
    assert.equal(googleAnalyticsEnabled(), false);
    assert.equal(b.jar.has("_ga"), false);
    assert.equal(b.jar.has("_ga_TEST123"), false);
  });
  const optOut = browser(undefined, { cookies: ["meadow_ga_analytics=on"] });
  withBrowserGlobals(optOut, () => assert.equal(googleAnalyticsEnabled(), false), { globalPrivacyControl: true });
  withBrowserGlobals(optOut, () => assert.equal(googleAnalyticsEnabled(), false), { doNotTrack: "1" });
});

test("no Google script or event loads before consent, on previews, or on untrusted hosts", () => {
  const noConsent = browser();
  assert.equal(noConsent.scripts.length, 0);
  assert.equal(noConsent.win.gtag, undefined);
  noConsent.preference(true);
  assert.equal(noConsent.scripts.length, 1);
  for (const href of ["http://localhost:5173/start", "https://preview.workers.dev/start", "https://findmeadow.com.example.org/start", "http://findmeadow.com/start"]) {
    assert.equal(browser(href, { enabled: true }).scripts.length, 0, href);
  }
  assert.equal(browser(undefined, { enabled: true, preview: true }).scripts.length, 0);
  assert.equal(browser(undefined, { enabled: true, measurementId: "invalid" }).scripts.length, 0);
  assert.equal(googleAnalyticsAvailable({ win: noConsent.win, preview: false }), true);
  assert.equal(googleAnalyticsAvailable({ win: noConsent.win, preview: true }), false);
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
  assert.equal(privateReferrer.scripts.length, 0);
});

test("navigation sends one safe pageview per page and revokes consent on private routes", () => {
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
  const b = browser("https://app.findmeadow.com/sign-up/complete?utm_source=facebook", {
    enabled: true, cookies: ["meadow_ga_analytics=on"],
  });
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
  const noConsent = browser("https://app.findmeadow.com/sign-up/complete");
  withBrowserGlobals(noConsent, () => assert.equal(queueGoogleSignup(noConsent.win), false));
});

test("withdrawing consent discards a signup conversion pending the dashboard redirect", () => {
  const b = browser("https://app.findmeadow.com/sign-up/complete", {
    enabled: true, cookies: ["meadow_ga_analytics=on"],
  });
  withBrowserGlobals(b, () => {
    assert.equal(queueGoogleSignup(b.win), true);
    setGoogleAnalyticsConsent(false);
    assert.equal(b.storage.has("meadow.ga4.signup.pending"), false);
  });
});

test("private signup callback parameters are never sent with a queued conversion", () => {
  const b = browser("https://app.findmeadow.com/sign-up/complete?__clerk_ticket=private", {
    enabled: true, cookies: ["meadow_ga_analytics=on"],
  });
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
    cookies: ["meadow_ga_analytics=on"], session,
  });
  withBrowserGlobals(first, () => {
    assert.equal(queueGoogleSignup(first.win), true);
    assert.equal(cleanSignupCallbackReferrer(first.win), true);
  });
  assert.equal(first.win.location.href, "https://app.findmeadow.com/sign-up/complete");
  const second = browser("https://app.findmeadow.com/dashboard", {
    enabled: true, referrer: first.win.location.href,
    cookies: ["meadow_ga_analytics=on"], session,
  });
  assert.equal(second.scripts.length, 1);
  assert.equal(second.events().filter(command => command[1] === "sign_up").length, 1);
  assert.doesNotMatch(JSON.stringify(second.commands()), /private|__clerk_ticket/);
});

test("an already-open tab polls a withdrawn choice from another tab", () => {
  const b = browser("https://app.findmeadow.com/dashboard", {
    enabled: true, cookies: ["meadow_ga_analytics=on", "_ga=client-id"],
  });
  b.quietPreference(false);
  b.doc.cookie = "meadow_ga_analytics=off; Path=/";
  b.tick();
  assert.equal(b.win[`ga-disable-${GOOGLE_ANALYTICS_ID}`], true);
  assert.equal(b.jar.has("_ga"), false);
  const eventCount = b.events().length;
  b.win.history.pushState({}, "", "/dashboard/connections");
  assert.equal(b.events().length, eventCount);
});

test("effective usage-analytics opt-out discards a pending signup conversion", () => {
  const b = browser("https://app.findmeadow.com/sign-up/complete", {
    enabled: true, cookies: ["meadow_ga_analytics=on"],
  });
  withBrowserGlobals(b, () => {
    assert.equal(queueGoogleSignup(b.win), true);
    b.preference(false);
    assert.equal(b.storage.has("meadow.ga4.signup.pending"), false);
  });
});

test("successful API action mapping sends only selected, non-identifying conversions", () => {
  const b = browser("https://app.findmeadow.com/dashboard/posts/scheduled", {
    enabled: true, cookies: ["meadow_ga_analytics=on"],
  });
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
