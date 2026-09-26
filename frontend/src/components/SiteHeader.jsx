import { appHref, marketingHref } from "../siteUrls.js";
import BrandLogo from "./BrandLogo.jsx";

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HeaderAction({ children, className, onClick }) {
  return onClick
    ? <button className={className} type="button" onClick={onClick}>{children}</button>
    : <a className={className} href={appHref("/dashboard")}>{children}</a>;
}

export default function SiteHeader({ className = "", homeHref = marketingHref("/"), onSignIn, onStartPosting }) {
  const signIn = onSignIn || onStartPosting;
  const startPosting = onStartPosting || onSignIn;

  return (
    <header className={`landing-header site-header ${className}`.trim()}>
      <a className="landing-logo-link" href={homeHref} aria-label="Meadow home"><BrandLogo /></a>
      <nav className="landing-nav" aria-label="Main navigation">
        <a href={marketingHref("/#platforms")}>Platforms</a>
        <a href={marketingHref("/#ways-to-use")}>API/MCP</a>
        <a href={marketingHref("/free-tools/")}>Free tools</a>
      </nav>
      <div className="landing-actions">
        <HeaderAction className="btn-ghost" onClick={signIn}>Sign in</HeaderAction>
        <HeaderAction className="btn-small-primary" onClick={startPosting}>Start posting <ArrowIcon /></HeaderAction>
      </div>
    </header>
  );
}
