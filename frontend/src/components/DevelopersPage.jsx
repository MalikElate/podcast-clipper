import { useEffect } from "react";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";
import { appHref, marketingHref } from "../siteUrls.js";
import { DEVELOPERS_DESCRIPTION, DEVELOPERS_TITLE } from "../siteContact.js";
import { usePricingQuote } from "../pricingQuote.js";

export default function DevelopersPage({ onGetStarted }) {
  const { quote } = usePricingQuote();
  useEffect(() => {
    document.title = DEVELOPERS_TITLE;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = DEVELOPERS_DESCRIPTION;
  }, []);

  return (
    <div className="landing dev-page">
      <SiteHeader onSignIn={onGetStarted} onStartPosting={onGetStarted} />

      <main>
        <section className="landing-section dev-hero" aria-labelledby="dev-title">
          <div className="section-heading">
            <h1 id="dev-title">Let an AI client draft, schedule and publish your posts.</h1>
            <p>
              Meadow runs an MCP server so a supported AI client, a script or an automation can read your workspace, upload
              media, and draft, schedule or publish posts across 11 publishing platforms, plus Twitch and Kick chat.
              Publishing is a separate permission you grant when you connect.
            </p>
            <a className="mkt-secondary-cta" href={marketingHref("/docs")}>Read the docs</a>
          </div>
        </section>

        <section className="landing-cta-section">
          <div className="landing-cta-content">
            <h2>Start with a free workspace</h2>
            <p>Create an account, connect a destination, and issue a key from Settings. {quote ? `The free plan covers ${quote.freeAccounts} connected accounts.` : "See pricing for your local free account limit."}</p>
            <div className="landing-cta-actions">
              <a className="landing-cta-primary" href={appHref("/sign-up")}>Create a free account</a>
              <a className="landing-cta-secondary" href={marketingHref("/#ways-to-use")}>See how teams use it</a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
