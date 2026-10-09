import test from "node:test";
import assert from "node:assert/strict";
import { CAPTURE_LIFETIME, captureFromPage, captureFromContext, handoffUrl, readStoredCapture, validateCapture, webUrl } from "../src/capture.js";

test("page, selection, link and image clips preserve the content the user chose", () => {
  const page = captureFromPage({ title: "A useful article", url: "https://example.com/story", selection: "" });
  assert.equal(page.text, "A useful article\n\nhttps://example.com/story");
  const selected = captureFromContext({ menuItemId: "meadow-selection", pageUrl: page.url, selectionText: "The exact words 🪴" }, { title: page.title });
  assert.equal(selected.text, "The exact words 🪴\n\nhttps://example.com/story");
  const link = captureFromContext({ menuItemId: "meadow-link", linkUrl: "https://example.org/linked", pageUrl: page.url }, { title: page.title });
  assert.equal(link.url, "https://example.org/linked");
  const image = captureFromContext({ menuItemId: "meadow-image", srcUrl: "https://images.example.com/photo.png", pageUrl: page.url }, { title: page.title });
  assert.equal(image.imageUrl, "https://images.example.com/photo.png");
  assert.equal(image.text, page.url);
});

test("the fixed Meadow handoff preserves edits as data in the fragment", () => {
  const input = { version: 1, title: "<script>not executable</script>", url: "https://example.com/?a=1&b=2", text: "My edited caption\n\nNo extra URL! 🌱", imageUrl: "" };
  const url = new URL(handoffUrl(input));
  assert.equal(url.origin, "https://app.findmeadow.com");
  assert.equal(url.pathname, "/dashboard/import");
  assert.equal(url.search, "");
  assert.deepEqual(JSON.parse(new URLSearchParams(url.hash.slice(1)).get("meadow-capture")), input);
  assert.equal(validateCapture({ version: 1, text: "Manual caption" }).url, "");
  assert.equal(validateCapture({ version: 1, imageUrl: "https://example.com/image.png" }).text, "");
});

test("restricted pages, inline images, credentials and oversized payloads cannot be handed off", () => {
  for (const url of ["chrome://settings", "file:///private/file", "javascript:alert(1)", "data:image/png;base64,abc", "blob:https://example.com/a", "https://name:secret@example.com/"]) {
    assert.throws(() => webUrl(url));
  }
  assert.throws(() => captureFromContext({ menuItemId: "meadow-image", srcUrl: "blob:https://example.com/a", pageUrl: "https://example.com" }));
  assert.throws(() => validateCapture({ version: 1, text: " " }));
  assert.throws(() => validateCapture({ version: 2, text: "Hello" }));
  assert.throws(() => validateCapture({ version: 1, text: "a".repeat(20001) }));
  assert.throws(() => handoffUrl({ version: 1, text: "🌱".repeat(10000) }), /too large/);
  assert.throws(() => captureFromPage({ url: "https://example.com", selection: "a".repeat(20000) }), /too long/);
});

test("local clips expire after an hour and malformed or future records are discarded", () => {
  const now = 5000000;
  const capture = { version: 1, title: "", text: "Keep this", url: "", imageUrl: "" };
  assert.deepEqual(readStoredCapture({ capture, savedAt: now }, now), capture);
  assert.equal(readStoredCapture({ capture, savedAt: now - CAPTURE_LIFETIME - 1 }, now), null);
  assert.equal(readStoredCapture({ capture, savedAt: now + 1 }, now), null);
  assert.equal(readStoredCapture({ capture: { ...capture, imageUrl: "file:///secret" }, savedAt: now }, now), null);
});
