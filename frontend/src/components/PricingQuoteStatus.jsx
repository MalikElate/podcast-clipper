import { pricingStatusMessage } from "../pricingQuote.js";

export default function PricingQuoteStatus({ quote, status, retry, className = "" }) {
  const message = pricingStatusMessage(quote, status);
  if (!message) return null;
  return <p className={`pricing-quote-status ${className}`} role={status === "error" ? "alert" : "status"}>
    {message} {status === "error" && <button type="button" onClick={retry}>Retry</button>}
  </p>;
}
