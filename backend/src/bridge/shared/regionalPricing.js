import { nativeCurrencyForCountry, normalizeCountryCode } from './geography.js';

// Fixed catalog reviewed from 2026-10-09 Frankfurter rates against the
// official 655.957 XAF/XOF per EUR peg. See regionalPricingSnapshot.json.
// Each tuple is [starter, creator, pro] in Stripe charge minor units.
const SSA_MONTHLY_MINOR = Object.freeze({
  AOA: [780000, 1570000, 3610000],
  BIF: [25500, 51500, 118000],
  BWP: [11500, 23000, 53500],
  CDF: [1960000, 3920000, 9020000],
  CVE: [84000, 168000, 387000],
  DJF: [1500, 3050, 7000],
  ETB: [140000, 275000, 635000],
  EUR: [750, 1500, 3500],
  GBP: [650, 1300, 3000],
  GMD: [63000, 125000, 288000],
  GNF: [75000, 150500, 346000],
  KES: [110000, 220000, 510000],
  KMF: [3750, 7500, 17250],
  LRD: [145000, 290000, 670000],
  LSL: [14000, 28500, 65000],
  MGA: [38000, 76500, 175500],
  MUR: [40500, 81000, 186500],
  MWK: [1480000, 2960000, 6810000],
  MZN: [54000, 109000, 250000],
  NAD: [14000, 28500, 65500],
  NGN: [1140000, 2270000, 5230000],
  RWF: [12600, 25200, 58000],
  SCR: [12500, 24500, 56500],
  SHP: [650, 1300, 3000],
  SLE: [20500, 40500, 93500],
  SOS: [490000, 975000, 2245000],
  SZL: [14000, 28500, 65000],
  TZS: [2250000, 4500000, 10350000],
  UGX: [3500000, 6950000, 16000000],
  XAF: [5000, 10000, 23000],
  XOF: [5000, 10000, 23000],
  ZAR: [14000, 28500, 65000],
  ZMW: [17000, 34000, 78500],
});

const SSA_EUR_FALLBACK = Object.freeze([750, 1500, 3500]);
const GLOBAL_USD_MONTHLY = Object.freeze([2900, 3900, 9900]);
const GLOBAL_USD_YEARLY = Object.freeze([28800, 39600, 99600]);
// Stripe charges UGX as major units * 100, with no fractional UGX.
const ZERO_DECIMAL = new Set(['BIF', 'DJF', 'GNF', 'KMF', 'MGA', 'RWF', 'XAF', 'XOF']);
const PLAN_NAMES = ['starter', 'creator', 'pro'];

function plansFromAmounts(monthly, yearly) {
  return Object.fromEntries(PLAN_NAMES.map((name, index) => [name, {
    monthlyMinor: monthly[index],
    yearlyMinor: yearly[index],
  }]));
}

export function pricingForCountry(value) {
  const countryCode = normalizeCountryCode(value);
  const nativeCurrency = nativeCurrencyForCountry(countryCode);
  if (!nativeCurrency) {
    return {
      region: 'global', countryCode, currency: 'USD', nativeCurrency: null,
      usesFallback: false, freeAccounts: 5, currencyExponent: 2,
      plans: plansFromAmounts(GLOBAL_USD_MONTHLY, GLOBAL_USD_YEARLY),
    };
  }
  const nativeMonthly = SSA_MONTHLY_MINOR[nativeCurrency];
  const usesFallback = !nativeMonthly;
  const currency = usesFallback ? 'EUR' : nativeCurrency;
  const monthly = usesFallback ? SSA_EUR_FALLBACK : nativeMonthly;
  return {
    region: 'ssa', countryCode, currency, nativeCurrency,
    usesFallback, freeAccounts: 2,
    currencyExponent: ZERO_DECIMAL.has(currency) ? 0 : 2,
    plans: plansFromAmounts(monthly, monthly.map(amount => amount * 10)),
  };
}
