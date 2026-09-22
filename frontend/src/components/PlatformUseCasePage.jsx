import { useEffect } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import SiteFooter from "./SiteFooter.jsx";
import HeroDemo from "./HeroDemo.jsx";

const PLATFORM_THEMES = {
  twitch: { "--platform-accent": "#9146ff", "--platform-secondary": "#5c16c5", "--platform-highlight": "#c8a8ff", "--platform-surface-from": "#fcfaff", "--platform-surface-to": "#f1eaff", "--platform-action": "#772ce8", "--platform-action-hover": "#5c16c5" },
  kick: { "--platform-accent": "#53fc18", "--platform-secondary": "#238b00", "--platform-highlight": "#b7ff9e", "--platform-surface-from": "#fbfff9", "--platform-surface-to": "#edffe7", "--platform-action": "#1c6f00", "--platform-action-hover": "#155500" },
  x: { "--platform-accent": "#0f1419", "--platform-secondary": "#536471", "--platform-highlight": "#cfd9de", "--platform-surface-from": "#ffffff", "--platform-surface-to": "#f1f3f4", "--platform-action": "#0f1419", "--platform-action-hover": "#272c30" },
  instagram: { "--platform-accent": "#e1306c", "--platform-secondary": "#833ab4", "--platform-highlight": "#f9ce34", "--platform-surface-from": "#fffdf9", "--platform-surface-to": "#f8f3ff", "--platform-action": "#171717", "--platform-action-hover": "#333333" },
  linkedin: { "--platform-accent": "#0a66c2", "--platform-secondary": "#004182", "--platform-highlight": "#70b5f9", "--platform-surface-from": "#fbfdff", "--platform-surface-to": "#eaf4ff", "--platform-action": "#0a66c2", "--platform-action-hover": "#004182" },
  facebook: { "--platform-accent": "#1877f2", "--platform-secondary": "#0866ff", "--platform-highlight": "#8bbcff", "--platform-surface-from": "#fbfdff", "--platform-surface-to": "#edf4ff", "--platform-action": "#0866ff", "--platform-action-hover": "#0759dc" },
  tiktok: { "--platform-accent": "#fe2c55", "--platform-secondary": "#00c9c1", "--platform-highlight": "#25f4ee", "--platform-surface-from": "#fffafa", "--platform-surface-to": "#eefdfc", "--platform-action": "#111111", "--platform-action-hover": "#303030" },
  youtube: { "--platform-accent": "#ff0033", "--platform-secondary": "#b90025", "--platform-highlight": "#ff9aaf", "--platform-surface-from": "#fffafa", "--platform-surface-to": "#fff0f3", "--platform-action": "#ff0033", "--platform-action-hover": "#d9002b" },
  telegram: { "--platform-accent": "#229ed9", "--platform-secondary": "#147bb0", "--platform-highlight": "#87d8f7", "--platform-surface-from": "#fbfeff", "--platform-surface-to": "#eaf8ff", "--platform-action": "#229ed9", "--platform-action-hover": "#1689c2" },
  bluesky: { "--platform-accent": "#1185fe", "--platform-secondary": "#0560df", "--platform-highlight": "#80c5ff", "--platform-surface-from": "#fbfdff", "--platform-surface-to": "#eaf6ff", "--platform-action": "#1185fe", "--platform-action-hover": "#0560df" },
  threads: { "--platform-accent": "#101010", "--platform-secondary": "#555555", "--platform-highlight": "#c7c7c7", "--platform-surface-from": "#ffffff", "--platform-surface-to": "#f2f2f2", "--platform-action": "#101010", "--platform-action-hover": "#303030" },
  pinterest: { "--platform-accent": "#e60023", "--platform-secondary": "#9f0018", "--platform-highlight": "#ff9aac", "--platform-surface-from": "#fffafa", "--platform-surface-to": "#fff0f2", "--platform-action": "#e60023", "--platform-action-hover": "#bd001d" },
  google_business: { "--platform-accent": "#4285f4", "--platform-secondary": "#34a853", "--platform-highlight": "#fbbc05", "--platform-surface-from": "#fbfdff", "--platform-surface-to": "#eef7f0", "--platform-action": "#1a73e8", "--platform-action-hover": "#1557b0" },
};

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PlatformUseCasePage({ platform, onGetStarted }) {
  const headlineSuffix = "organized in one place";
  const headlineLead = platform.headline.slice(0, -headlineSuffix.length).trim();
  const identityLabel = `${platform.name} ${platform.chatOnly ? "chat" : "publishing"}`;
  useEffect(() => {
    document.title = platform.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = platform.description;
  }, [platform]);

  return (
    <div className={`landing platform-use-case is-platform-themed platform-${platform.id}`} style={PLATFORM_THEMES[platform.id]}>
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
                <span>{identityLabel}</span>
              </div>
              <h1 aria-label={platform.headline}><span>{headlineLead}</span><span>{headlineSuffix}</span></h1>
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
