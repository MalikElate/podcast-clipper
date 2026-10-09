import assert from "node:assert/strict";
import test from "node:test";
import { SUB_SAHARAN_CURRENCIES } from "../src/bridge/shared/geography.js";
import { pricingForCountry } from "../src/bridge/shared/regionalPricing.js";

test("every Sub-Saharan location has a chargeable fixed regional quote", () => {
  assert.equal(Object.keys(SUB_SAHARAN_CURRENCIES).length, 53);
  for (const [country, nativeCurrency] of Object.entries(SUB_SAHARAN_CURRENCIES)) {
    const quote = pricingForCountry(country);
    assert.equal(quote.region, "ssa", country);
    assert.equal(quote.freeAccounts, 2, country);
    assert.equal(quote.nativeCurrency, nativeCurrency, country);
    assert.equal(quote.usesFallback, quote.currency !== nativeCurrency, country);
    for (const plan of Object.values(quote.plans)) {
      assert.ok(Number.isSafeInteger(plan.monthlyMinor) && plan.monthlyMinor > 0, country);
      assert.equal(plan.yearlyMinor, plan.monthlyMinor * 10, country);
    }
  }
});

test("CFA references, unsupported-currency fallback, and global prices stay distinct", () => {
  for (const country of ["CM", "SN"]) {
    const quote = pricingForCountry(country);
    assert.deepEqual(Object.values(quote.plans).map(plan => plan.monthlyMinor), [5000, 10000, 23000]);
    assert.equal(quote.currencyExponent, 0);
  }
  assert.equal(pricingForCountry("GH").currency, "EUR");
  assert.equal(pricingForCountry("GH").usesFallback, true);
  assert.deepEqual(pricingForCountry("US").plans.starter, { monthlyMinor: 2900, yearlyMinor: 28800 });
  assert.equal(pricingForCountry("US").freeAccounts, 5);
  assert.equal(pricingForCountry("T1").region, "global");
});
