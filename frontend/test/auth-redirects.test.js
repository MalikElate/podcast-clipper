import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { RedirectUrls } from "@clerk/shared/internal/clerk-js/redirectUrls";
import { transformWithOxc } from "vite";
import { authContinuation, clerkAuthRedirectProps, normalizeAuthRedirects } from "../src/authRedirects.js";

const productionKey = "pk_live_Y2xlcmsuZmluZG1lYWRvdy5jb20k";
const appOrigin = "https://app.findmeadow.com";
const authorize = "https://clerk.findmeadow.com/oauth/authorize?client_id=codex&state=keep-me&code_challenge=pkce&redirect_uri=http%3A%2F%2F127.0.0.1%3A12345%2Fcallback";
const continueUrl = "https://clerk.findmeadow.com/oauth/authorize/continue?oauth_authorization=keep-me";
const location = (value) => new URL(value, appOrigin);
const signIn = (returnUrl) => location(`/sign-in?redirect_url=${encodeURIComponent(returnUrl)}`);

function normalize(url) {
  const writes = [];
  const history = { state: { keep: "history" }, replaceState: (...args) => writes.push(args) };
  normalizeAuthRedirects(url, productionKey, history);
  if (writes.length) assert.equal(writes[0][0], history.state);
  return { url: writes.length ? location(writes[0][2]) : url, writes };
}

test("OAuth authorization and same-app continuations retain their full parameters", () => {
  assert.equal(authContinuation(signIn(authorize), productionKey), authorize);
  assert.equal(authContinuation(signIn(continueUrl), productionKey), continueUrl);
  for (const target of ["/oauth-consent?client_id=codex&state=preserved", "/dashboard/connections?project=1#accounts", "/pricing?checkout=creator"]) {
    assert.equal(authContinuation(signIn(target), productionKey), location(target).href);
  }
  assert.equal(authContinuation(location("http://localhost:5173/sign-in?redirect_url=%2Fdashboard"), productionKey), "http://localhost:5173/dashboard");
});

test("external returns are limited to the exact configured Clerk HTTPS authorize endpoint", () => {
  const rejected = [
    "https://evil.example/oauth/authorize", "//evil.example/dashboard", "javascript:alert(1)", "data:text/html,anything",
    "https://clerk.findmeadow.com.evil.example/oauth/authorize", "https://clerk.findmeadow.com@evil.example/oauth/authorize",
    "https://user:pass@clerk.findmeadow.com/oauth/authorize", "https://user@app.findmeadow.com/dashboard",
    "http://clerk.findmeadow.com/oauth/authorize", "https://clerk.findmeadow.com:444/oauth/authorize",
    "https://clerk.findmeadow.com/oauth/authorize/", "https://clerk.findmeadow.com/oauth/authorize/continue/", "https://clerk.findmeadow.com/oauth/authorize/continue/other",
    "https://clerk.findmeadow.com/oauth/token", "https://clerk.findmeadow.com/dashboard",
    "https://clerk.findmeadow.com/oauth/authorize#fragment", "/sign-in?redirect_url=%2Fdashboard", "/sign-up/", "/sign-up/complete?redirect_url=%2Fsign-up%2Fcomplete",
    "https://app.findmeadow.com//evil.example", "\\\\evil.example", "\n/dashboard", " /dashboard", "https://[broken",
  ];
  for (const value of rejected) assert.equal(authContinuation(signIn(value), productionKey), "", value);
  assert.equal(authContinuation(signIn(authorize), "pk_live_invalid"), "");
  assert.equal(authContinuation(location("/sign-in?redirect_url=%2Fdashboard&redirect_url=%2Fpricing"), productionKey), "");
});

test("normalization keeps OAuth continuation and callback fields while removing query and hash overrides", () => {
  const original = signIn(authorize);
  original.searchParams.set("__clerk_status", "verified");
  original.searchParams.set("sign_in_force_redirect_url", "https://clerk.findmeadow.com/dashboard");
  original.searchParams.set("sign_up_fallback_redirect_url", "https://evil.example/");
  original.hash = "#/factor-two?__clerk_ticket=keep&sign_up_force_redirect_url=https%3A%2F%2Fevil.example&sign_in_fallback_redirect_url=%2Fpricing";
  const result = normalize(original);
  assert.equal(result.writes.length, 1);
  assert.equal(result.url.searchParams.get("redirect_url"), authorize);
  assert.equal(result.url.searchParams.get("__clerk_status"), "verified");
  assert.equal(result.url.hash, "#/factor-two?__clerk_ticket=keep");
  assert.equal(result.url.searchParams.has("sign_in_force_redirect_url"), false);
  assert.equal(result.url.searchParams.has("sign_up_fallback_redirect_url"), false);
  assert.equal(normalize(result.url).writes.length, 0);
});

test("hash continuation is validated with Clerk's precedence and moved to the canonical query", () => {
  const original = signIn("/dashboard");
  original.hash = `#/sso-callback?__clerk_status=verified&redirect_url=${encodeURIComponent(authorize)}`;
  assert.equal(authContinuation(original, productionKey), authorize);
  const result = normalize(original).url;
  assert.equal(result.searchParams.get("redirect_url"), authorize);
  assert.equal(result.hash, "#/sso-callback?__clerk_status=verified");
  original.hash = "#/sso-callback?redirect_url=https%3A%2F%2Fevil.example";
  assert.equal(normalize(original).url.searchParams.has("redirect_url"), false);
});

test("ordinary navigation is untouched and invalid redirect fields are removed without losing page state", () => {
  const ordinary = location("/dashboard?project=one%20two#posts");
  assert.equal(normalize(ordinary).writes.length, 0);
  const invalid = location("/sign-in?redirect_url=https%3A%2F%2Fevil.example&project=1#verify-email?__clerk_status=complete");
  const result = normalize(invalid).url;
  assert.equal(result.href, `${appOrigin}/sign-in?project=1#verify-email?__clerk_status=complete`);
});

test("OAuth consent and other non-entry routes preserve their exact query and hash", () => {
  for (const path of ["/oauth-consent", "/sign-up/complete", "/pricing", "/dashboard", "/sign-in/other"]) {
    const original = location(`${path}?client_id=codex&state=keep&redirect_uri=http%3A%2F%2F127.0.0.1%2Fcallback&redirect_url=%2Fdashboard&sign_in_force_redirect_url=%2Fpricing#callback?sign_up_force_redirect_url=%2Fdashboard`);
    const before = original.href;
    assert.equal(normalize(original).writes.length, 0, path);
    assert.equal(original.href, before);
  }
});

test("the installed Clerk redirect resolver keeps continuation through both auth switches", () => {
  const previousWindow = globalThis.window;
  globalThis.window = { location: { origin: appOrigin } };
  try {
    const options = { allowedRedirectOrigins: [appOrigin, "https://clerk.findmeadow.com"] };
    for (const mode of ["sign-in", "sign-up"]) {
      const props = clerkAuthRedirectProps(mode, authorize);
      const clerkProps = mode === "sign-in" ? { ...props, signInForceRedirectUrl: props.forceRedirectUrl } : { ...props, signUpForceRedirectUrl: props.forceRedirectUrl };
      const resolver = new RedirectUrls(options, clerkProps, normalize(signIn(authorize)).url.searchParams);
      assert.equal(resolver.getAfterSignInUrl(), authorize);
      assert.equal(resolver.getAfterSignUpUrl(), authorize);
    }
    const normalSignIn = clerkAuthRedirectProps("sign-in");
    assert.equal("forceRedirectUrl" in normalSignIn, false);
    const signInResolver = new RedirectUrls(options, { ...normalSignIn, signInFallbackRedirectUrl: normalSignIn.fallbackRedirectUrl });
    assert.equal(signInResolver.getAfterSignInUrl(), `${appOrigin}/dashboard`);
    assert.equal(signInResolver.getAfterSignUpUrl(), `${appOrigin}/sign-up/complete`);
    const normalSignUp = clerkAuthRedirectProps("sign-up");
    assert.equal("forceRedirectUrl" in normalSignUp, false);
    const signUpResolver = new RedirectUrls(options, { ...normalSignUp, signUpFallbackRedirectUrl: normalSignUp.fallbackRedirectUrl });
    assert.equal(signUpResolver.getAfterSignUpUrl(), `${appOrigin}/sign-up/complete`);
    assert.equal(signUpResolver.getAfterSignInUrl(), `${appOrigin}/dashboard`);
    const attacked = signIn(authorize);
    attacked.searchParams.set("sign_in_force_redirect_url", "https://clerk.findmeadow.com/dashboard");
    const safeResolver = new RedirectUrls(options, {}, normalize(attacked).url.searchParams);
    assert.equal(safeResolver.getAfterSignInUrl(), authorize);
  } finally {
    globalThis.window = previousWindow;
  }
});

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
async function surface(name, nextName, url, auth, overrides = {}) {
  const code = appSource.slice(appSource.indexOf(`function ${name}(`), appSource.indexOf(`function ${nextName}(`));
  const transformed = await transformWithOxc(code, "auth-surface.jsx", { jsx: { runtime: "classic" } });
  const context = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    Auth: "Auth", DomainRedirect: "DomainRedirect", OpeningMeadow: "OpeningMeadow", localPreview: false,
    useAuth: () => auth, useEffect: () => {}, returnPath: () => authContinuation(url, productionKey),
    ...overrides,
  };
  return runInNewContext(`${transformed.code}\n${name}();`, context);
}

function findAuth(node) {
  return node.type === "Auth" ? node : node.props.children.map(child => typeof child === "object" && child ? findAuth(child) : undefined).find(Boolean);
}

test("production sign-in and sign-up surfaces resume OAuth for restored and new sessions", async () => {
  for (const [name, nextName] of [["SigninSurface", "OAuthConsentSurface"], ["SignupSurface", "SigninSurface"]]) {
    const signedIn = await surface(name, nextName, signIn(continueUrl), { user: { id: "existing" }, loading: false });
    assert.equal(signedIn.type, "DomainRedirect");
    assert.equal(signedIn.props.href, continueUrl);
    const signedOut = await surface(name, nextName, signIn(continueUrl), { user: null, loading: false });
    const expected = name === "SignupSurface" ? `/sign-up/complete?redirect_url=${encodeURIComponent(continueUrl)}` : continueUrl;
    assert.equal(findAuth(signedOut).props.redirectUrl, expected);
    const ordinary = await surface(name, nextName, location("/sign-in"), { user: { id: "existing" }, loading: false });
    assert.equal(ordinary.props.href, "/dashboard");
    const unsafe = await surface(name, nextName, signIn("https://evil.example/"), { user: { id: "existing" }, loading: false });
    assert.equal(unsafe.props.href, "/dashboard");
    const loading = await surface(name, nextName, signIn(authorize), { user: undefined, loading: true });
    assert.equal(loading.type, "OpeningMeadow");
  }
});

test("signup completion records the existing conversion and resumes OAuth before callback cleanup", async () => {
  const url = location(`/sign-up/complete?redirect_url=${encodeURIComponent(continueUrl)}`);
  const events = [];
  const storage = new Map([["meadow.signup.pending", "1"]]);
  await surface("SignupComplete", "PricingSurface", url, { user: { id: "new", createdAt: Date.now() }, loading: false }, {
    useEffect: callback => callback(),
    sessionStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) },
    captureMetaRegistration: () => events.push("meta"),
    captureProductEvent: name => events.push(name),
    queueGoogleSignup: () => events.push("google"),
    cleanSignupCallbackReferrer: () => { events.push("clean"); url.search = ""; },
    window: { location: { replace: target => events.push(target) } },
  });
  assert.deepEqual(events, ["meta", "meadow_signup_completed", "google", "clean", continueUrl]);
  assert.equal(storage.has("meadow.signup.pending"), false);
});
