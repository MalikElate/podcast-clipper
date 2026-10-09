import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import { dashboardPath } from "../src/routes.js";

const manifest = JSON.parse(await fs.readFile(new URL("../manifest.json", import.meta.url), "utf8"));
test("MV3 cross-posting needs storage and only Meadow network access", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://findmeadow.com/*"]);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert.equal(manifest.action.default_popup, undefined);
  assert.ok(manifest.description.length <= 132);
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self';/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-eval/);
});
test("toolbar opens packaged composer without reading the active tab", async () => {
  const source = await fs.readFile(new URL("../src/background.js", import.meta.url), "utf8");
  let listener; const opened = [];
  vm.runInNewContext(source, { chrome: {
    action: { onClicked: { addListener(fn) { listener = fn; } } },
    runtime: { getURL: file => "chrome-extension://test/" + file },
    tabs: { create: options => opened.push(options) },
  } });
  assert.equal(opened.length, 0);
  listener();
  assert.equal(opened[0].url, "chrome-extension://test/app.html");
});
test("shared composer links always use the Meadow app origin", () => {
  assert.equal(dashboardPath("accounts"), "https://app.findmeadow.com/dashboard/connections");
  assert.equal(dashboardPath("https://evil.example"), "https://app.findmeadow.com/dashboard");
});
