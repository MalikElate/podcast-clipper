import { clerkFrontendApi } from "./clerkScripts.js";
import { appHref } from "./siteUrls.js";

const REDIRECT_PARAMETERS = [
  "redirect_url",
  "sign_in_force_redirect_url",
  "sign_up_force_redirect_url",
  "sign_in_fallback_redirect_url",
  "sign_up_fallback_redirect_url",
];

export function configuredClerkPublishableKey() {
  return import.meta.env?.VITE_CLERK_PUBLISHABLE_KEY || globalThis.__MEADOW_CONFIG__?.clerkPublishableKey;
}

function hashParameters(hash = "") {
  const index = hash.indexOf("?");
  return { prefix: index < 0 ? hash : hash.slice(0, index), params: new URLSearchParams(index < 0 ? "" : hash.slice(index + 1)) };
}

function safeContinuation(value, locationLike, publishableKey) {
  if (!value || value.trim() !== value || /[\x00-\x1f\x7f\\]/.test(value)) return "";
  try {
    const appOrigin = new URL(appHref("/", locationLike)).origin;
    const url = new URL(value, `${appOrigin}/`);
    if (url.username || url.password || url.pathname.startsWith("//")) return "";
    if (url.origin === appOrigin) {
      const path = url.pathname.replace(/\/+$/, "") || "/";
      // Returning to an auth entry page would repeat the redirect instead of finishing OAuth.
      if (path === "/sign-in" || path === "/sign-up") return "";
      return url.href;
    }
    const clerkHost = clerkFrontendApi(publishableKey);
    return clerkHost && url.origin === `https://${clerkHost}` && url.pathname === "/oauth/authorize" && !url.hash ? url.href : "";
  } catch {
    return "";
  }
}

export function authContinuation(locationLike = globalThis.location, publishableKey = configuredClerkPublishableKey()) {
  const query = new URLSearchParams(locationLike?.search || "");
  const { params: hash } = hashParameters(locationLike?.hash);
  // Clerk's hash router gives fragment parameters precedence over the document query.
  const source = hash.has("redirect_url") ? hash : query;
  if (source.getAll("redirect_url").length !== 1) return "";
  return safeContinuation(source.get("redirect_url"), locationLike, publishableKey);
}

// Clerk accepts URL overrides before component props. Remove those overrides before
// it initializes, keeping only the validated continuation and all non-redirect fields.
export function normalizeAuthRedirects(locationLike, publishableKey, historyLike) {
  const url = new URL(locationLike.href);
  const { prefix, params: hash } = hashParameters(url.hash);
  if (!REDIRECT_PARAMETERS.some(name => url.searchParams.has(name) || hash.has(name))) return;
  const continuation = authContinuation(url, publishableKey);
  for (const name of REDIRECT_PARAMETERS) {
    url.searchParams.delete(name);
    hash.delete(name);
  }
  if (continuation) url.searchParams.set("redirect_url", continuation);
  url.hash = prefix + (hash.size ? `?${hash}` : "");
  if (url.href !== locationLike.href) historyLike.replaceState(historyLike.state, "", url.href);
}

export function clerkAuthRedirectProps(mode, redirectUrl) {
  const signup = mode === "sign-up";
  const opposite = signup ? "signIn" : "signUp";
  return redirectUrl
    ? { forceRedirectUrl: redirectUrl, [`${opposite}ForceRedirectUrl`]: redirectUrl }
    : { fallbackRedirectUrl: signup ? "/sign-up/complete" : "/dashboard", [`${opposite}FallbackRedirectUrl`]: signup ? "/dashboard" : "/sign-up/complete" };
}
