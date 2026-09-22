import { useEffect, useState } from "react";
import { PLANS, planHref, planBillingNote } from "../pricing.js";
import BrandLogo from "./BrandLogo.jsx";
import SiteFooter from "./SiteFooter.jsx";
import PricingComparison from "./PricingComparison.jsx";
import { marketingHref } from "../siteUrls.js";

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Pricing({ onSignIn, onChoosePlan, busyPlan = "", error = "", cancelled = false }) {
  const [yearly, setYearly] = useState(true);
  const homeUrl = marketingHref("/");

  useEffect(() => { document.title = "Pricing · Meadow"; }, []);

  return (
    <div className="landing pricing-page">
      <header className="landing-header">
        <a className="landing-logo-link" href={homeUrl} aria-label="Meadow home"><BrandLogo /></a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href={marketingHref("/pricing")} aria-current="page">Pricing</a><a href={marketingHref("/#faq")}>FAQ</a>
        </nav>
        <div className="landing-actions"><button className="btn-ghost" onClick={onSignIn}>Sign in</button><button className="btn-small-primary" onClick={onSignIn}>Start posting <ArrowIcon /></button></div>
      </header>

      <main className="pricing-main">
        <section className="pricing-intro">
          <h1>Choose the space your publishing needs.</h1>

          <div className="pricing-cycle" role="group" aria-label="Billing frequency">
            <button className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>Monthly</button>
            <button className={yearly ? "active" : ""} onClick={() => setYearly(true)}>Yearly <span>Save up to 17%</span></button>
          </div>
          {cancelled && <p className="pricing-notice">Checkout was cancelled. Your plan has not changed.</p>}
          {error && <p className="pricing-error" role="alert">{error}</p>}
        </section>

        <section className="pricing-grid" aria-label="Meadow plans">
          {PLANS.map((plan) => {
            const price = yearly ? plan.yearly : plan.monthly;
            const loading = busyPlan === plan.id;
            return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}>
              <div className="pricing-card-top">
                <div><h2>{plan.name}</h2><p>{plan.description}</p></div>

              </div>
              <div className="pricing-price"><strong>${price}</strong><span>/month</span></div>
              <p className="pricing-billing-note">{planBillingNote(plan, yearly)}</p>
              <ul><li className="pricing-account">{plan.accounts}</li>{plan.features.map(feature => <li key={feature}>{feature}</li>)}</ul>
              {plan.id === "free" ? <a className="pricing-button" href={planHref(plan)}>Try for free <ArrowIcon /></a> : <button className={plan.popular ? "btn-primary" : "pricing-button"} disabled={Boolean(busyPlan)} onClick={() => onChoosePlan(plan.id, yearly ? "yearly" : "monthly")}>{loading ? "Opening secure checkout…" : `Choose ${plan.name}`} {!loading && <ArrowIcon />}</button>}
            </article>;
          })}
        </section>
        <PricingComparison yearly={yearly} onYearlyChange={setYearly} onChoosePlan={onChoosePlan} busyPlan={busyPlan} />

      </main>

      <SiteFooter />
    </div>
  );
}
