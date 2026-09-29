import { appHref, marketingHref, signupHref } from "../siteUrls.js";
import BrandLogo from "./BrandLogo.jsx";

function SignupLink({ children, className = "" }) {
  return <a className={className} href={signupHref()}>{children}</a>;
}

export default function AdSignupFunnel() {
  return (
    <div className="ad-funnel">
      <header className="ad-funnel-header">
        <a href={marketingHref("/")} aria-label="Meadow home"><BrandLogo /></a>
      </header>

      <main className="ad-funnel-main">
        <section className="ad-funnel-hero" aria-labelledby="ad-funnel-title">
          <h1 id="ad-funnel-title">
            <span>Create once.</span>
            <span>Publish everywhere.</span>
          </h1>
          <p className="ad-funnel-description">
            Create your post once. Tailor, schedule, and track it across your connected social accounts from one workspace.
          </p>
          <SignupLink className="ad-funnel-primary">Start Posting for Free</SignupLink>
          <p className="ad-funnel-free-note">No credit card required. Start with 5 social accounts.</p>
          <div className="ad-funnel-benefits" aria-label="Meadow benefits">
            <span>One post, every channel</span>
            <span>Schedule from one place</span>
            <span>Track every delivery</span>
          </div>
          <p className="ad-funnel-audience">Built for creators, agencies, and teams that publish across multiple platforms.</p>
        </section>
      </main>

      <footer className="ad-funnel-footer">
        <span>Meadow © {new Date().getFullYear()}</span>
        <nav aria-label="Footer links">
          <a href={appHref("/dashboard")}>Sign in</a>
          <a href={marketingHref("/privacy")}>Privacy</a>
          <a href={marketingHref("/terms")}>Terms</a>
        </nav>
      </footer>
    </div>
  );
}
