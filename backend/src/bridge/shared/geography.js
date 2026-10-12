// Regional pricing is limited to UN M49 Middle (Central) and Western Africa.
// Western Africa includes Saint Helena, Ascension and Tristan da Cunha (SH).
// Keep the country and currency list together so pricing and account limits
// use the same regional boundary. Currency availability is checked separately.
export const REGIONAL_PRICING_CURRENCIES = Object.freeze({
  AO: "AOA", BJ: "XOF", BF: "XOF", CD: "CDF", CF: "XAF", CG: "XAF",
  CI: "XOF", CM: "XAF", CV: "CVE", GA: "XAF", GH: "GHS", GM: "GMD",
  GN: "GNF", GQ: "XAF", GW: "XOF", LR: "LRD", ML: "XOF", MR: "MRU",
  NE: "XOF", NG: "NGN", SH: "SHP", SL: "SLE", SN: "XOF", ST: "STN",
  TD: "XAF", TG: "XOF",
});

export function normalizeCountryCode(value) {
  const code = typeof value === "string" ? value.toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) && !["XX", "ZZ"].includes(code) ? code : null;
}

export function isRegionalPricingCountry(value) {
  const code = normalizeCountryCode(value);
  return Boolean(code && REGIONAL_PRICING_CURRENCIES[code]);
}

export function regionalCurrencyForCountry(value) {
  const code = normalizeCountryCode(value);
  return code ? REGIONAL_PRICING_CURRENCIES[code] || null : null;
}
