import { useState } from "react";
import { PlatformIcon } from "../bridge/ui.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { PLANS, planAccounts, planMonthlyPrice, planBillingNote, currencyLabel } from "../pricing.js";
import { usePricingQuote } from "../pricingQuote.js";
import { signupHref } from "../siteUrls.js";
import { schemaScriptProps } from "../siteSchema.js";
import SiteHeader from "./SiteHeader.jsx";
import SiteFooter from "./SiteFooter.jsx";
import PricingQuoteStatus from "./PricingQuoteStatus.jsx";
import HeroDemo from "./HeroDemo.jsx";
import "./multipleAccountsPage.css";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);
const PUBLISHING_PLATFORMS = PLATFORMS.filter(platform => !platform.chatOnly);

function Arrow() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlatformMark({ platform, size = 28 }) {
  return <span className="landing-platform-mark" style={{ "--platform-color": platform.color }} role="img" aria-label={platform.name}><PlatformIcon platform={platform.id} size={size} /></span>;
}

export function AccountPlans() {
  const [yearly, setYearly] = useState(true);
  const { quote, status, retry } = usePricingQuote();
  return <section className="multi-section multi-pricing" id="pricing" aria-labelledby="multi-pricing-title">
    <div className="multi-section-heading">
      <h2 id="multi-pricing-title">A plan for the accounts you run.</h2>
      <p>Your allowance is shared across platforms. Connect 10 accounts on Starter, 25 on Creator, or unlimited accounts on Pro. Paid plans include unlimited posts, subject to each platform’s limits.</p>
    </div>
    <div className="pricing-cycle pricing-cycle-compact" role="group" aria-label="Billing frequency">
      <button type="button" className={!yearly ? "active" : ""} aria-pressed={!yearly} onClick={() => setYearly(false)}>Monthly</button>
      <button type="button" className={yearly ? "active" : ""} aria-pressed={yearly} onClick={() => setYearly(true)}>Yearly <span>Save up to 17%</span></button>
    </div>
    <PricingQuoteStatus quote={quote} status={status} retry={retry} />
    <table className="multi-plan-table">
      <caption className="sr-only">Meadow plans, total connected accounts, and {yearly ? "yearly" : "monthly"} billing prices</caption>
      <thead><tr><th scope="col">Plan</th><th scope="col">Connected accounts</th><th scope="col">Price per month</th></tr></thead>
      <tbody>{PLANS.map(plan => <tr key={plan.id}>
        <th scope="row">{plan.name}</th>
        <td>{planAccounts(plan, quote)}</td>
        <td><strong>{planMonthlyPrice(plan, yearly, quote)}{quote && ` ${currencyLabel(quote)}`}</strong><span>{planBillingNote(plan, yearly, quote)}</span></td>
      </tr>)}</tbody>
    </table>
    <p className="multi-pricing-note">Prices and the Free account allowance depend on your location. <a href="/pricing/">Compare all plan features <Arrow /></a></p>
  </section>;
}

export default function MultipleAccountsPage({ page, onGetStarted }) {
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faqs.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) };
  return <div className="landing mkt-page multiple-accounts-page">
    <SiteHeader onSignIn={onGetStarted} />
    <main>
      <section className="landing-hero multi-hero" id="top">
        <div className="hero-copy">
          <div className="hero-platforms" aria-label="Publishing platforms">{PUBLISHING_PLATFORMS.map(platform => <PlatformMark platform={platform} size={30} key={platform.id} />)}</div>
          <h1 className="landing-title">{page.headline}</h1>
          <p className="landing-subtitle">{page.subtitle}</p>
          <div className="hero-actions mkt-hero-actions">
            <a className="btn-primary landing-cta" href={signupHref()}>Try for free <Arrow /></a>
            <a className="pricing-button mkt-secondary-cta" href="#pricing">See account plans</a>
          </div>
          <p className="multi-hero-note">Start on the Free plan. No credit card required.</p>
        </div>
      </section>

      <AccountPlans />

      <section className="multi-section multi-publishing" aria-labelledby="multi-publishing-title">
        <div className="multi-section-heading">
          <h2 id="multi-publishing-title">Upload once. Give every account its own version.</h2>
          <p>Your video, image, or update starts in one place. Select the accounts it belongs on, tailor each destination, and keep the whole publishing schedule in view.</p>
        </div>
        <HeroDemo />
        <p className="multi-demo-note">Illustrative Meadow walkthrough with sample content.</p>
        <dl className="multi-publishing-details">
          <div><dt>Choose your destinations</dt><dd>Send a post to one account or a mix of connected profiles, pages, and channels.</dd></div>
          <div><dt>Make it fit each audience</dt><dd>Adjust captions, formats, and supported platform settings before publishing.</dd></div>
          <div><dt>Set the right time</dt><dd>Publish now or plan ahead, with a separate publishing time for each account when needed.</dd></div>
          <div><dt>Follow every delivery</dt><dd>See what published and which account needs attention. Each destination keeps its own status.</dd></div>
        </dl>
      </section>

      <section className="multi-section multi-platforms" id="platforms" aria-labelledby="multi-platforms-title">
        <div className="multi-section-heading">
          <h2 id="multi-platforms-title">Several accounts on one network? That works too.</h2>
          <p>Use your allowance for several Instagram accounts, multiple Facebook Pages, or a mix across platforms. You choose the accounts for each post.</p>
        </div>
        <div className="multi-platform-links">{PUBLISHING_PLATFORMS.map(platform => <a href={`/${platform.slug}/`} key={platform.id}><PlatformMark platform={platform} /><span>{platform.name}</span><Arrow /></a>)}</div>
        <div className="multi-chat-platforms">
          <p>Planning community chat as well? Explore Twitch and Kick message scheduling. Chat connections depend on platform configuration and do not upload videos or broadcast live streams.</p>
          <div>{PLATFORMS.filter(platform => platform.chatOnly).map(platform => <a href={`/${platform.slug}/`} key={platform.id}><PlatformMark platform={platform} /><span>{platform.name} chat</span><Arrow /></a>)}</div>
        </div>
      </section>

      <section className="multi-section multi-agent-section" aria-labelledby="multi-agent-title">
        <div><h2 id="multi-agent-title">The same accounts, wherever you create.</h2><p>Work directly in Meadow, connect a supported AI client through MCP, or use the REST API from your own tools. Drafts, schedules, and delivery results stay in the same workspace.</p></div>
        <a href="/developers/">Explore the API and MCP server <Arrow /></a>
      </section>

      <section className="multi-section faq-section" id="faq" aria-labelledby="multi-faq-title">
        <div className="faq-heading"><h2 id="multi-faq-title">Frequently asked questions</h2></div>
        <div className="mkt-faq-list">{page.faqs.map(item => <details className="mkt-faq-item" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
        <script {...schemaScriptProps(faqSchema)} />
      </section>

      <section className="multi-section multi-closing" aria-labelledby="multi-closing-title">
        <h2 id="multi-closing-title">Keep your accounts together. Keep your content moving.</h2>
        <p>Start free, connect your accounts, and prepare your next post in Meadow.</p>
        <a className="btn-primary landing-cta" href={signupHref()}>Try for free <Arrow /></a>
      </section>
    </main>
    <SiteFooter onGetStarted={onGetStarted} />
  </div>;
}
