import { useEffect } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import SiteFooter from "./SiteFooter.jsx";
import HeroDemo from "./HeroDemo.jsx";

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
              <div className="platform-use-case-identity" role="img" aria-label={platform.name} style={{ "--platform-color": platform.color }}>
                <span className="platform-use-case-icon" aria-hidden="true"><PlatformIcon platform={platform.id} size={30} /></span>
              </div>
              <h1>{platform.headline}</h1>
              <p>{platform.intro}</p>
              <div className="platform-use-case-actions">
                <button className="btn-primary landing-cta" onClick={onGetStarted}>{platform.chatOnly ? "Explore Meadow" : "Start posting"} <ArrowIcon /></button>
                <a className="platform-use-case-secondary" href="/#platforms">Explore all platforms</a>
              </div>
            </div>
            <HeroDemo />
          </div>
        </section>

        <section className="landing-section platform-use-case-details">
          <div className="section-heading">
            <h2>{platform.sectionHeading}</h2>
            <p>{platform.sectionBody}</p>
          </div>
          <ul className="platform-use-case-list" aria-label={`${platform.name} use cases`}>
            {platform.useCases.map(useCase => <li key={useCase}>{useCase}</li>)}
          </ul>
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
