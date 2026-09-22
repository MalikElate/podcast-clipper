import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Meadow workspace and free TikTok tool stay light", async () => {
  const [workspace, roastStyles] = await Promise.all([
    readFile(new URL("../src/bridge/BridgeApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/tools/tiktokRoast.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(workspace, /data-theme="dark"/);
  assert.equal((workspace.match(/data-theme="light"/g) || []).length, 2);
  assert.match(roastStyles, /color-scheme:light/);
  assert.doesNotMatch(roastStyles, /--bg:#050505|background:#050505/);
  assert.match(roastStyles, /\.tiktok-roast-page>\.landing-header \{[^}]*background:var\(--bg\)/);
});
