import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let server;
let SiteHeader;
let AuthContext;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("../", import.meta.url)),
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  ({ default: SiteHeader } = await server.ssrLoadModule("/src/components/SiteHeader.jsx"));
  ({ AuthContext } = await server.ssrLoadModule("/src/AuthContext.jsx"));
});

after(async () => { await server?.close(); });

function renderHeader(auth, props = {}) {
  return renderToStaticMarkup(React.createElement(AuthContext.Provider, { value: auth }, React.createElement(SiteHeader, props)));
}

test("signed-out navigation separates sign-in from free account creation", () => {
  const html = renderHeader({ user: null, loading: false });
  assert.match(html, /href="https:\/\/app\.findmeadow\.com\/sign-in">Sign in<\/a>/);
  assert.match(html, /class="btn-small-primary" href="https:\/\/app\.findmeadow\.com\/sign-up">Try for free /);
  assert.doesNotMatch(html, /Start posting/);
});

test("a restored signed-in session shows only the dashboard action", () => {
  const html = renderHeader({ user: { id: "test_user" }, loading: false }, { onSignIn: () => {}, onStartPosting: () => {} });
  assert.doesNotMatch(html, /Sign in|Try for free|\/sign-up|Start posting|<button class="btn-small-primary"/);
  assert.match(html, /class="btn-small-primary" href="https:\/\/app\.findmeadow\.com\/dashboard">Dashboard /);
});

test("session restoration does not show a sign-in action", () => {
  assert.doesNotMatch(renderHeader({ user: undefined, loading: true }), /Sign in/);
});

test("a legacy dashboard callback cannot replace the signed-out signup link", () => {
  const html = renderHeader({ user: null, loading: false }, { onStartPosting: () => {} });
  assert.match(html, /class="btn-small-primary" href="https:\/\/app\.findmeadow\.com\/sign-up"/);
});

test("public prerendering supplies usable signup navigation without Clerk", () => {
  const html = renderToStaticMarkup(React.createElement(SiteHeader));
  assert.match(html, /href="https:\/\/app\.findmeadow\.com\/sign-up">Try for free /);
});
