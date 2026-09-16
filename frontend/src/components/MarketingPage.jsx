import { useEffect, useState } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import BrandLogo from "./BrandLogo.jsx";
import { PLANS } from "../pricing.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { GENERAL_PAGES } from "../marketing/generalPages.js";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);

const PREVIEW = [
  { platform: "youtube", title: "Behind the scenes, episode 12", when: "Tomorrow, 9:00 AM", status: "Scheduled" },
  { platform: "tiktok", title: "3 editing tips in 30 seconds", when: "Friday, 2:00 PM", status: "Scheduled" },
  { platform: "linkedin", title: "What we learned shipping v2", when: "2 hours ago", status: "Published" },
  { platform: "pinterest", title: "Studio setup checklist", when: "Yesterday", status: "Published" },
];

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckIcon() {
  return <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="m3.5 8.8 3.1 3.1 6.9-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlatformMark({ platform, variant = "default" }) {
  return (
    <span className="landing-platform-mark" style={{ "--platform-color": platform.color }} role="img" aria-label={platform.name} title={platform.name}>
      <PlatformIcon platform={platform.id} size={variant === "hero" ? 32 : 24} variant={variant} />
    </span>
  );
}

function PlanGrid() {
  const [yearly, setYearly] = useState(true);
  return (
    <>
      <div className="home-pricing-heading">
        <h2 id="mkt-pricing-title">Get more reach, with less effort.</h2>
        <p>Every plan includes unlimited posts and scheduling. Pick the number of connected accounts and level of support that fit your workflow.</p>
        <div className="pricing-cycle" role="group" aria-label="Billing frequency">
          <button className={!yearly ? "active" : ""} onClick={() => setYearly(false)}>Monthly</button>
          <button className={yearly ? "active" : ""} onClick={() => setYearly(true)}>Yearly <span>Save up to 17%</span></button>
        </div>
      </div>
      <div className="pricing-grid" aria-label="Meadow plans">
        {PLANS.map((plan) => {
          const price = yearly ? plan.yearly : plan.monthly;
          const cycle = yearly ? "yearly" : "monthly";
          return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}>
            <div className="pricing-card-top">
              <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
              {(plan.popular || plan.best) && <span className="pricing-badge">{plan.popular ? "Most popular" : "Best value"}</span>}
            </div>
            <div className="pricing-price"><strong>${price}</strong><span>/month</span></div>
            <p className="pricing-billing-note">{yearly ? `Billed $${price * 12} yearly` : "Billed monthly"}</p>
            <ul><li className="pricing-account"><CheckIcon />{plan.accounts}</li>{plan.features.map(feature => <li key={feature}><CheckIcon />{feature}</li>)}</ul>
            <a className={plan.popular ? "btn-primary" : "pricing-button"} href={`/pricing?checkout=${encodeURIComponent(plan.id)}&cycle=${cycle}`}>Choose {plan.name} <ArrowIcon /></a>
          </article>;
        })}
      </div>
    </>
  );
}

/** Footer links to the cross-platform pages and every platform page. */
export function PlatformFooterLinks() {
  return <>{GENERAL_PAGES.map(page => <a href={page.path} key={page.path}>{page.footerLabel}</a>)}{PLATFORMS.map(platform => <a href={`/${platform.slug}`} key={platform.id}>{platform.name} publishing</a>)}</>;
}

export default function MarketingPage({ page, onGetStarted }) {
  useEffect(() => {
    document.title = page.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = page.description;
  }, [page]);

  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faqs.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) };

  return (
    <div className="landing mkt-page">
      <header className="landing-header">
        <a className="landing-logo-link" href="/" aria-label="Meadow home"><BrandLogo /></a>
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
            <div className="hero-platforms" aria-label="Supported social platforms">
              {PLATFORMS.map(platform => <PlatformMark platform={platform} variant="hero" key={platform.id} />)}
            </div>
            <h1 className="landing-title">{page.headline}</h1>
            <p className="landing-subtitle">{page.subtitle}</p>
            <div className="hero-actions mkt-hero-actions">
              <button className="btn-primary landing-cta" onClick={onGetStarted}>Start scheduling <ArrowIcon /></button>
              <a className="pricing-button mkt-secondary-cta" href="#pricing">View pricing</a>
            </div>
          </div>
        </section>

        {page.steps && (
          <section className="landing-section" aria-labelledby="mkt-steps-title">
            <div className="section-heading"><h2 id="mkt-steps-title">How scheduling works</h2></div>
            <ol className="mkt-card-grid mkt-card-grid-3">
              {page.steps.map((step, index) => <li className="mkt-card" key={step.title}><span className="mkt-card-index">{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}
            </ol>
          </section>
        )}

        {page.problem && (
          <section className="landing-section mkt-problem" aria-labelledby="mkt-problem-title">
            <div className="section-heading"><h2 id="mkt-problem-title">{page.problem.heading}</h2><p>{page.problem.text}</p></div>
          </section>
        )}

        <section className="landing-section" aria-labelledby="mkt-features-title">
          <div className="section-heading">
            <h2 id="mkt-features-title">{page.kind === "cross-posting" ? "One post, made to fit everywhere." : "Built for running more than one account."}</h2>
          </div>
          <div className={`mkt-card-grid ${page.features.length === 4 ? "mkt-card-grid-2" : "mkt-card-grid-3"}`}>
            {page.features.map(item => <article className="mkt-card" key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>)}
          </div>
        </section>

        <section className="landing-section mkt-preview-section" aria-labelledby="mkt-preview-title">
          <div className="mkt-preview-copy">
            <h2 id="mkt-preview-title">Scroll less and publish more.</h2>
            <p>Upload once and send it everywhere it belongs. Meadow takes the repetitive posting off your plate so you can spend your time making the next thing.</p>
            <ul className="mkt-checklist">
              <li><CheckIcon />One upload for every destination</li>
              <li><CheckIcon />A clear status for each platform</li>
              <li><CheckIcon />A link to every live post</li>
            </ul>
          </div>
          <div className="mkt-preview-card" aria-label="Example Meadow publishing queue">
            {["Scheduled", "Published"].map(status => (
              <div className="mkt-preview-group" key={status}>
                <h3>{status}</h3>
                {PREVIEW.filter(item => item.status === status).map(item => (
                  <div className="mkt-preview-row" key={item.title}>
                    <PlatformMark platform={PLATFORMS.find(platform => platform.id === item.platform)} />
                    <div><strong>{item.title}</strong><span>{item.when}</span></div>
                    <em className={status === "Published" ? "published" : ""}>{status}</em>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" id="platforms" aria-labelledby="mkt-platforms-title">
          <div className="section-heading">
            <h2 id="mkt-platforms-title">{page.platformHeading}</h2>
            <p>{page.platformText}</p>
          </div>
          <div className="mkt-platform-links">
            {PLATFORMS.map(platform => (
              <a href={`/${platform.slug}`} key={platform.id} style={{ "--platform-color": platform.color }}>
                <PlatformMark platform={platform} />
                <span>{platform.name}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="mkt-pricing-title">
          <PlanGrid />
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="faq-heading"><h2>Frequently asked questions</h2></div>
          <div className="mkt-faq-list">
            {page.faqs.map(item => <details className="mkt-faq-item" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
        </section>

        <section className="landing-cta-section" aria-labelledby="landing-cta-title">
          <div className="landing-cta-content">
            <h2 id="landing-cta-title">Ready to get started?</h2>
            <p>Start publishing across every platform from one calm workspace.</p>
            <div className="landing-cta-actions">
              <button className="landing-cta-primary" onClick={onGetStarted}>Start posting free <ArrowIcon /></button>
              <a className="landing-cta-secondary" href="#pricing">View pricing</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer platform-use-case-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <a className="landing-logo-link" href="/" aria-label="Meadow home"><BrandLogo /></a>
            <p>Create, schedule, publish, and track from one workspace.</p>
          </div>
          <div className="footer-links">
            <div><h2>Platforms</h2><PlatformFooterLinks /></div>
            <div><h2>Meadow</h2><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a><a href="mailto:hello@findmeadow.com">Contact support</a></div>
          </div>
        </div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} Meadow</span></div>
      </footer>
    </div>
  );
}
