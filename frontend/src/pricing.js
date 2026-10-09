import { signupHref } from "./siteUrls.js";

export const PLANS = [
  {
    id: "free",
    name: "Free",
    description: "For getting started",
    features: ["Create and schedule posts", "AI agent access", "No credit card required"],
  },
  {
    id: "starter",
    name: "Starter",
    description: "For new creators",
    accounts: "10 connected accounts",
    features: ["Multiple accounts per platform", "Unlimited posts", "Schedule posts", "AI agent access", "Carousel posts", "Human support"],
  },
  {
    id: "creator",
    name: "Creator",
    description: "For growing creators",
    accounts: "25 connected accounts",
    popular: true,
    features: ["Everything in Starter", "Bulk video scheduling", "Content studio access", "Analytics", "Human support"],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For scaling brands",
    accounts: "Unlimited connected accounts",
    best: true,
    features: ["Everything in Creator", "Viral growth reports", "Priority human support", "Invite team members", "Advanced API access", "Priority processing", "Viral growth consulting"],
  },
];

export const PAID_PLANS = PLANS.filter(plan => plan.id !== "free");

export function planHref(plan, cycle) {
  return plan.id === "free" ? signupHref() : `/pricing?checkout=${encodeURIComponent(plan.id)}&cycle=${cycle}`;
}

export function formatMoney(minor, quote, locale) {
  if (["XAF", "XOF"].includes(quote.currency)) return `${formatPriceNumber(minor, quote, locale)} ${currencyLabel(quote)}`;
  const scale = 10 ** quote.currencyExponent;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: quote.currency,
    currencyDisplay: "code",
    minimumFractionDigits: Number.isInteger(minor / scale) ? 0 : quote.currencyExponent,
    maximumFractionDigits: quote.currencyExponent,
  }).format(minor / scale);
}

export function currencyLabel(quote) {
  return ["XAF", "XOF"].includes(quote.currency) ? `FCFA (${quote.currency})` : quote.currency;
}

function formatPriceNumber(minor, quote, locale) {
  const major = minor / 10 ** quote.currencyExponent;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: Number.isInteger(major) ? 0 : quote.currencyExponent,
    maximumFractionDigits: quote.currencyExponent,
  }).format(major);
}

export function planMonthlyPrice(plan, yearly, quote, locale) {
  if (!quote) return plan.id === "free" ? "Free" : "—";
  if (plan.id === "free") return "0";
  const prices = quote.plans[plan.id];
  const minor = yearly ? prices.yearlyMinor / 12 : prices.monthlyMinor;
  const approximate = yearly && prices.yearlyMinor % 12 !== 0;
  return `${approximate ? "≈" : ""}${formatPriceNumber(minor, quote, locale)}`;
}

export function planAccounts(plan, quote) {
  if (plan.id !== "free") return plan.accounts;
  return quote ? `${quote.freeAccounts} connected account${quote.freeAccounts === 1 ? "" : "s"}` : "Connected accounts vary by region";
}

export function planBillingNote(plan, yearly, quote, locale) {
  if (plan.id === "free") return "No credit card required";
  if (!quote) return "Checking local prices…";
  return yearly ? `Billed ${formatMoney(quote.plans[plan.id].yearlyMinor, quote, locale)} yearly` : `Billed monthly in ${currencyLabel(quote)}`;
}

export function checkoutExpectation(quote, planId, cycle) {
  return {
    expectedCurrency: quote.currency,
    expectedAmountMinor: quote.plans[planId][cycle === "yearly" ? "yearlyMinor" : "monthlyMinor"],
    expectedCountryCode: quote.countryCode ?? null,
  };
}
