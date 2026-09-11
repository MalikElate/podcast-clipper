import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const [path, heading] of [["", "Move from idea"], ["terms/", "Terms of Service"], ["terms-of-service/", "Terms of Service"], ["privacy/", "Privacy Policy"], ["privacy-policy/", "Privacy Policy"]]) {
  const html = await readFile(`dist/${path}index.html`, "utf8");
  assert.match(html, /<h1/);
  assert.ok(html.includes(heading), `${path} must contain its own content without JavaScript`);
  assert.ok(!html.includes("Loading Meadow"));
  assert.ok(!html.includes("BridgeApp-"), "Public HTML must not preload the authenticated workspace");
}
console.log("All five public pages contain content without JavaScript; no loading screen or workspace preload.");
