import assert from "node:assert/strict";
import test from "node:test";
import { REGIONAL_PRICING_CURRENCIES } from "../src/bridge/shared/geography.js";
import { pricingForCountry } from "../src/bridge/shared/regionalPricing.js";

test("regional pricing covers only Central and West Africa, including Saint Helena", () => {
  const centralAfrica = ["AO", "CM", "CF", "TD", "CG", "CD", "GQ", "GA", "ST"];
  const westAfrica = ["BJ", "BF", "CV", "CI", "GM", "GH", "GN", "GW", "LR", "ML", "MR", "NE", "NG", "SN", "SL", "TG", "SH"];
  assert.deepEqual(Object.keys(REGIONAL_PRICING_CURRENCIES).sort(), [...centralAfrica, ...westAfrica].sort());
  for (const [country, nativeCurrency] of Object.entries(REGIONAL_PRICING_CURRENCIES)) {
    const quote = pricingForCountry(country);
    assert.equal(quote.region, "ssa", country);
    assert.equal(quote.freeAccounts, 2, country);
    assert.equal(quote.nativeCurrency, nativeCurrency, country);
    assert.equal(quote.usesFallback, quote.currency !== nativeCurrency, country);
    assert.deepEqual(pricingForCountry(country.toLowerCase()), quote, country);
    for (const plan of Object.values(quote.plans)) {
      assert.ok(Number.isSafeInteger(plan.monthlyMinor) && plan.monthlyMinor > 0, country);
      assert.equal(plan.yearlyMinor, plan.monthlyMinor * 10, country);
    }
  }
});

test("Eastern and Southern Africa now receive the complete global quote", () => {
  const excludedCountries = ["IO", "BI", "KM", "DJ", "ER", "ET", "TF", "KE", "MG", "MW", "MU", "YT", "MZ", "RE", "RW", "SC", "SO", "SS", "UG", "TZ", "ZM", "ZW", "BW", "SZ", "LS", "NA", "ZA"];
  const globalQuote = pricingForCountry("US");
  for (const countryCode of excludedCountries) {
    assert.deepEqual(pricingForCountry(countryCode), { ...globalQuote, countryCode }, countryCode);
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
