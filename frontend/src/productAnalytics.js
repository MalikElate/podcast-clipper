import { DASHBOARD_PATHS } from "./bridge/dashboardRoutes.js";
import { PLATFORM_USE_CASES } from "./platformUseCases.js";
import { GENERAL_PAGES } from "./marketing/generalPages.js";

// This is PostHog's public, write-only project token, not a personal API key.
export const MEADOW_POSTHOG_KEY = "phc_noGcZmRtAvHTjbRDfWdqMW5X3sdpsjwiRMt6evTw7AmM";
const hosts = new Set(["findmeadow.com", "www.findmeadow.com", "app.findmeadow.com"]);
const preference = "meadow.product-analytics.disabled";
const preferenceCookie = "meadow_analytics";
const staticPaths = new Set(["/", "/pricing", "/privacy", "/privacy-policy", "/terms", "/terms-of-service", "/tiktok-roast", ...Object.values(DASHBOARD_PATHS), ...PLATFORM_USE_CASES.map(platform => `/${platform.slug}`), ...GENERAL_PAGES.map(page => page.path)]);
const events = new Set(["$pageview", "$pageleave", "meadow_checkout_started", "meadow_post_submitted", "meadow_draft_saved", "meadow_connection_started", "meadow_account_connected", "meadow_account_disconnected", "meadow_media_uploaded"]);
const properties = new Set(["token", "distinct_id", "$session_id", "$window_id", "$lib", "$lib_version", "$insert_id", "$sent_at", "$browser", "$browser_version", "$os", "$os_version", "$device_type", "$screen_height", "$screen_width", "$viewport_height", "$viewport_width", "$is_identified", "$process_person_profile", "$cookieless_mode", "$time", "$prev_pageview_duration", "$prev_pageview_max_scroll_percentage", "$prev_pageview_max_content_percentage"]);
let client;
let starting;
let pending = [];
let memoryOptOut = false;

export function browserPrivacyOptOut(navigator = globalThis.navigator) {
  return navigator?.globalPrivacyControl === true || navigator?.doNotTrack === "1" || navigator?.doNotTrack === "yes";
}

export function analyticsEnabled() {
  if (memoryOptOut || browserPrivacyOptOut()) return false;
  try {
    const cookie = globalThis.document?.cookie.split(";").map(value => value.trim()).find(value => value.startsWith(`${preferenceCookie}=`));
    if (cookie) return cookie === `${preferenceCookie}=on`;
    if (globalThis.localStorage?.getItem(preference) === "true") return false;
  } catch { /* Cookies and storage may be unavailable. */ }
  return true;
}

export function analyticsKey(hostname, env = {}) {
  if (env.VITE_POSTHOG_ENABLED === "false" || env.VITE_BRIDGE_LOCAL_PREVIEW === "true") return "";
  if (!hosts.has(hostname)) return "";
  return env.VITE_POSTHOG_KEY || MEADOW_POSTHOG_KEY;
}

// Only static route names are useful for analytics. Unknown path segments may
// contain a username, email, post identifier, or other user-provided content.
export function analyticsPath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (staticPaths.has(path)) return path;
  return path.startsWith("/dashboard/") ? "/dashboard/other" : "/other";
}

export function cleanAnalyticsUrl(value) {
  try {
    const url = new URL(value);
    if (!hosts.has(url.hostname) || !["https:", "http:"].includes(url.protocol)) return undefined;
    return `https://${url.hostname}${analyticsPath(url.pathname)}`;
  } catch { return undefined; }
}

export function sanitizeAnalyticsEvent(event) {
  if (!event || !events.has(event.event) || !analyticsEnabled()) return null;
  const source = event.properties || {};
  const clean = {};
  for (const name of properties) if (source[name] !== undefined) clean[name] = source[name];
  for (const name of ["$current_url", "$session_entry_url", "$session_exit_url", "$prev_pageview_url"]) {
    const url = cleanAnalyticsUrl(source[name]);
    if (url) clean[name] = url;
  }
  if (clean.$current_url) {
    const url = new URL(clean.$current_url);
    clean.$host = url.hostname;
    clean.$pathname = url.pathname;
    clean.meadow_surface = url.hostname === "app.findmeadow.com" ? "app" : "website";
  }
  // Keep traffic source hostnames, never referring paths or query strings.
  try {
    const referrer = new URL(source.$referrer);
    if (["https:", "http:"].includes(referrer.protocol)) {
      clean.$referrer = `${referrer.protocol}//${referrer.hostname}/`;
      clean.$referring_domain = referrer.hostname;
    }
  } catch { /* No referring website. */ }
  clean.$process_person_profile = false;
  clean.$is_identified = false;
  clean.distinct_id = "$posthog_cookieless";
  clean.$cookieless_mode = true;
  clean.$geoip_disable = true;
  clean.meadow_analytics_version = "2026-09-22";
  return { event: event.event, properties: clean, ...(event.timestamp ? { timestamp: event.timestamp } : {}), ...(event.uuid ? { uuid: event.uuid } : {}) };
}

export function posthogOptions() {
  return {
    api_host: "https://us.i.posthog.com", ui_host: "https://us.posthog.com",
    defaults: "2026-05-30", cookieless_mode: "always", person_profiles: "never",
    capture_pageview: "history_change", capture_pageleave: true,
    autocapture: false, disable_session_recording: true, disable_surveys: true,
    capture_exceptions: false, capture_heatmaps: false, capture_performance: false,
    capture_dead_clicks: false, rageclick: false, enable_recording_console_log: false,
    advanced_disable_flags: true, disable_external_dependency_loading: true,
    disable_conversations: true, disable_product_tours: true, ip: false,
    save_campaign_params: false, save_referrer: false, disable_capture_url_hashes: true,
    before_send: sanitizeAnalyticsEvent,
  };
}

export function initProductAnalytics() {
  if (typeof window === "undefined" || starting || client) return starting;
  const key = analyticsKey(window.location.hostname, import.meta.env || {});
  if (!key || !analyticsEnabled()) return;
  // Retire identifiers from the old identified SDK on both site hosts.
  for (const oldKey of new Set([key, MEADOW_POSTHOG_KEY])) {
    const name = `ph_${oldKey}_posthog`;
    try { localStorage.removeItem(name); sessionStorage.removeItem(name); } catch { /* Storage unavailable. */ }
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.findmeadow.com; SameSite=Lax; Secure`;
  }
  starting = import("posthog-js").then(({ default: posthog }) => {
    if (!analyticsEnabled()) return;
    posthog.init(key, posthogOptions());
    client = posthog;
    for (const event of pending) captureProductEvent(event);
    pending = [];
  }).catch(() => { pending = []; }).finally(() => { starting = undefined; });
  return starting;
}

export function captureProductEvent(event) {
  if (!events.has(event) || !analyticsEnabled()) return;
  try {
    if (client) client.capture(event, {}, { send_instantly: true });
    else if (starting && pending.length < 20) pending.push(event);
  } catch { /* Analytics must never interfere with a user action. */ }
}

export function productEventForRequest(path, method) {
  if (method === "POST" && path === "/billing/checkout") return "meadow_checkout_started";
  if (method === "POST" && /^\/projects\/[^/]+\/posts$/.test(path)) return "meadow_post_submitted";
  if ((method === "POST" && /^\/projects\/[^/]+\/posts\/drafts$/.test(path)) || (method === "PATCH" && /^\/projects\/[^/]+\/posts\/[^/]+$/.test(path))) return "meadow_draft_saved";
  if (method === "POST" && /^\/projects\/[^/]+\/accounts\/connect\/[^/]+$/.test(path)) return "meadow_connection_started";
  if (method === "POST" && /^\/projects\/[^/]+\/connections\/[^/]+$/.test(path)) return "meadow_account_connected";
  if (method === "DELETE" && /^\/projects\/[^/]+\/accounts\/[^/]+$/.test(path)) return "meadow_account_disconnected";
  if (method === "POST" && /^\/projects\/[^/]+\/media$/.test(path)) return "meadow_media_uploaded";
}

export function captureRequestSuccess(path, method) {
  const event = productEventForRequest(path, method);
  if (event) captureProductEvent(event);
}

export function setAnalyticsEnabled(enabled) {
  memoryOptOut = !enabled;
  if (!enabled) pending = [];
  try {
    localStorage.setItem(preference, String(!enabled));
    document.cookie = `${preferenceCookie}=${enabled ? "on" : "off"}; Max-Age=31536000; Path=/; SameSite=Lax; Secure${hosts.has(location.hostname) ? "; Domain=.findmeadow.com" : ""}`;
  } catch { /* The in-memory SDK settings still take effect below. */ }
  if (client) {
    client.set_config({ capture_pageview: enabled ? "history_change" : false, capture_pageleave: enabled });
    if (enabled) captureProductEvent("$pageview");
  } else if (enabled) void initProductAnalytics();
  globalThis.window?.dispatchEvent(new Event("meadow:analytics-preference"));
}
