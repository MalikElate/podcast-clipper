import { analyticsEnabled, analyticsPath } from "./productAnalytics.js";
import { FREE_TOOL_PAGES } from "./tools/freeToolsCatalog.js";

// Public identifier supplied by Meta Events Manager, not an API secret.
export const META_PIXEL_ID = "1591452026328293";
const hosts = new Set(["findmeadow.com", "www.findmeadow.com", "app.findmeadow.com"]);
const toolPaths = new Set(FREE_TOOL_PAGES.map(page => page.path.replace(/\/+$/, "")));
const campaignKeys = new Set(["fbclid", "gclid", "msclkid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "utm_id"]);

// The SDK reads the browser URL itself. Never load or send on callback,
// draft, checkout-session, or other URLs carrying private identifiers.
export function pixelPage(value) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (url.protocol !== "https:" || !hosts.has(url.hostname)) return "";
    if (analyticsPath(path) !== path && !toolPaths.has(path)) return "";
    if (url.hash && !/^#[a-z][a-z0-9-]*$/i.test(url.hash)) return "";
    for (const [key, value] of url.searchParams) {
      if (campaignKeys.has(key)) continue;
      if (key === "checkout" && /^(starter|creator|growth|pro|cancelled)$/.test(value)) continue;
      if (key === "cycle" && /^(monthly|yearly)$/.test(value)) continue;
      return "";
    }
    return `${url.origin}${path}`;
  } catch { return ""; }
}

export function initMetaPixel({ win = globalThis.window, doc = globalThis.document, enabled = analyticsEnabled, preview = false } = {}) {
  if (!win || !doc || preview || !hosts.has(win.location.hostname)) return;
  if (win.__meadowMetaPixel) return win.__meadowMetaPixel;
  let initialized = false, granted = false, lastPage = "";
  // Meta also reads document.referrer. Do not expose an authorization or
  // payment-session identifier left in a referring URL.
  const privateReferrer = /[?&#](?:code|state|token|access_token|id_token|session_id|draft|__clerk[^=]*)=/i.test(doc.referrer || "");

  function sync() {
    try {
      const page = pixelPage(win.location.href);
      if (!enabled() || !page || privateReferrer) {
        if (initialized && granted) {
          // Remove unsent events if the preference changes before SDK load.
          if (Array.isArray(win.fbq.queue)) win.fbq.queue = win.fbq.queue.filter(args => !String(args[0]).startsWith("track"));
          win.fbq("consent", "revoke");
          granted = false;
        }
        lastPage = "";
        return;
      }
      if (!initialized) {
        if (!win.fbq) {
          const fbq = function () { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
          win.fbq = fbq;
          if (!win._fbq) win._fbq = fbq;
          fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
          const script = doc.createElement("script");
          script.async = true;
          script.src = "https://connect.facebook.net/en_US/fbevents.js";
          script.referrerPolicy = "strict-origin";
          doc.head.appendChild(script);
        }
        // Own route tracking to avoid duplicate events and private URL capture.
        win.fbq.disablePushState = true;
        win.fbq("set", "autoConfig", false, META_PIXEL_ID);
        win.fbq("init", META_PIXEL_ID);
        initialized = true;
      }
      if (!granted) { win.fbq("consent", "grant"); granted = true; }
      if (page !== lastPage) {
        win.fbq("trackSingle", META_PIXEL_ID, "PageView");
        lastPage = page;
      }
    } catch { /* Tracking must not interrupt navigation or the app. */ }
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
  win.__meadowMetaPixel = { sync };
  sync();
  return win.__meadowMetaPixel;
}

export function captureMetaRegistration(win = globalThis.window) {
  try {
    if (!win?.fbq || !analyticsEnabled() || !pixelPage(win.location.href)) return false;
    win.fbq("trackSingle", META_PIXEL_ID, "CompleteRegistration");
    return true;
  } catch { return false; }
}

initMetaPixel({ preview: import.meta.env?.DEV || import.meta.env?.VITE_BRIDGE_LOCAL_PREVIEW === "true" });
