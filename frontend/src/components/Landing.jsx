import { useState } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLANS } from "../pricing.js";

const PLATFORMS = sortPlatforms([
  { id: "x", name: "X", color: "#171717" },
  { id: "instagram", name: "Instagram", color: "#d94686" },
  { id: "linkedin", name: "LinkedIn", color: "#0a66c2" },
  { id: "facebook", name: "Facebook", color: "#1877f2" },
  { id: "tiktok", name: "TikTok", color: "#111111" },
  { id: "youtube", name: "YouTube", color: "#ff0033" },
  { id: "bluesky", name: "Bluesky", color: "#168aff" },
  { id: "threads", name: "Threads", color: "#111111" },
  { id: "pinterest", name: "Pinterest", color: "#e60023" },
  { id: "google_business", name: "Google Business", color: "#4285f4" },
]);


function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="m3.5 8.8 3.1 3.1 6.9-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlatformMark({ platform, className = "", variant = "default" }) {
  return (
    <span
      className={`landing-platform-mark ${className}`}
      style={{ "--platform-color": platform.color }}
      role="img"
      aria-label={platform.name}
      title={platform.name}
    >
      <PlatformIcon platform={platform.id} size={variant === "hero" ? 32 : 24} variant={variant} />
    </span>
  );
}

function PlatformStrip() {
  return (
    <div className="hero-platforms" aria-label="Supported social platforms">
      {PLATFORMS.map((platform) => <PlatformMark platform={platform} variant="hero" key={platform.id} />)}
    </div>
  );
}


export default function Landing({ onGetStarted }) {
  const [yearlyPricing, setYearlyPricing] = useState(true);

  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-logo-link" href="#top" aria-label="Meadow home">
          <BrandLogo />
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#platforms">Platforms</a>
        </nav>
        <div className="landing-actions">
          <button className="btn-ghost" onClick={onGetStarted}>Sign in</button>
          <button className="btn-small-primary" onClick={onGetStarted}>Start posting <ArrowIcon /></button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="top">
          <div className="hero-copy">
            <PlatformStrip />
            <h1 className="landing-title">Publish across every social media from one place.</h1>
            <p className="landing-subtitle">
              Create text, image, video, and carousel posts. Publish now or schedule them across your connected accounts, then track every delivery in Meadow.
            </p>
            <div className="hero-actions">
              <button className="btn-primary landing-cta" onClick={onGetStarted}>Post for free <ArrowIcon /></button>
            </div>
          </div>
        </section>


        <section className="landing-section platform-section" id="platforms">
          <div className="section-heading platform-heading">
            <span className="section-eyebrow">Supported platforms</span>
            <h2>Ten platforms. One publishing workflow.</h2>
            <p>Connect the accounts you already use and manage each one from the same dashboard.</p>
          </div>
          <div className="platform-grid">
            {PLATFORMS.map((platform) => (
              <article className="platform-card" key={platform.id} style={{ "--platform-color": platform.color }}>
                <PlatformMark platform={platform} />
                <div><h3>{platform.name}</h3></div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="home-pricing-title">
          <div className="home-pricing-heading">
            <h2 id="home-pricing-title">Choose the space your publishing needs.</h2>
            <p>Every plan includes unlimited posts and scheduling. Pick the number of connected accounts and level of support that fit your workflow.</p>
            <div className="pricing-cycle" role="group" aria-label="Billing frequency">
              <button className={!yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(false)}>Monthly</button>
              <button className={yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(true)}>Yearly <span>Save up to 17%</span></button>
            </div>
          </div>
          <div className="pricing-grid" aria-label="Meadow plans">
            {PLANS.map((plan) => {
              const price = yearlyPricing ? plan.yearly : plan.monthly;
              const cycle = yearlyPricing ? "yearly" : "monthly";
              return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}>
                <div className="pricing-card-top">
                  <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
                  {(plan.popular || plan.best) && <span className="pricing-badge">{plan.popular ? "Most popular" : "Best value"}</span>}
                </div>
                <div className="pricing-price"><strong>${price}</strong><span>/month</span></div>
                <p className="pricing-billing-note">{yearlyPricing ? `Billed $${price * 12} yearly` : "Billed monthly"}</p>
                <ul><li className="pricing-account"><CheckIcon />{plan.accounts}</li>{plan.features.map(feature => <li key={feature}><CheckIcon />{feature}</li>)}</ul>
                <a className={plan.popular ? "btn-primary" : "pricing-button"} href={`/pricing?checkout=${encodeURIComponent(plan.id)}&cycle=${cycle}`}>Choose {plan.name} <ArrowIcon /></a>
              </article>;
            })}
          </div>
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="faq-heading">
            <h2>FAQs</h2>
          </div>
          <div className="faq-grid">
            <article className="faq-card">
              <h3>Which social platforms does Meadow support?</h3>
              <p>Meadow supports Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business.</p>
            </article>
            <article className="faq-card">
              <h3>What can I publish?</h3>
              <p>You can create text, image, video, carousel, story, reel, and document posts where the destination supports that format.</p>
            </article>
            <article className="faq-card">
              <h3>Can I publish immediately or schedule posts?</h3>
              <p>Both. Publish right away or choose a future date and time, then monitor drafts, scheduled posts, published posts, and failed deliveries.</p>
            </article>
            <article className="faq-card">
              <h3>Can I use Meadow with an AI agent or my own tools?</h3>
              <p>Yes. Meadow can create private API keys for a CLI, server automation, or an AI agent that calls the Meadow API.</p>
            </article>
            <article className="faq-card">
              <h3>Can Meadow create clips?</h3>
              <p>Clipping is coming soon. Today, you can upload finished media and use Meadow to adapt, schedule, publish, and track each post.</p>
            </article>
          </div>
        </section>

        <section className="landing-cta-section" aria-labelledby="landing-cta-title">
          <div className="landing-cta-content">
            <h2 id="landing-cta-title">Ready to publish?</h2>
            <p>Start posting across every platform from one calm workspace.</p>
            <div className="landing-cta-actions">
              <button className="landing-cta-primary" onClick={onGetStarted}>Start posting free <ArrowIcon /></button>
              <a className="landing-cta-secondary" href="#pricing">View pricing</a>
            </div>
          </div>
        </section>

      </main>

      <footer className="landing-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <BrandLogo />
            <p>Create, schedule, publish, and track from one workspace.</p>
            <p>Meadow is operated by MALIK SEITU MUNYENGE, trading as Woodbark Software.</p>
          </div>
          <div className="footer-links">
            <div><h2>Use Cases</h2><a href="#platforms">Platforms</a><a href="#pricing">Pricing</a></div>
            <div><h2>About</h2><a href="#faq">FAQ</a><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a></div>
            <div><h2>Community</h2><button onClick={onGetStarted}>Create your first post</button><a href="mailto:hello@findmeadow.com">Contact support</a></div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Meadow</span>
        </div>
      </footer>
    </div>
  );
}
