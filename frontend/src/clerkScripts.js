// Clerk hot-loads its browser scripts from the instance's Frontend API. By default it asks for the
// `@6` and `@1` tags, which answer with an uncacheable redirect, so every visit paid two extra round
// trips before Meadow knew who was signed in. Exact versions are immutable and stay in the browser cache.
// When @clerk/react changes, set these to where `/npm/@clerk/clerk-js@6/dist/clerk.browser.js` and
// `/npm/@clerk/ui@1/dist/ui.browser.js` on the Frontend API redirect, then record the new @clerk/react version.
// Also recheck the UI chunk names below against that ui.browser.js build and both auth forms.
export const CLERK_JS_VERSION = "6.34.1";
export const CLERK_UI_VERSION = "1.36.0";
export const CLERK_REACT_VERSION = "6.15.2";
export const CLERK_AUTH_CHUNKS_UI_VERSION = "1.36.0";

// Immutable chunks from @clerk/ui 1.36.0 (build 58d0c7). SignIn also uses the SignUp
// chunk; 3736 contains the shared portal, and initialization loads subscriptionDetails.
// Preloading downloads these without executing them.
const AUTH_SHARED_CHUNKS = ["framework", "vendors", "ui-common", "signup", "3736", "subscriptionDetails"];
const SIGN_IN_CHUNKS = [...AUTH_SHARED_CHUNKS, "8746", "signin"];

export function clerkAuthChunkUrls(publishableKey, mode = "sign-in") {
  const scripts = clerkScriptUrls(publishableKey);
  if (!scripts) return [];
  const base = scripts.clerkUI.slice(0, scripts.clerkUI.lastIndexOf("/") + 1);
  return (mode === "sign-up" ? AUTH_SHARED_CHUNKS : SIGN_IN_CHUNKS)
    .map(name => `${base}${name}_ui_58d0c7_${CLERK_AUTH_CHUNKS_UI_VERSION}.js`);
}

// Runs in the HTML head, before the app and Clerk's session check. The cookie is
// only a download hint: Clerk still decides whether to render an auth form.
export function clerkAuthPreloadScript(publishableKey) {
  if (!clerkScriptUrls(publishableKey)) return "";
  const urls = JSON.stringify({ signIn: clerkAuthChunkUrls(publishableKey), signUp: clerkAuthChunkUrls(publishableKey, "sign-up") });
  return `(() => {
    try {
      if (location.hostname !== "app.findmeadow.com") return;
      const path = location.pathname.replace(/\\/+$/, "") || "/";
      const signup = path === "/sign-up";
      if (!signup && path !== "/" && !/^\\/dashboard(?:\\/|$)/.test(path)) return;
      if (document.cookie.split(";").some(cookie => {
        const parts = cookie.trim().split("=");
        return /^__client_uat(?:_[^=]+)?$/.test(parts[0]) && Number(parts[1]) > 0;
      })) return;
      const urls = ${urls};
      for (const href of signup ? urls.signUp : urls.signIn) {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "script";
        link.fetchPriority = "low";
        link.href = href;
        document.head.appendChild(link);
      }
    } catch { /* A blocked cookie or preload must never prevent sign-in. */ }
  })();`;
}

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
