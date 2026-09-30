import { analyticsEnabled, browserPrivacyOptOut } from "./productAnalytics.js";
import { pixelPage } from "./metaPixel.js";

// A GA4 Measurement ID identifies a public web stream; it is not a secret.
export const GOOGLE_ANALYTICS_ID = import.meta.env?.VITE_GA4_MEASUREMENT_ID || "G-VVMXZECLCS";
const hosts = new Set(["findmeadow.com", "www.findmeadow.com", "app.findmeadow.com"]);
const preferenceCookie = "meadow_ga_analytics";
const signupMarker = "meadow.ga4.signup.pending";
const campaignKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_id"];

export function googleAnalyticsAvailable({ win = globalThis.window, preview = import.meta.env?.DEV || import.meta.env?.VITE_BRIDGE_LOCAL_PREVIEW === "true" } = {}) {
  return Boolean(win && !preview && win.location?.protocol === "https:" && hosts.has(win.location.hostname));
}

export function googleAnalyticsChoice(doc = globalThis.document) {
  try {
    const value = doc?.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${preferenceCookie}=`))?.slice(preferenceCookie.length + 1);
    return value === "on" || value === "off" ? value : null;
  } catch { return null; }
}

export function googleAnalyticsEnabled() {
  return googleAnalyticsAvailable() && googleAnalyticsChoice() === "on" && analyticsEnabled() && !browserPrivacyOptOut();
}

function clearGoogleCookies(doc) {
  try {
    for (const part of doc.cookie.split(";")) {
      const name = part.trim().split("=", 1)[0];
      if (name !== "_ga" && !/^_ga_[A-Za-z0-9]+$/.test(name)) continue;
      for (const domain of ["", "; Domain=.findmeadow.com"]) {
        doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure${domain}`;
      }
    }
  } catch { /* Cookie access may be unavailable. */ }
}

export function setGoogleAnalyticsConsent(allowed) {
  try {
    const domain = hosts.has(globalThis.location?.hostname) ? "; Domain=.findmeadow.com" : "";
    globalThis.document.cookie = `${preferenceCookie}=${allowed ? "on" : "off"}; Max-Age=31536000; Path=/; SameSite=Lax; Secure${domain}`;
    if (!allowed) {
      clearGoogleCookies(globalThis.document);
      globalThis.window?.sessionStorage?.removeItem(signupMarker);
    }
  } catch { /* The preference still applies to the current page below. */ }
  globalThis.window?.dispatchEvent(new Event("meadow:analytics-preference"));
}

// Preserve campaign labels for acquisition reports, but never pass private
// callback parameters, ad-click identifiers, emails, or user-entered content.
export function googleAnalyticsPage(value) {
  const safePage = pixelPage(value);
  if (!safePage) return "";
  try {
    const source = new URL(value), page = new URL(safePage);
    for (const key of campaignKeys) {
      const entry = source.searchParams.get(key);
      if (entry && /^[A-Za-z0-9_.-]{1,80}$/.test(entry)) page.searchParams.set(key, entry);
    }
    return page.href;
  } catch { return ""; }
}

function safeReferrer(value) {
  try {
    const referrer = new URL(value);
    return ["https:", "http:"].includes(referrer.protocol) ? `${referrer.origin}/` : "";
  } catch { return ""; }
}

export function initGoogleAnalytics({ win = globalThis.window, doc = globalThis.document, enabled = googleAnalyticsEnabled, measurementId = GOOGLE_ANALYTICS_ID, preview = false } = {}) {
  if (!doc || !googleAnalyticsAvailable({ win, preview }) || !/^G-[A-Z0-9]+$/.test(measurementId)) return;
  if (win.__meadowGoogleAnalytics) return win.__meadowGoogleAnalytics;
  let initialized = false, granted = false, lastPage = "";
  const privateReferrer = /[?&#](?:code|state|token|access_token|id_token|session_id|draft|__clerk[^=]*)=/i.test(doc.referrer || "");

  function sync() {
    try {
      const page = googleAnalyticsPage(win.location.href);
      const consentGranted = enabled();
      if (!consentGranted || !page || privateReferrer) {
        if (!consentGranted) {
          try { win.sessionStorage?.removeItem(signupMarker); } catch { /* Storage may be unavailable. */ }
        }
        if (initialized && granted) {
          // Denied consent alone may still send cookieless pings. Google's
          // property-level opt-out stops future GA hits after withdrawal.
          win[`ga-disable-${measurementId}`] = true;
          win.gtag("consent", "update", { analytics_storage: "denied" });
          clearGoogleCookies(doc);
          granted = false;
        }
        lastPage = "";
        return;
      }
      const pageReferrer = lastPage || safeReferrer(doc.referrer);
      let newlyInitialized = false;
      if (!initialized) {
        win[`ga-disable-${measurementId}`] = false;
        win.dataLayer = win.dataLayer || [];
        win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
        win.gtag("consent", "default", {
          analytics_storage: "denied", ad_storage: "denied",
          ad_user_data: "denied", ad_personalization: "denied",
        });
        win.gtag("js", new Date());
        win.gtag("consent", "update", { analytics_storage: "granted" });
        win.gtag("config", measurementId, {
          send_page_view: false, allow_google_signals: false,
          allow_ad_personalization_signals: false,
          page_location: page, page_referrer: pageReferrer,
        });
        const script = doc.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
        script.referrerPolicy = "strict-origin";
        doc.head.appendChild(script);
        initialized = true; granted = true; newlyInitialized = true;
      } else if (!granted) {
        win[`ga-disable-${measurementId}`] = false;
        win.gtag("consent", "update", { analytics_storage: "granted" });
        granted = true;
      }
      if (page !== lastPage) {
        // GA4 also attaches its configured page fields to automatic events
        // such as session_start and user_engagement. Keep those sanitized on
        // SPA navigation, without emitting a second page_view.
        if (!newlyInitialized) win.gtag("config", measurementId, {
          update: true, send_page_view: false,
          page_location: page, page_referrer: pageReferrer,
        });
        win.gtag("event", "page_view", {
          send_to: measurementId, page_location: page,
          page_referrer: pageReferrer,
        });
        lastPage = page;
      }
      if (win.location.pathname === "/dashboard") {
        const queuedAt = Number(win.sessionStorage?.getItem(signupMarker));
        if (queuedAt) win.sessionStorage.removeItem(signupMarker);
        if (queuedAt && Date.now() - queuedAt >= 0 && Date.now() - queuedAt <= 10 * 60 * 1000) {
          win.gtag("event", "sign_up", { send_to: measurementId, method: "clerk", page_location: page });
        }
      }
    } catch { /* Analytics must never interrupt Meadow. */ }
  }

  for (const method of ["pushState", "replaceState"]) {
    const original = win.history[method];
    win.history[method] = function (...args) {
      const result = original.apply(this, args);
      sync();
      return result;
    };
  }
  for (const event of ["popstate", "hashchange", "storage", "meadow:analytics-preference"]) win.addEventListener(event, sync);
  doc.addEventListener("visibilitychange", () => { if (!doc.hidden) sync(); });
  // The preference cookie is shared across site and app origins, unlike
  // localStorage events. Poll while this document is open so another tab's
  // withdrawal promptly disables a loaded GA tag here as well.
  win.setInterval?.(sync, 1000);
  win.__meadowGoogleAnalytics = { sync };
  sync();
  return win.__meadowGoogleAnalytics;
}

export function queueGoogleSignup(win = globalThis.window) {
  try {
    // This page can carry private Clerk callback parameters. Queue the event
    // without loading GA or copying that URL; send only from a safe dashboard.
    if (!win || !hosts.has(win.location.hostname) || !googleAnalyticsEnabled()) return false;
    win.sessionStorage.setItem(signupMarker, String(Date.now()));
    return true;
  } catch { return false; }
}

export function cleanSignupCallbackReferrer(win = globalThis.window) {
  try {
    if (win?.location?.pathname !== "/sign-up/complete") return false;
    win.history.replaceState({}, "", "/sign-up/complete");
    return true;
  } catch { return false; }
}

export function captureGoogleRequestSuccess(path, method, body, win = globalThis.window) {
  try {
    if (!win || !googleAnalyticsEnabled() || !googleAnalyticsPage(win.location.href)) return;
    const event = method === "POST" && /^\/projects\/[^/]+\/connections\/[^/]+$/.test(path) ? "social_account_connected"
      : method === "POST" && /^\/projects\/[^/]+\/posts$/.test(path) && body?.items?.some(item => item.schedule?.mode === "scheduled") ? "post_scheduled"
      : "";
    if (!event) return;
    const controller = win.__meadowGoogleAnalytics;
    controller?.sync();
    if (win.gtag) win.gtag("event", event, { send_to: GOOGLE_ANALYTICS_ID, page_location: googleAnalyticsPage(win.location.href) });
  } catch { /* Tracking must not fail a successful request. */ }
}
