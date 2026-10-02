import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { CLERK_AUTH_CHUNKS_UI_VERSION, CLERK_JS_VERSION, CLERK_REACT_VERSION, CLERK_UI_VERSION, clerkAuthChunkUrls, clerkAuthPreloadScript, clerkFrontendApi, clerkScriptUrls } from "../src/clerkScripts.js";

const productionKey = "pk_live_Y2xlcmsuZmluZG1lYWRvdy5jb20k";

test("Clerk scripts load from exact, cacheable versions on the instance's Frontend API", () => {
  assert.match(CLERK_JS_VERSION, /^6\.\d+\.\d+$/);
  assert.match(CLERK_UI_VERSION, /^1\.\d+\.\d+$/);
  assert.equal(clerkFrontendApi(productionKey), "clerk.findmeadow.com");
  assert.deepEqual(clerkScriptUrls(productionKey), {
    clerkJS: `https://clerk.findmeadow.com/npm/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js`,
    clerkUI: `https://clerk.findmeadow.com/npm/@clerk/ui@${CLERK_UI_VERSION}/dist/ui.browser.js`,
  });
});

test("an unusable publishable key leaves Clerk on its default script URLs", () => {
  for (const key of [undefined, "", "Y2xlcmsuZmluZG1lYWRvdy5jb20k", "pk_live_not base64", `pk_live_${btoa("evil.com/x$")}`]) {
    assert.equal(clerkScriptUrls(key), null, String(key));
  }
});

test("the pinned Clerk scripts are revisited whenever @clerk/react changes", async () => {
  const { version } = JSON.parse(await readFile(new URL("../node_modules/@clerk/react/package.json", import.meta.url), "utf8"));
  assert.equal(version, CLERK_REACT_VERSION, "Update the pinned versions and recheck both auth forms' UI chunk names in src/clerkScripts.js for this @clerk/react release.");
});

test("auth chunks are rechecked when the pinned Clerk UI version changes", () => {
  assert.equal(CLERK_AUTH_CHUNKS_UI_VERSION, CLERK_UI_VERSION, "Recheck the auth chunk names in src/clerkScripts.js for this Clerk UI release.");
});

function runPreload({ hostname = "app.findmeadow.com", pathname = "/dashboard", cookie = "" } = {}) {
  const links = [];
  runInNewContext(clerkAuthPreloadScript(productionKey), {
    location: { hostname, pathname },
    document: { cookie, createElement: () => ({}), head: { appendChild: link => links.push(link) } },
  });
  return links;
}

test("signed-out app visits preload the matching auth chunks with Clerk's request mode", () => {
  for (const pathname of ["/", "/sign-in", "/sign-in/", "/dashboard", "/dashboard/", "/dashboard/connections"]) {
    const links = runPreload({ pathname });
    assert.deepEqual(links.map(link => link.href), clerkAuthChunkUrls(productionKey));
    assert.ok(links.every(link => link.rel === "preload" && link.as === "script" && link.fetchPriority === "low" && !("crossOrigin" in link) && !("crossorigin" in link)));
  }
  assert.deepEqual(runPreload({ pathname: "/sign-up/", cookie: "__client_uat=0" }).map(link => link.href), clerkAuthChunkUrls(productionKey, "sign-up"));
  assert.ok(clerkAuthChunkUrls(productionKey, "sign-up").every(url => !url.includes("signin_") && !url.includes("8746_")));
});

test("marketing pages, signed-in visitors and non-auth routes skip auth chunk downloads", () => {
  for (const hostname of ["findmeadow.com", "www.findmeadow.com", "localhost", "preview.example.com"]) {
    assert.deepEqual(runPreload({ hostname }), []);
  }
  for (const pathname of ["/terms", "/pricing", "/start", "/dashboard-other", "/sign-up/complete"]) {
    assert.deepEqual(runPreload({ pathname }), []);
  }
  for (const cookie of ["__client_uat=1790700000", "other=1; __client_uat_instance=1790700000; another=2"]) {
    assert.deepEqual(runPreload({ cookie }), []);
  }
  assert.ok(runPreload({ cookie: "other=__client_uat; __client_uat=0" }).length > 0);
});

test("unusable keys and inaccessible cookies leave auth loading untouched", () => {
  assert.equal(clerkAuthPreloadScript("pk_live_invalid"), "");
  assert.deepEqual(clerkAuthChunkUrls("pk_live_invalid"), []);
  const document = { get cookie() { throw new Error("Cookies blocked"); } };
  assert.doesNotThrow(() => runInNewContext(clerkAuthPreloadScript(productionKey), { location: { hostname: "app.findmeadow.com", pathname: "/dashboard" }, document }));
});
