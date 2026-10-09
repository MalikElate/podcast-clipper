import test from "node:test";
import assert from "node:assert/strict";
import { CAPTURE_KEY, ENABLED_KEY } from "../src/capture.js";

const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
let enabled = false, session = {}, menus = [], opens = [], popupFails = false;
globalThis.chrome = {
  storage: {
    local: { async get() { return { [ENABLED_KEY]: enabled }; } },
    session: { async set(data) { Object.assign(session, data); } },
    onChanged: event(),
  },
  runtime: { onInstalled: event(), onStartup: event(), getURL: path => `chrome-extension://test/${path}` },
  contextMenus: { async removeAll() { menus = []; }, create(item) { menus.push(item); }, onClicked: event() },
  action: { async openPopup() { if (popupFails) throw new Error("Popup unavailable"); opens.push("popup"); } },
  tabs: { async create({ url }) { opens.push(url); } },
};
const { updateMenus, clipContext } = await import("../src/background.js");

test("no context-menu capture exists before the user enables clipping", async () => {
  enabled = false; session = {}; opens = [];
  await updateMenus();
  await clipContext({ menuItemId: "meadow-selection", pageUrl: "https://example.com", selectionText: "private selection" });
  assert.equal(menus.length, 0);
  assert.deepEqual(session, {});
  assert.deepEqual(opens, []);
});

test("enabled context actions save only the selected clip and open an editor, not an external page", async () => {
  enabled = true; session = {}; opens = []; popupFails = false;
  await updateMenus();
  assert.equal(menus.length, 4);
  assert.ok(menus.every(menu => menu.documentUrlPatterns.length === 2));
  await clipContext({ menuItemId: "meadow-image", pageUrl: "https://example.com/story", srcUrl: "https://example.com/image.jpg" }, { title: "Story" });
  assert.equal(session[CAPTURE_KEY].capture.imageUrl, "https://example.com/image.jpg");
  assert.deepEqual(opens, ["popup"]);
  enabled = false;
  await updateMenus();
  assert.equal(menus.length, 0);
});

test("a restricted image preserves the previous clip and explains the failure", async () => {
  enabled = true; popupFails = true; opens = [];
  const previous = session[CAPTURE_KEY];
  await clipContext({ menuItemId: "meadow-image", pageUrl: "https://example.com/story", srcUrl: "blob:https://example.com/private" });
  assert.equal(session[CAPTURE_KEY], previous);
  assert.match(session.meadowCaptureError, /HTTP and HTTPS/);
  assert.deepEqual(opens, ["chrome-extension://test/popup.html?editor=tab"]);
});
