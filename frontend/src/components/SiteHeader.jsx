import { useEffect, useId, useRef, useState } from "react";
import { appHref, marketingHref, signupHref } from "../siteUrls.js";
import { usePublicAuth } from "../AuthContext.jsx";
import { CONTACT_PHONE_DISPLAY, CONTACT_PHONE_HREF } from "../siteContact.js";
import BrandLogo from "./BrandLogo.jsx";

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function HeaderAction({ children, className, href, onClick }) {
  return onClick
    ? <button className={className} type="button" onClick={onClick}>{children}</button>
    : <a className={className} href={href}>{children}</a>;
}

export default function SiteHeader({ className = "", homeHref = marketingHref("/"), onSignIn, onStartPosting }) {
  const { user, loading } = usePublicAuth();
  const signIn = onSignIn || onStartPosting;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const headerRef = useRef(null);
  const toggleRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event) => {
      if (!headerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const desktop = window.matchMedia("(min-width: 981px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    document.addEventListener("pointerdown", closeOutside);
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [menuOpen]);

  function handleKeyDown(event) {
    if (event.key !== "Escape" || !menuOpen) return;
    event.preventDefault();
    setMenuOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <header className={`landing-header site-header ${className}`.trim()} ref={headerRef} onKeyDown={handleKeyDown} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
    }}>
      <a className="landing-logo-link" href={homeHref} aria-label="Meadow home"><BrandLogo /></a>
      <button className="site-menu-toggle" type="button" ref={toggleRef} aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls={menuId} onClick={() => setMenuOpen(open => !open)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      <div className="site-header-menu" id={menuId} data-open={menuOpen} onClick={(event) => {
        if (event.target.closest("a, button")) setMenuOpen(false);
      }}>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href={marketingHref("/#ways-to-use")}><strong>API/MCP</strong></a>
          <a className="site-human-link" href={CONTACT_PHONE_HREF}><strong>{CONTACT_PHONE_DISPLAY}</strong></a>
          {!user && !loading && <HeaderAction className="site-nav-signin" href={appHref("/sign-in")} onClick={signIn}>Sign in</HeaderAction>}
        </nav>
        <div className="landing-actions">
          <HeaderAction className="btn-small-primary" href={user ? appHref("/dashboard") : signupHref()}>{user ? "Dashboard" : "Try for free"} <ArrowIcon /></HeaderAction>
        </div>
      </div>
    </header>
  );
}
