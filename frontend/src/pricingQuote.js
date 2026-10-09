import { useEffect, useState } from "react";

const PAID_PLAN_IDS = ["starter", "creator", "pro"];

export function validatePricingQuote(value) {
  const validAmount = amount => Number.isSafeInteger(amount) && amount > 0;
  if (!value || !["ssa", "global"].includes(value.region)
    || typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency)
    || !Number.isInteger(value.currencyExponent) || value.currencyExponent < 0 || value.currencyExponent > 3
    || !Number.isSafeInteger(value.freeAccounts) || value.freeAccounts < 1
    || !value.plans || !PAID_PLAN_IDS.every(id => validAmount(value.plans[id]?.monthlyMinor) && validAmount(value.plans[id]?.yearlyMinor))) {
    throw new Error("Meadow could not load local pricing.");
  }
  return value;
}

export async function fetchPricingQuote({ fetcher = fetch, signal } = {}) {
  const response = await fetcher("/api/pricing", { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error("Meadow could not load local pricing.");
  return validatePricingQuote(await response.json());
}

export function usePricingQuote({ enabled = true } = {}) {
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchPricingQuote({ signal: controller.signal }).then(
      value => { if (!controller.signal.aborted) { setQuote(value); setStatus("ready"); } },
      () => { if (!controller.signal.aborted) setStatus("error"); },
    );
    return () => controller.abort();
  }, [attempt, enabled]);

  function retry() { setQuote(null); setStatus("loading"); setAttempt(value => value + 1); }
  return { quote, status, retry };
}

export function pricingStatusMessage(quote, status) {
  if (status === "error") return "Local prices are temporarily unavailable. Please retry.";
  if (!quote) return "Checking local prices…";
  if (quote.usesFallback) return `Local billing in ${quote.nativeCurrency || "your currency"} is unavailable. Prices and checkout are in ${quote.currency}.`;
  return "";
}
