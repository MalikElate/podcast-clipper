import assert from "node:assert/strict";
import test from "node:test";
import { PLANS, PAID_PLANS, planBillingNote, planHref, planMonthlyPrice, planAccounts, formatMoney, checkoutExpectation, currencyLabel } from "../src/pricing.js";
import { validatePricingQuote, fetchPricingQuote, pricingStatusMessage } from "../src/pricingQuote.js";
import { billingPlanAction, SUBSCRIPTION_STATUSES } from "../src/bridge/billingState.js";

const globalQuote = {
  region: "global", countryCode: "US", currency: "USD", currencyExponent: 2, nativeCurrency: "USD", usesFallback: false, freeAccounts: 5,
  plans: { starter: { monthlyMinor: 2900, yearlyMinor: 28800 }, creator: { monthlyMinor: 3900, yearlyMinor: 39600 }, pro: { monthlyMinor: 9900, yearlyMinor: 99600 } },
};
const ssaQuote = {
  region: "ssa", countryCode: "CM", currency: "XAF", currencyExponent: 0, nativeCurrency: "XAF", usesFallback: false, freeAccounts: 2,
  plans: { starter: { monthlyMinor: 10000, yearlyMinor: 100000 }, creator: { monthlyMinor: 20000, yearlyMinor: 200000 }, pro: { monthlyMinor: 30000, yearlyMinor: 300000 } },
};

test("all pricing surfaces share plan identities and region-specific Free capacity", () => {
  assert.deepEqual(PLANS.map(({ id, accounts }) => [id, accounts]), [
    ["free", undefined],
    ["starter", "10 connected accounts"],
    ["creator", "25 connected accounts"],
    ["pro", "Unlimited connected accounts"],
  ]);
  assert.deepEqual(PAID_PLANS.map(plan => plan.id), ["starter", "creator", "pro"]);
  const free = PLANS[0];
  assert.equal(planAccounts(free, null), "Connected accounts vary by region");
  assert.equal(planAccounts(free, globalQuote), "5 connected accounts");
  assert.equal(planAccounts(free, ssaQuote), "2 connected accounts");
  assert.equal(planMonthlyPrice(free, false, null), "Free");
  assert.equal(planMonthlyPrice(free, false, ssaQuote), "0");
  for (const yearly of [false, true]) assert.equal(planBillingNote(free, yearly), "No credit card required");
  assert.equal(new URL(planHref(free)).pathname, "/sign-up");
});

test("server quote sets each displayed amount and the exact billed yearly total", () => {
  const starter = PAID_PLANS[0];
  assert.equal(planMonthlyPrice(starter, false, globalQuote, "en-US"), "29");
  assert.equal(planMonthlyPrice(starter, true, globalQuote, "en-US"), "24");
  assert.match(planBillingNote(starter, true, globalQuote, "en-US"), /Billed USD\s*288 yearly/);
  assert.equal(planMonthlyPrice(starter, false, ssaQuote, "en-US"), "10,000");
  assert.equal(planMonthlyPrice(starter, true, ssaQuote, "en-US"), "≈8,333");
  assert.equal(planBillingNote(starter, true, ssaQuote, "en-US"), "Billed 100,000 FCFA (XAF) yearly");
  assert.equal(currencyLabel(ssaQuote), "FCFA (XAF)");
  assert.equal(planMonthlyPrice(starter, true, null), "—");
  assert.equal(formatMoney(123456, { currency: "NGN", currencyExponent: 2 }, "en-US").replace(/\s/g, " "), "NGN 1,234.56");
});

test("checkout expectations copy the displayed quote's exact charge, currency and country", () => {
  assert.deepEqual(checkoutExpectation(ssaQuote, "starter", "yearly"), {
    expectedCurrency: "XAF", expectedAmountMinor: 100000, expectedCountryCode: "CM",
  });
  assert.deepEqual(checkoutExpectation({ ...globalQuote, countryCode: null }, "pro", "monthly"), {
    expectedCurrency: "USD", expectedAmountMinor: 9900, expectedCountryCode: null,
  });
});

test("pricing quote validates before display and explains fallback billing currency", async () => {
  assert.deepEqual(validatePricingQuote(ssaQuote), ssaQuote);
  assert.throws(() => validatePricingQuote({ ...ssaQuote, plans: { ...ssaQuote.plans, starter: { monthlyMinor: "10000", yearlyMinor: 100000 } } }));
  const quote = await fetchPricingQuote({ fetcher: async () => ({ ok: true, json: async () => ssaQuote }) });
  assert.equal(quote.currency, "XAF");
  assert.match(pricingStatusMessage({ ...ssaQuote, nativeCurrency: "GHS", currency: "EUR", usesFallback: true }, "ready"), /GHS.*EUR/);
  assert.match(pricingStatusMessage(null, "error"), /temporarily unavailable/);
});

test("Free is the current plan without a subscription and never opens checkout", () => {
  for (const status of ["free", "canceled", "incomplete_expired"]) {
    assert.deepEqual(billingPlanAction("free", { status }), { current: true, action: "none", label: "Current plan" });
    assert.equal(billingPlanAction("starter", { status }).action, "checkout");
  }
  assert.equal(billingPlanAction("free", null).current, false);
  assert.equal(billingPlanAction("free", null).action, "none");
});

test("paid subscribers manage changes through the portal, including legacy Growth", () => {
  for (const status of SUBSCRIPTION_STATUSES) {
    for (const planId of ["starter", "creator", "growth", "pro"]) {
      const billing = { status, planId };
      assert.deepEqual(billingPlanAction("free", billing), { current: false, action: "portal", label: "Manage subscription" });
      assert.equal(billingPlanAction("starter", billing).action, "portal");
    }
  }
  assert.deepEqual(billingPlanAction("creator", { status: "active", planId: "creator" }), { current: true, action: "portal", label: "Manage current plan" });
  assert.deepEqual(billingPlanAction("creator", { status: "active", region: "ssa", planId: "starter" }), { current: false, action: "portal", label: "Manage billing" });
  assert.deepEqual(billingPlanAction("creator", { status: "active", region: "ssa", planId: "creator" }), { current: true, action: "portal", label: "Manage billing" });
});
