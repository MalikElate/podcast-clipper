import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "manifest.json"), "utf8"));

test("the extension is MV3 with only user-invoked clipping permissions", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.toSorted(), ["activeTab", "contextMenus", "scripting", "storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  assert.ok(manifest.description.length <= 132);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
});

test("packaged popup uses local scripts and renders user content as text", async () => {
  const html = await fs.readFile(path.join(root, "src/popup.html"), "utf8");
  const source = await fs.readFile(path.join(root, "src/popup.js"), "utf8");
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.match(html, /src="popup.js"/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|\bfetch\s*\(/);
  for (const match of source.matchAll(/byId\("([^"]+)"\)/g)) assert.ok(html.includes(`id="${match[1]}"`), `Missing popup element ${match[1]}`);
});
