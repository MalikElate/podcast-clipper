import { useEffect, useState } from "react";
import { PLANS, planHref, planBillingNote, planMonthlyPrice, planAccounts, currencyLabel } from "../pricing.js";
import { usePricingQuote } from "../pricingQuote.js";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";
import PricingComparison from "./PricingComparison.jsx";
import PricingQuoteStatus from "./PricingQuoteStatus.jsx";
import { Icon } from "../bridge/Icons.jsx";
import { marketingHref } from "../siteUrls.js";

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Pricing({ onSignIn, onChoosePlan, busyPlan = "", error = "", cancelled = false, pricingQuoteState = null, initialYearly = true, checkoutPrompt = "" }) {
  const [yearly, setYearly] = useState(initialYearly);
  const ownPricingQuoteState = usePricingQuote({ enabled: !pricingQuoteState });
  const { quote, status, retry } = pricingQuoteState || ownPricingQuoteState;
  const homeUrl = marketingHref("/");

  useEffect(() => { document.title = "Pricing · Meadow"; }, []);

  return (
    <div className="landing pricing-page">
      <SiteHeader homeHref={homeUrl} onSignIn={onSignIn} onStartPosting={onSignIn} />

      <main className="pricing-main">
        <section className="pricing-intro">
          <h1>Pricing</h1>

          <div className="pricing-cycle" role="group" aria-label="Billing frequency">
            <button className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>Monthly</button>
            <button className={yearly ? "active" : ""} onClick={() => setYearly(true)}>Yearly <span>Save up to 17%</span></button>
          </div>
          {checkoutPrompt && <p className="pricing-notice">{checkoutPrompt}</p>}
          {cancelled && <p className="pricing-notice">Checkout was cancelled. Your plan has not changed.</p>}
          {error && <p className="pricing-error" role="alert">{error}</p>}
          <PricingQuoteStatus quote={quote} status={status} retry={retry} />
        </section>

        <section className="pricing-grid" aria-label="Meadow plans">
          {PLANS.map((plan) => {
            const loading = busyPlan === plan.id;
            return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}>
              <div className="pricing-card-top">
                <div><h2>{plan.name}</h2><p>{plan.description}</p></div>

              </div>
              <div className="pricing-price"><strong>{planMonthlyPrice(plan, yearly, quote)}</strong>{quote && <span>{currencyLabel(quote)}/month</span>}</div>
              <p className="pricing-billing-note">{planBillingNote(plan, yearly, quote)}</p>
              <div className="pricing-card-divider" aria-hidden="true" />
              <ul><li className="pricing-account"><Icon name="check" size={17}/>{planAccounts(plan, quote)}</li>{plan.features.map(feature => <li key={feature}><Icon name="check" size={17}/>{feature}</li>)}</ul>
              {plan.id === "free" ? <a className="pricing-button" href={planHref(plan)}>Try for free <ArrowIcon /></a> : <button className={plan.popular ? "btn-primary" : "pricing-button"} disabled={Boolean(busyPlan) || !quote} onClick={() => onChoosePlan(plan.id, yearly ? "yearly" : "monthly")}>{loading ? "Opening secure checkout…" : `Choose ${plan.name}`} {!loading && <ArrowIcon />}</button>}
            </article>;
          })}
        </section>
        <PricingComparison yearly={yearly} onYearlyChange={setYearly} onChoosePlan={onChoosePlan} busyPlan={busyPlan} quote={quote} />

      </main>

      <SiteFooter />
    </div>
  );
}
