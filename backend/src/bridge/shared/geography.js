// UN M49 Sub-Saharan Africa: Eastern, Middle, Southern, and Western Africa.
// Keep the country and currency list together so pricing and account limits
// use the same regional boundary. Currency availability is checked separately.
export const SUB_SAHARAN_CURRENCIES = Object.freeze({
  AO: "AOA", BJ: "XOF", BF: "XOF", BI: "BIF", BW: "BWP", CD: "CDF",
  CF: "XAF", CG: "XAF", CI: "XOF", CM: "XAF", CV: "CVE", DJ: "DJF",
  ER: "ERN", ET: "ETB", GA: "XAF", GH: "GHS", GM: "GMD", GN: "GNF",
  GQ: "XAF", GW: "XOF", IO: "GBP", KE: "KES", KM: "KMF", LR: "LRD",
  LS: "LSL", MG: "MGA", ML: "XOF", MR: "MRU", MU: "MUR", MW: "MWK",
  MZ: "MZN", NA: "NAD", NE: "XOF", NG: "NGN", RE: "EUR", RW: "RWF",
  SC: "SCR", SH: "SHP", SL: "SLE", SN: "XOF", SO: "SOS",
  SS: "SSP", ST: "STN", SZ: "SZL", TD: "XAF", TF: "EUR", TG: "XOF",
  TZ: "TZS", UG: "UGX", YT: "EUR", ZA: "ZAR", ZM: "ZMW", ZW: "ZWG",
});

export function normalizeCountryCode(value) {
  const code = typeof value === "string" ? value.toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) && !["XX", "ZZ"].includes(code) ? code : null;
}

export function isSubSaharanCountry(value) {
  const code = normalizeCountryCode(value);
  return Boolean(code && SUB_SAHARAN_CURRENCIES[code]);
}

export function nativeCurrencyForCountry(value) {
  const code = normalizeCountryCode(value);
  return code ? SUB_SAHARAN_CURRENCIES[code] || null : null;
}
