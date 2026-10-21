import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import * as accessRules from "../src/bridge/connectionAccess.js";
import { createAccountOperations } from "../src/bridge/accountOperations.js";
import { sortPlatforms } from "../src/bridge/platforms.js";
import * as dashboardRoutes from "../src/bridge/dashboardRoutes.js";

const compile = async file => {
  const source = (await readFile(new URL(`../src/bridge/${file}`, import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "").replace(/export default function/g, "function").replace(/export const/g, "const");
  return (await transformWithOxc(source, file, { jsx: { runtime: "classic" } })).code;
};
const accountsCode = await compile("Accounts.jsx");
const workspaceCode = await compile("BridgeApp.jsx");
const catalog = ["facebook", "instagram", "threads", "linkedin", "tiktok"].map(id => ({
  id, name: id[0].toUpperCase() + id.slice(1), configured: true, accountType: "Profiles", formats: ["image", "video"],
}));
const ui = {
  Icon: () => null, PlatformIcon: () => null,
  Alert: ({ message }) => message ? React.createElement("div", { role: "alert" }, message) : null,
  Badge: ({ children }) => React.createElement("span", null, children),
  Modal: ({ title, children }) => React.createElement("section", { role: "dialog", "aria-label": title }, children),
  Check: ({ children }) => React.createElement("label", null, children),
};

function elements(element, predicate) {
  if (!element || typeof element !== "object") return [];
  if (Array.isArray(element)) return element.flatMap(child => elements(child, predicate));
  if (typeof element.type === "function") return elements(element.type(element.props), predicate);
  return [...(predicate(element) ? [element] : []), ...elements(element.props?.children, predicate)];
}
const label = element => renderToStaticMarkup(element).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const buttons = element => elements(element, item => item.type === "button");
const button = (element, name) => buttons(element).find(item => label(item) === name);
const tick = () => new Promise(resolve => setImmediate(resolve));

function accountHarness({ hasPaidAccess = false, billingFailure = false, request, accounts = [], connectionId = "" } = {}) {
  const states = [], refs = [], effects = [], cleanups = [], calls = [], navigation = [];
  let stateIndex, refIndex, effectIndex, pendingEffects, view;
  const props = {
    project: { id: "studio", name: "Studio" }, accounts, catalog,
    config: { connectionsReady: true, localPreview: false }, connectionId,
    onChanged() {}, clearConnection() {}, onBilling() { navigation.push("billing"); },
  };
  const context = {
    React, AbortController, ...ui, ...accessRules, sortPlatforms, createAccountOperations,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) { const index = refIndex++; return refs[index] ||= { current: initial }; },
    useEffect(effect, dependencies) {
      const index = effectIndex++;
      if (!effects[index] || dependencies.some((value, offset) => value !== effects[index][offset])) {
        effects[index] = dependencies;
        pendingEffects.push(() => { cleanups[index]?.(); cleanups[index] = effect(); });
      }
    },
    api: {
      async getBilling() {
        if (billingFailure) throw new Error("Billing is unavailable.");
        return { platformAccess: { paidPlatforms: accessRules.PAID_CONNECTION_PLATFORMS, hasPaidAccess } };
      },
      async project(project, path, options) {
        calls.push({ project, path, options });
        return request ? request(path, options) : { url: "https://provider.example/authorize" };
      },
    },
    window: { location: { assign(url) { navigation.push(url); } } },
  };
  const component = runInNewContext(`${accountsCode}\nProjectAccounts;`, context);
  function render() {
    stateIndex = refIndex = effectIndex = 0; pendingEffects = [];
    view = component(props);
    return view;
  }
  async function settle() { if (!view) render(); pendingEffects.forEach(effect => effect()); await tick(); return render(); }
  return { render, settle, calls, navigation, setBillingFailure(value) { billingFailure = value; }, close() { cleanups.forEach(cleanup => cleanup?.()); } };
}

test("free accounts route the three paid connections and reconnects to billing", async () => {
  const harness = accountHarness({ accounts: [{ id: "old-instagram", platform: "instagram", label: "Old profile", status: "reconnect_required" }] });
  try {
    const view = await harness.settle();
    assert.equal(buttons(view).filter(item => label(item) === "Upgrade to connect").length, 3);
    assert.equal((renderToStaticMarkup(view).match(/Paid plan required/g) || []).length, 3);
    assert.ok(button(view, "Connect Linkedin"));
    assert.ok(button(view, "Connect Tiktok"));
    await button(view, "Upgrade to connect").props.onClick();
    await button(view, "Upgrade to reconnect").props.onClick();
    assert.deepEqual(harness.navigation, ["billing", "billing"]);
    assert.equal(harness.calls.length, 0);
  } finally { harness.close(); }
});

test("server-granted paid access keeps the existing connection flow", async () => {
  const harness = accountHarness({ hasPaidAccess: true });
  try {
    const view = await harness.settle();
    assert.doesNotMatch(renderToStaticMarkup(view), /Paid plan required|Upgrade to/);
    await button(view, "Connect Facebook").props.onClick();
    assert.equal(harness.calls[0].path, "/accounts/connect/facebook");
    assert.equal(harness.calls[0].options.method, "POST");
    assert.deepEqual(harness.navigation, ["https://provider.example/authorize"]);
  } finally { harness.close(); }
});

test("a pending or failed plan check only disables paid connections and can retry", async () => {
  const harness = accountHarness({ billingFailure: true });
  try {
    const pending = harness.render();
    assert.equal(buttons(pending).filter(item => label(item) === "Checking plan…" && item.props.disabled).length, 3);
    assert.equal(button(pending, "Connect Linkedin").props.disabled, false);
    const failed = await harness.settle();
    assert.match(renderToStaticMarkup(failed), /Could not check access to Facebook, Instagram, and Threads/);
    assert.equal(buttons(failed).filter(item => label(item) === "Plan unavailable" && item.props.disabled).length, 3);
    assert.ok(button(failed, "Retry plan check"));
    assert.equal(button(failed, "Connect Tiktok").props.disabled, false);
    harness.setBillingFailure(false);
    button(failed, "Retry plan check").props.onClick();
    harness.render();
    const retried = await harness.settle();
    assert.doesNotMatch(renderToStaticMarkup(retried), /Could not check access|Plan unavailable/);
    assert.equal(buttons(retried).filter(item => label(item) === "Upgrade to connect").length, 3);
  } finally { harness.close(); }
});

test("server denial after a plan changes replaces a stale connect action with an upgrade", async () => {
  const harness = accountHarness({ hasPaidAccess: true, request() {
    throw Object.assign(new Error("A paid Meadow plan is required."), { code: "paid_plan_required" });
  } });
  try {
    const view = await harness.settle();
    await button(view, "Connect Facebook").props.onClick();
    const denied = harness.render();
    assert.match(renderToStaticMarkup(denied), /A paid Meadow plan is required/);
    assert.ok(button(denied, "View paid plans"));
    assert.equal(buttons(denied).filter(item => label(item) === "Upgrade to connect").length, 3);
    button(denied, "View paid plans").props.onClick();
    assert.deepEqual(harness.navigation, ["billing"]);
  } finally { harness.close(); }
});

test("a paid-plan rejection during account attachment keeps an upgrade action inside the dialog", async () => {
  const harness = accountHarness({ hasPaidAccess: true, connectionId: "pending-auth", request(path, options) {
    if (options?.method === "POST") throw Object.assign(new Error("A paid Meadow plan is required."), { code: "paid_plan_required" });
    return { candidates: [{ remoteId: "remote-account", label: "Authorized page" }] };
  } });
  try {
    const view = await harness.settle();
    await button(view, "Add 1 accounts").props.onClick();
    const denied = harness.render();
    const dialog = elements(denied, item => item.props?.role === "dialog")[0];
    assert.match(renderToStaticMarkup(dialog), /A paid Meadow plan is required/);
    assert.ok(button(dialog, "View paid plans"));
    assert.equal(button(dialog, "Add 1 accounts"), undefined);
    button(dialog, "View paid plans").props.onClick();
    assert.deepEqual(harness.navigation, ["billing"]);
  } finally { harness.close(); }
});

test("an OAuth callback paid-plan denial offers the in-app billing route", () => {
  const navigation = [];
  const context = {
    React, URLSearchParams, ...ui, ...dashboardRoutes,
    useState(initial) { return [typeof initial === "function" ? initial() : initial, () => {}]; },
    useRef(current) { return { current }; }, useEffect() {},
    localPreview: false, MEADOW_LOGO_URL: "logo.svg", BridgeMark: () => null,
    window: {
      location: { pathname: "/dashboard/connections", search: "?connectionError=Paid%20plan%20required&connectionErrorCode=paid_plan_required" },
      history: { pushState(state, title, path) { navigation.push(path); } },
    },
  };
  const view = runInNewContext(`${workspaceCode}\nWorkspace({ user: { email: 'test@example.com' } });`, context);
  assert.match(renderToStaticMarkup(view), /Paid plan required/);
  button(view, "View paid plans").props.onClick();
  assert.deepEqual(navigation, ["/dashboard/billing"]);
});
