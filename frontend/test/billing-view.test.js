import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithOxc } from "vite";
import * as pricing from "../src/pricing.js";
import { pricingStatusMessage } from "../src/pricingQuote.js";
import * as billingState from "../src/bridge/billingState.js";

const source = (await readFile(new URL("../src/bridge/Billing.jsx", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export default function Billing", "function Billing");
const { code } = await transformWithOxc(source, "billing.jsx", { jsx: { runtime: "classic" } });
const quote = {
  region: "global", currency: "USD", currencyExponent: 2, freeAccounts: 3,
  plans: {
    starter: { monthlyMinor: 1500, yearlyMinor: 15000 },
    creator: { monthlyMinor: 2900, yearlyMinor: 29000 },
    pro: { monthlyMinor: 5900, yearlyMinor: 59000 },
  },
};

function renderBilling(billing, { pricingError = false } = {}) {
  let stateIndex = 0;
  const context = {
    React, URLSearchParams, ...pricing, ...billingState, pricingStatusMessage,
    useEffect() {},
    useState(initial) {
      stateIndex += 1;
      const value = stateIndex === 3 ? billing : stateIndex === 8 ? false : typeof initial === "function" ? initial() : initial;
      return [value, () => {}];
    },
    usePricingQuote: () => ({ quote: pricingError ? null : quote, status: pricingError ? "error" : "ready", retry() {} }),
    Icon: () => null,
    Alert: ({ message }) => message ? React.createElement("p", null, message) : null,
  };
  return renderToStaticMarkup(runInNewContext(`${code}\nBilling({ localPreview: false });`, context));
}

const complimentary = {
  planId: "pro", status: "active", source: "complimentary", cycle: null,
  currentPeriodEnd: null, cancelAtPeriodEnd: false, canManage: false, configured: false,
};

test("complimentary Pro shows no charge without pricing or checkout prompts", () => {
  for (const pricingError of [false, true]) {
    const html = renderBilling(complimentary, { pricingError });
    assert.match(html, /Current plan<\/span><strong>Pro<\/strong>/);
    assert.match(html, /Status<\/span><strong>Complimentary<\/strong>/);
    assert.match(html, /Billing<\/span><strong>No charge<\/strong>/);
    assert.match(html, /No payment is required/);
    assert.doesNotMatch(html, /Renews|Ends<|Subscription currency|Billing frequency|Choose |Switch to |Manage billing|Checkout is temporarily unavailable|Local prices are temporarily unavailable|Billed |\/month/);
    assert.doesNotMatch(html, /bridge-plan-grid/);
  }
});

test("complimentary access preserves billing-history access when Stripe has a customer", () => {
  const html = renderBilling({ ...complimentary, canManage: true });
  assert.match(html, /Manage billing/);
  assert.match(html, /No charge/);
  assert.doesNotMatch(html, /Manage current plan|Switch to |Choose /);
});

test("paid Pro retains subscription pricing, renewal, and management", () => {
  const html = renderBilling({
    planId: "pro", status: "active", cycle: "yearly", currentPeriodEnd: "2027-10-12T12:00:00Z",
    currency: "USD", region: "global", canManage: true, configured: true,
  });
  assert.match(html, /Current plan<\/span><strong>Pro<\/strong>/);
  assert.match(html, /Status<\/span><strong>active<\/strong>/);
  assert.match(html, /Billing<\/span><strong>yearly<\/strong>/);
  assert.match(html, /Subscription currency/);
  assert.match(html, /Renews/);
  assert.match(html, /Manage billing/);
  assert.match(html, /Manage current plan/);
  assert.match(html, /Billing frequency/);
  assert.doesNotMatch(html, /Complimentary|No charge|No payment is required/);
});
