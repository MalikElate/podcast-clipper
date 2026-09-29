// Clerk hot-loads its browser scripts from the instance's Frontend API. By default it asks for the
// `@6` and `@1` tags, which answer with an uncacheable redirect, so every visit paid two extra round
// trips before Meadow knew who was signed in. Exact versions are immutable and stay in the browser cache.
// When @clerk/react changes, set these to where `/npm/@clerk/clerk-js@6/dist/clerk.browser.js` and
// `/npm/@clerk/ui@1/dist/ui.browser.js` on the Frontend API redirect, then record the new @clerk/react version.
export const CLERK_JS_VERSION = "6.34.1";
export const CLERK_UI_VERSION = "1.36.0";
export const CLERK_REACT_VERSION = "6.15.2";

// Decodes the key the same way Clerk does: `pk_<type>_<base64 of "<frontend api host>$">`.
export function clerkFrontendApi(publishableKey = "") {
  if (!/^pk_(live|test)_/.test(publishableKey)) return "";
  try {
    const decoded = atob(publishableKey.split("_")[2]);
    return /^[a-z0-9.-]+\$$/i.test(decoded) ? decoded.slice(0, -1) : "";
  } catch {
    return "";
  }
}

export function clerkScriptUrls(publishableKey) {
  const host = clerkFrontendApi(publishableKey);
  if (!host) return null;
  return {
    clerkJS: `https://${host}/npm/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js`,
    clerkUI: `https://${host}/npm/@clerk/ui@${CLERK_UI_VERSION}/dist/ui.browser.js`,
  };
}
