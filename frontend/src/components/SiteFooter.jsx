import BrandLogo from "./BrandLogo.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { GENERAL_PAGES } from "../marketing/generalPages.js";
import { appHref, marketingHref, siteSurface } from "../siteUrls.js";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);

// Marketing pages are not served on the app host, so link there absolutely.
const href = path => siteSurface() === "app" ? marketingHref(path) : path;

/** The one footer shared by every public page. */
export default function SiteFooter({ onGetStarted }) {
  return (
    <footer className="landing-footer site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <a className="landing-logo-link" href={href("/")} aria-label="Meadow home"><BrandLogo /></a>
          <p>Create, schedule, publish, and track from one workspace.</p>
        </div>
        <div className="footer-links">
          <div>
            <h2>Platforms</h2>
            {GENERAL_PAGES.map(page => <a href={href(page.path)} key={page.path}>{page.footerLabel}</a>)}
            {PLATFORMS.map(platform => <a href={href(`/${platform.slug}`)} key={platform.id}>{platform.name} publishing</a>)}
          </div>
          <div><h2>Use Cases</h2><a href={href("/#platforms")}>Platforms</a><a href={href("/pricing")}>Pricing</a></div>
          <div><h2>About</h2><a href={href("/#faq")}>FAQ</a><a href={href("/terms")}>Terms of service</a><a href={href("/privacy")}>Privacy policy</a></div>
          <div>
            <h2>Community</h2>
            {onGetStarted ? <button onClick={onGetStarted}>Create your first post</button> : <a href={appHref("/dashboard")}>Create your first post</a>}
            <a href="mailto:hello@findmeadow.com">Contact support</a>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Meadow</span>
      </div>
    </footer>
  );
}
