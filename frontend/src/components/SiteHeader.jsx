import { useEffect, useRef, useState } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { appHref, marketingHref } from "../siteUrls.js";
import BrandLogo from "./BrandLogo.jsx";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function ChevronIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m3.5 5.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HeaderAction({ children, className, onClick }) {
  return onClick
    ? <button className={className} type="button" onClick={onClick}>{children}</button>
    : <a className={className} href={appHref("/dashboard")}>{children}</a>;
}

export default function SiteHeader({ className = "", homeHref = marketingHref("/"), onSignIn, onStartPosting }) {
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  const platformMenuRef = useRef(null);
  const signIn = onSignIn || onStartPosting;
  const startPosting = onStartPosting || onSignIn;

  useEffect(() => {
    if (!platformMenuOpen) return undefined;
    const closeOutside = event => {
      if (!platformMenuRef.current?.contains(event.target)) setPlatformMenuOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key === "Escape") setPlatformMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [platformMenuOpen]);

  return (
    <header className={`landing-header site-header ${className}`.trim()}>
      <a className="landing-logo-link" href={homeHref} aria-label="Meadow home"><BrandLogo /></a>
      <nav className="landing-nav" aria-label="Main navigation">
        <div
          className={`platform-menu ${platformMenuOpen ? "is-open" : ""}`}
          ref={platformMenuRef}
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setPlatformMenuOpen(false);
          }}
        >
          <button className="platform-menu-trigger" type="button" aria-expanded={platformMenuOpen} aria-controls="platform-mega-menu" onClick={() => setPlatformMenuOpen(open => !open)}>
            Platforms <ChevronIcon />
          </button>
          <div className="platform-mega-menu" id="platform-mega-menu" hidden={!platformMenuOpen}>
            <div className="platform-mega-heading">
              <div><strong>Publish everywhere</strong><span>Choose a platform to see how Meadow supports it.</span></div>
              <a href={marketingHref("/#platforms")} onClick={() => setPlatformMenuOpen(false)}>View all platforms <ArrowIcon /></a>
            </div>
            <div className="platform-mega-grid">
              {PLATFORMS.map(platform => (
                <a className="platform-mega-link" href={marketingHref(`/${platform.slug}`)} key={platform.id} onClick={() => setPlatformMenuOpen(false)}>
                  <span className="platform-mega-icon" style={{ "--platform-color": platform.color }} aria-hidden="true"><PlatformIcon platform={platform.id} size={28} /></span>
                  <span><strong>{platform.name}</strong><small>{platform.chatOnly ? "Chat integration" : "Publishing"}</small></span>
                </a>
              ))}
            </div>
          </div>
        </div>
        <a href={marketingHref("/#ways-to-use")}>API/MCP</a>
      </nav>
      <div className="landing-actions">
        <HeaderAction className="btn-ghost" onClick={signIn}>Sign in</HeaderAction>
        <HeaderAction className="btn-small-primary" onClick={startPosting}>Start posting <ArrowIcon /></HeaderAction>
      </div>
    </header>
  );
}
