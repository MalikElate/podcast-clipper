import { useEffect } from "react";
import SiteHeader from "./SiteHeader.jsx";
import SiteFooter from "./SiteFooter.jsx";
import BrandLogo from "./BrandLogo.jsx";
import AgentPublishingDemo from "./AgentPublishingDemo.jsx";
import { PlanGrid } from "./MarketingPage.jsx";
import { PlatformIcon } from "../bridge/ui.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { signupHref } from "../siteUrls.js";
import "./alternativePage.css";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);

function Arrow() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function AlternativePage({ page, onGetStarted }) {
  const competitor = page.competitor || "Hootsuite";
  const checkedDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${page.checkedAt}T00:00:00Z`));
  useEffect(() => {
    document.title = page.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = page.description;
  }, [page]);
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faqs.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) };

  return <div className="landing mkt-page alternative-page">
    <SiteHeader onSignIn={onGetStarted} onStartPosting={onGetStarted} />
    <main>
      <section className="landing-hero alternative-hero" id="top">
        <div className="hero-copy">
          <h1 className="landing-title">{page.headline}</h1>
          <p className="landing-subtitle">{page.subtitle}</p>
          <div className="hero-actions mkt-hero-actions">
            <a className="btn-primary landing-cta" href={signupHref()}>Try Meadow for free <Arrow /></a>
            <a className="alternative-text-link" href="#comparison">Compare Meadow and {competitor} <Arrow /></a>
          </div>
          <p className="alternative-hero-note">Free plan. No credit card required.</p>
        </div>
      </section>

      <section className="landing-section alternative-comparison" id="comparison" aria-labelledby="alternative-comparison-title">
        <div className="section-heading"><h2 id="alternative-comparison-title">Meadow vs. {competitor}</h2><p>Compare the work you need to do, then choose the tool that fits.</p></div>
        <div className="alternative-table-wrap">
          <table className="alternative-table" role="table">
            <caption className="sr-only">Meadow and {competitor} plans and publishing features</caption>
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">What matters</th><th scope="col" role="columnheader"><BrandLogo /></th><th scope="col" role="columnheader">{competitor}</th></tr></thead>
            <tbody role="rowgroup">{page.comparison.map(row => <tr role="row" key={row.feature}><th scope="row" role="rowheader">{row.feature}</th><td role="cell" data-label="Meadow">{row.meadow}</td><td role="cell" data-label={competitor}>{row.competitor ?? row.hootsuite}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="alternative-source-note">{competitor} details checked <time dateTime={page.checkedAt}>{checkedDate}</time>. Sources: {page.sources.map((source, i) => <span key={source.href}>{i > 0 ? ", " : ""}<a href={source.href} target="_blank" rel="noopener noreferrer">{source.label}</a></span>)}. Features and prices can change; confirm the plan and billing terms before subscribing.</p>
        {page.disclosure && <p className="alternative-source-note">{page.disclosure}</p>}
      </section>

      <section className="landing-section alternative-fit" aria-labelledby="alternative-fit-title">
        <h2 id="alternative-fit-title">Choose for the work you do.</h2>
        <div className="alternative-fit-columns">
          <article><h3>When Meadow fits</h3><p>{page.fit?.meadow || "You want a clear place to prepare content, manage several accounts, and keep posts moving. You also want the option to publish from your AI assistant or your own application."}</p></article>
          <article><h3>When {competitor} fits</h3><p>{page.fit?.competitor || "You need publishing alongside a shared customer-care inbox and social listening. Its higher plans add approval workflows, deeper reporting, and enterprise governance."}</p></article>
        </div>
      </section>

      <section className="landing-section alternative-reasons" aria-labelledby="alternative-reasons-title">
        <div className="section-heading"><h2 id="alternative-reasons-title">Why choose Meadow?</h2></div>
        <div className="alternative-reason-list">{page.reasons.map(reason => <article key={reason.title}><h3>{reason.title}</h3><p>{reason.text}</p></article>)}</div>
      </section>

      <section className="landing-section mkt-preview-section" aria-labelledby="alternative-agent-title">
        <div className="mkt-preview-copy"><h2 id="alternative-agent-title">Use the assistant you already work with.</h2><p>Prepare a post from a supported AI client, review its destinations, and give the go-ahead. Meadow takes care of scheduling and publishing to your connected accounts.</p><a className="alternative-text-link" href="/developers/">Explore Meadow’s API and MCP server <Arrow /></a></div>
        <div><AgentPublishingDemo /><p className="alternative-demo-note">Illustrative publishing workflow.</p></div>
      </section>

      <section className="landing-section" id="platforms" aria-labelledby="alternative-platforms-title">
        <div className="section-heading"><h2 id="alternative-platforms-title">Keep every audience in your schedule.</h2><p>Publish across eleven platforms, including Telegram channels and groups. Twitch and Kick support chat messages; available connections and formats depend on each platform.</p></div>
        <div className="mkt-platform-links">{PLATFORMS.map(platform => <a href={`/${platform.slug}/`} key={platform.id} style={{ "--platform-color": platform.color }}><span className="landing-platform-mark" role="img" aria-label={platform.name}><PlatformIcon platform={platform.id} size={24} /></span><span>{platform.name}{platform.chatOnly ? " chat" : ""}</span></a>)}</div>
      </section>

      <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="mkt-pricing-title"><PlanGrid heading="Start free. Choose a plan as you grow." /></section>

      <section className="landing-section faq-section" id="faq" aria-labelledby="alternative-faq-title">
        <div className="faq-heading"><h2 id="alternative-faq-title">Questions about switching</h2></div>
        <div className="mkt-faq-list">{page.faqs.map(item => <details className="mkt-faq-item" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
      </section>

      <section className="landing-cta-section" aria-labelledby="landing-cta-title"><div className="landing-cta-content"><h2 id="landing-cta-title">Make room for your next post.</h2><p>Try Meadow with your own accounts and see how it fits your publishing day.</p><div className="landing-cta-actions"><a className="landing-cta-primary" href={signupHref()}>Try Meadow for free <Arrow /></a><a className="landing-cta-secondary" href="#pricing">View plans</a></div></div></section>
    </main>
    <SiteFooter onGetStarted={onGetStarted} />
  </div>;
}
