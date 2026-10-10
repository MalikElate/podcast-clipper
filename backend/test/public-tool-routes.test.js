import test from "node:test";
import assert from "node:assert/strict";
import { legacyToolsPath } from "../src/bridge/shared/publicToolRoutes.js";
import { FREE_TOOL_PAGES } from "../../frontend/src/tools/freeToolsCatalog.js";

test("every legacy tool and guide goes straight to its new canonical path", () => {
  for (const page of FREE_TOOL_PAGES) {
    const legacy = page.path.replace(/^\/tools/, "/free-tools");
    for (const suffix of ["", "/"]) {
      assert.equal(legacyToolsPath(`${legacy}${suffix}`), `${page.path}/`);
      assert.equal(legacyToolsPath(`https://www.findmeadow.com${legacy}${suffix}`), `${page.path}/`);
    }
  }
});

test("saved crop presets, encoded campaign queries, and fragments survive the redirect", () => {
  const state = "?preset=instagram-image-sizes-1&utm_campaign=a%20b&tag=a&tag=b%2Fc#preview";
  const url = new URL(`https://findmeadow.com/free-tools/social-media-image-cropper/${state}`);
  assert.equal(legacyToolsPath(url), `/tools/social-media-image-cropper/${state}`);
  assert.equal(url.pathname, "/free-tools/social-media-image-cropper/");
  assert.equal(legacyToolsPath(`/free-tools${state}`), `/tools/${state}`);
});

test("saved TikTok roast links redirect with their profile handle intact", () => {
  for (const path of ["/tiktok-roast", "/tiktok-roast/"]) {
    assert.equal(legacyToolsPath(`${path}?handle=meadow%2Ecreator#results`), "/tools/tiktok-roast/?handle=meadow%2Ecreator#results");
  }
});

test("new tool URLs, the unchanged API, and other path namespaces do not redirect", () => {
  for (const path of ["/tools", "/tools/utm-builder/", "/tools/tiktok-roast/", "/api/free-tools/generate", "/api/tools/tiktok-roast", "/free-tools-old", "/free-toolshed/", "/tiktok-roast-old", "/tiktok-roast/nested", "/dashboard/tools", "/?next=/free-tools"]) {
    assert.equal(legacyToolsPath(path), null, path);
  }
});
