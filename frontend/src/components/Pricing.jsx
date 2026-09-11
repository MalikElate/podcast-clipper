import { useEffect, useState } from "react";
import { PLANS } from "../pricing.js";
import BrandLogo from "./BrandLogo.jsx";

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckIcon() {
  return <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="m3.5 8.8 3.1 3.1 6.9-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Pricing({ onSignIn, onChoosePlan, busyPlan = "", error = "", cancelled = false }) {
  const [yearly, setYearly] = useState(true);

  useEffect(() => { document.title = "Pricing · Meadow"; }, []);

  return (
    <div className="landing pricing-page">
      <header className="landing-header">
        <a className="landing-logo-link" href="/" aria-label="Meadow home"><BrandLogo /></a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="/#how-it-works">How it works</a><a href="/#platforms">Platforms</a><a href="/pricing" aria-current="page">Pricing</a><a href="/#faq">FAQ</a>
        </nav>
        <div className="landing-actions"><button className="btn-ghost" onClick={onSignIn}>Sign in</button><button className="btn-small-primary" onClick={onSignIn}>Start posting <ArrowIcon /></button></div>
      </header>

      <main className="pricing-main">
        <section className="pricing-intro">
          <span className="pricing-kicker">Simple plans, no posting limits</span>
          <h1>Choose the space your publishing needs.</h1>
          <p>Every plan includes unlimited posts and scheduling. Pick the number of connected accounts and level of support that fit your workflow.</p>
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
                {(plan.popular || plan.best) && <span className="pricing-badge">{plan.popular ? "Most popular" : "Best value"}</span>}
              </div>
              <div className="pricing-price"><strong>${price}</strong><span>/month</span></div>
              <p className="pricing-billing-note">{yearly ? `Billed $${price * 12} yearly` : "Billed monthly"}</p>
              <ul><li className="pricing-account"><CheckIcon />{plan.accounts}</li>{plan.features.map(feature => <li key={feature}><CheckIcon />{feature}</li>)}</ul>
              <button className={plan.popular ? "btn-primary" : "pricing-button"} disabled={Boolean(busyPlan)} onClick={() => onChoosePlan(plan.id, yearly ? "yearly" : "monthly")}>{loading ? "Opening secure checkout…" : `Choose ${plan.name}`} {!loading && <ArrowIcon />}</button>
            </article>;
          })}
        </section>

        <section className="pricing-assurance"><span><CheckIcon /> Unlimited scheduled and published posts</span><span><CheckIcon /> Secure checkout powered by Stripe</span><span><CheckIcon /> Manage or cancel from your billing portal</span></section>
      </main>

      <footer className="landing-footer pricing-footer"><div className="footer-bottom"><span>© {new Date().getFullYear()} Meadow</span><span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="mailto:hello@findmeadow.com">Contact</a></span></div></footer>
    </div>
  );
}
