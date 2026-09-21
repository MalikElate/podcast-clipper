import { useEffect } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import SiteFooter from "./SiteFooter.jsx";

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PlatformUseCasePage({ platform, onGetStarted }) {
  useEffect(() => {
    document.title = platform.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = platform.description;
  }, [platform]);

  return (
    <div className="landing platform-use-case">
      <header className="landing-header">
        <a className="landing-logo-link" href="/" aria-label="Meadow home"><BrandLogo /></a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="/#platforms">Platforms</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <div className="landing-actions">
          <button className="btn-ghost" onClick={onGetStarted}>Sign in</button>
          <button className="btn-small-primary" onClick={onGetStarted}>{platform.chatOnly ? "Explore Meadow" : "Start posting"} <ArrowIcon /></button>
        </div>
      </header>

      <main>
        <section className="platform-use-case-hero">
          <div className="platform-use-case-hero-grid">
            <div className="platform-use-case-copy">
              <div className="platform-use-case-identity" style={{ "--platform-color": platform.color }}>
                <span className="platform-use-case-icon" aria-hidden="true"><PlatformIcon platform={platform.id} size={30} /></span>
                <span>{platform.name} publishing</span>
              </div>
              <h1>{platform.headline}</h1>
              <p>{platform.intro}</p>
              <div className="platform-use-case-actions">
                <button className="btn-primary landing-cta" onClick={onGetStarted}>{platform.chatOnly ? "Explore Meadow" : "Start posting"} <ArrowIcon /></button>
                <a className="platform-use-case-secondary" href="/#platforms">Explore all platforms</a>
              </div>
            </div>
            <aside className="platform-use-case-panel" aria-label={`Publishing workflow for ${platform.name}`}>
              <p className="platform-use-case-panel-label">One publishing workflow</p>
              <ul>
                <li><span aria-hidden="true">01</span><div><strong>Plan ahead</strong><small>Keep upcoming {platform.name} posts in view.</small></div></li>
                <li><span aria-hidden="true">02</span><div><strong>Schedule publishing</strong><small>Coordinate timing with your other channels.</small></div></li>
                <li><span aria-hidden="true">03</span><div><strong>Follow delivery</strong><small>See post status from the same workspace.</small></div></li>
              </ul>
            </aside>
          </div>
        </section>

        <section className="landing-section platform-use-case-details">
          <div className="section-heading">
            <span className="section-eyebrow">Publishing for {platform.name}</span>
            <h2>{platform.sectionHeading}</h2>
            <p>{platform.sectionBody}</p>
          </div>
          <div className="platform-use-case-grid">
            {platform.useCases.map((useCase, index) => (
              <article className="platform-use-case-card" key={useCase}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{useCase}</h3>
                <p>Plan this {platform.name} activity in Meadow, then keep its publishing timing connected to your wider social calendar.</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-cta-section platform-use-case-cta">
          <div className="landing-cta-content">
            <h2>{platform.chatOnly ? `${platform.name} chat, part of your publishing workflow.` : `Ready to plan your ${platform.name} publishing?`}</h2>
            <p>{platform.chatOnly ? "Explore Meadow’s chat workflows and check connection availability in your workspace." : `Bring your ${platform.name} schedule into Meadow and manage publishing alongside your other social channels.`}</p>
            <div className="landing-cta-actions">
              <button className="landing-cta-primary" onClick={onGetStarted}>{platform.chatOnly ? "Explore Meadow" : "Start posting"} <ArrowIcon /></button>
              <a className="landing-cta-secondary" href="/#platforms">See all platforms</a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
