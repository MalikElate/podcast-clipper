import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CLERK_JS_VERSION, CLERK_REACT_VERSION, CLERK_UI_VERSION, clerkFrontendApi, clerkScriptUrls } from "../src/clerkScripts.js";

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
  assert.equal(version, CLERK_REACT_VERSION, "Update the pinned versions in src/clerkScripts.js for this @clerk/react release.");
});
