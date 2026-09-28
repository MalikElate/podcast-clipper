import test from "node:test";
import assert from "node:assert/strict";
import { initMetaPixel, META_PIXEL_ID, pixelPage } from "../src/metaPixel.js";
import { FREE_TOOL_PAGES } from "../src/tools/freeToolsCatalog.js";

function browser(href = "https://findmeadow.com/", { enabled = true, referrer = "", preview = false } = {}) {
  const win = new EventTarget(), doc = new EventTarget(), scripts = [];
  let allowed = enabled;
  win.location = new URL(href);
  win.history = Object.fromEntries(["pushState", "replaceState"].map(method => [method, function (_state, _title, url) {
    if (url) win.location = new URL(url, win.location.href);
    return "navigation-result";
  }]));
  doc.referrer = referrer;
  doc.head = { appendChild: script => scripts.push(script) };
  doc.createElement = () => ({});
  const controller = initMetaPixel({ win, doc, enabled: () => allowed, preview });
  const commands = () => Array.from(win.fbq?.queue || [], args => Array.from(args));
  return { win, doc, scripts, controller, commands, events: () => commands().filter(args => args[0] === "trackSingle"),
    preference(value) { allowed = value; win.dispatchEvent(new Event("meadow:analytics-preference")); } };
}

test("header pixel boots once with the supplied ID and one PageView", () => {
  const b = browser();
  assert.equal(b.scripts.length, 1);
  assert.equal(b.scripts[0].src, "https://connect.facebook.net/en_US/fbevents.js");
  assert.equal(b.scripts[0].async, true);
  assert.deepEqual(b.commands().slice(0, 2), [["set", "autoConfig", false, META_PIXEL_ID], ["init", META_PIXEL_ID]]);
  assert.equal(b.win.fbq.disablePushState, true);
  assert.deepEqual(b.events(), [["trackSingle", "1591452026328293", "PageView"]]);
  assert.equal(initMetaPixel({ win: b.win, doc: b.doc }), b.controller);
  assert.equal(b.scripts.length, 1);
  assert.equal(b.events().length, 1);
});

test("production hosts and free tools are covered; development and previews never load Meta", () => {
  for (const host of ["findmeadow.com", "www.findmeadow.com", "app.findmeadow.com"]) assert.equal(browser(`https://${host}/`).events().length, 1);
  assert.ok(pixelPage(`https://findmeadow.com${FREE_TOOL_PAGES[0].path}`));
  for (const url of ["http://localhost:5173/", "https://preview.example/", "http://findmeadow.com/"]) assert.equal(browser(url).scripts.length, 0);
  assert.equal(browser(undefined, { preview: true }).scripts.length, 0);
});

test("private URL parameters, callback paths, and referring credentials cannot load the pixel", () => {
  for (const path of ["/dashboard?draft=private", "/dashboard/billing?session_id=cs_private", "/dashboard/connections?code=secret&state=secret", "/?email=private@example.com", "/#access_token=secret", "/oauth/callback", "/dashboard/posts/private-id"]) {
    assert.equal(browser(`https://app.findmeadow.com${path}`).scripts.length, 0, path);
  }
  assert.equal(browser(undefined, { referrer: "https://example.com/callback?code=secret" }).scripts.length, 0);
  assert.equal(browser("https://findmeadow.com/?fbclid=campaign&utm_source=facebook").events().length, 1);
});

test("navigation counts each page once, preserving history return values and back navigation", () => {
  const b = browser();
  assert.equal(b.win.history.pushState({}, "", "/pricing"), "navigation-result");
  b.win.history.replaceState({}, "", "/pricing?cycle=yearly");
  b.win.history.replaceState({}, "", "/pricing/#plans");
  assert.equal(b.events().length, 2);
  b.win.location = new URL("https://findmeadow.com/");
  b.win.dispatchEvent(new Event("popstate"));
  assert.equal(b.events().length, 3);
});

test("an initial opt-out prevents loading; opting in initializes without a reload", () => {
  const b = browser(undefined, { enabled: false });
  assert.equal(b.scripts.length, 0);
  assert.equal(b.win.fbq, undefined);
  b.preference(true);
  assert.equal(b.events().length, 1);
  assert.equal(b.scripts.length, 1);
});

test("opting out clears unsent pageviews and revokes SDK consent immediately", () => {
  const b = browser();
  b.preference(false);
  assert.equal(b.events().length, 0);
  assert.deepEqual(b.commands().at(-1), ["consent", "revoke"]);
  b.win.history.pushState({}, "", "/pricing");
  assert.equal(b.events().length, 0);
  b.preference(true);
  assert.equal(b.events().length, 1);
  assert.equal(b.scripts.length, 1);
});

test("private SPA navigation revokes consent until the callback parameters are removed", () => {
  const b = browser("https://app.findmeadow.com/dashboard");
  b.win.history.replaceState({}, "", "/dashboard/connections?code=private&state=private");
  assert.equal(b.events().length, 0);
  assert.deepEqual(b.commands().at(-1), ["consent", "revoke"]);
  b.win.history.replaceState({}, "", "/dashboard/connections");
  assert.deepEqual(b.commands().slice(-2), [["consent", "grant"], ["trackSingle", META_PIXEL_ID, "PageView"]]);
});

test("a blocked or throwing pixel cannot break navigation", () => {
  const b = browser();
  b.win.fbq.callMethod = () => { throw new Error("Tracking blocked"); };
  assert.equal(b.win.history.pushState({}, "", "/pricing"), "navigation-result");
  assert.equal(b.win.location.pathname, "/pricing");
});
