import { useState } from "react";
import { SiClaude, SiCursor } from "react-icons/si";
import OpenAILogo from "./OpenAILogo.jsx";
import { PLANS, planHref, planBillingNote } from "../pricing.js";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";
import { homepageSchema, schemaScriptProps } from "../siteSchema.js";

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}


const AGENT_LOGOS = [
  { name: "Claude", Icon: SiClaude, className: "is-claude" },
  { name: "Codex", Icon: OpenAILogo, className: "is-codex" },
  { name: "Cursor", Icon: SiCursor, className: "is-cursor" },
];

function N8nAutomationBoard() {
  return (
    <div className="usage-n8n-board" role="img" aria-label="An n8n automation workflow that prepares content, sends it through the Meadow API, validates the schedule, and publishes to connected channels">
      <div className="n8n-board-topbar">
        <span className="n8n-brand-mark" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <strong>n8n</strong>
        <span>Social launch workflow</span>
        <em>Active</em>
      </div>
      <svg className="n8n-board-connections" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M23 57 C29 57 26 32 34 32" />
        <path d="M48 32 C54 32 48 57 56 57" />
        <path d="M70 57 C77 57 72 32 80 32" />
        <path d="M70 57 C77 57 72 77 80 77" />
      </svg>
      <div className="n8n-node n8n-trigger"><span className="n8n-node-icon is-trigger">◷</span><div><small>TRIGGER</small><strong>Weekdays</strong><em>09:00</em></div><b /></div>
      <div className="n8n-node n8n-content"><span className="n8n-node-icon is-content">{`{ }`}</span><div><small>CONTENT</small><strong>Build content</strong><em>Caption + media</em></div><b /></div>
      <div className="n8n-node n8n-meadow"><span className="n8n-node-icon is-meadow">✿</span><div><small>MEADOW API</small><strong>Schedule posts</strong><em>3 destinations</em></div><b /></div>
      <div className="n8n-node n8n-review"><span className="n8n-node-icon is-review">✓</span><div><small>VALIDATE</small><strong>Check posts</strong><em>Ready</em></div><b /></div>
      <div className="n8n-node n8n-publish"><span className="n8n-node-icon is-publish">↗</span><div><small>PUBLISH</small><strong>Channels</strong><span className="n8n-channel-dots"><i className="instagram" /><i className="tiktok" /><i className="linkedin" /></span></div><b /></div>
      <div className="n8n-run-status"><span /> Last run completed <strong>5/5</strong></div>
    </div>
  );
}

export default function Landing({ onGetStarted }) {
  const [yearlyPricing, setYearlyPricing] = useState(true);
  return (
    <div className="landing landing-v2 landing-home" id="top">
      <SiteHeader homeHref="#top" onSignIn={onGetStarted} onStartPosting={onGetStarted} />

      <main>
        <section className="landing-section audience-section usage-section" id="ways-to-use" aria-labelledby="usage-title">
          <div className="audience-heading">
            <h1 id="usage-title">However you work, publish with Meadow.</h1>
          </div>
          <div className="usage-grid">
            <article className="usage-card usage-creator">
              <div className="usage-card-media"><img src="/marketing/meadow-creator-studio.webp" alt="A content creator recording and editing in a bright home studio" /></div>
              <div className="usage-card-copy"><h3>For creators and teams</h3><p>Plan, draft, preview, schedule, and publish from Meadow&apos;s visual workspace.</p><ul><li>Stay hands-on from idea to delivery</li><li>Save drafts and review every destination</li><li>Keep your publishing calendar clear</li></ul></div>
            </article>
            <article className="usage-card usage-agents">
              <div className="usage-card-media usage-agent-visual" aria-label="AI agents connected to a Meadow draft">
                <div className="usage-agent-prompt"><span>New request</span><strong>Prepare the launch campaign.</strong></div>
                <div className="usage-agent-row" aria-hidden="true">{AGENT_LOGOS.map((agent) => <span key={agent.name} className={agent.className} title={agent.name}><agent.Icon /></span>)}</div>
                <div className="usage-agent-result"><span className="workflow-brand-dot" /><div><strong>Campaign draft ready</strong><small>4 destinations · waiting for review</small></div></div>
              </div>
              <div className="usage-card-copy"><h3>For agent-assisted publishing</h3><p>Let a supported AI client prepare work through Meadow while you keep visibility and control.</p><ul><li>Use one private Meadow key</li><li>Create structured drafts through MCP</li><li>Review before anything is published</li></ul></div>
            </article>
            <article className="usage-card usage-automation">
              <div className="usage-card-media usage-automation-visual">
                <N8nAutomationBoard />
              </div>
              <div className="usage-card-copy"><h3>For custom workflows</h3><p>Connect internal tools, scheduled jobs, or your own application to Meadow&apos;s publishing layer.</p><ul><li>Use one consistent API</li><li>Preview and validate destinations</li><li>Track delivery programmatically</li></ul></div>
            </article>
          </div>
        </section>

        <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="home-pricing-title">
          <div className="home-pricing-heading"><h2 id="home-pricing-title">Pricing</h2><div className="pricing-cycle" role="group" aria-label="Billing frequency"><button className={!yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(false)}>Monthly</button><button className={yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(true)}>Yearly <span>Save up to 17%</span></button></div></div>
          <div className="pricing-grid" aria-label="Meadow plans">
            {PLANS.map((plan) => {
              const price = yearlyPricing ? plan.yearly : plan.monthly;
              const cycle = yearlyPricing ? "yearly" : "monthly";
              return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}><div className="pricing-card-top"><div><h3>{plan.name}</h3><p>{plan.description}</p></div></div><div className="pricing-price"><strong>${price}</strong><span>/month</span></div><p className="pricing-billing-note">{planBillingNote(plan, yearlyPricing)}</p><div className="pricing-card-divider" aria-hidden="true" /><ul><li className="pricing-account">{plan.accounts}</li>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><a className={plan.popular ? "btn-primary" : "pricing-button"} href={planHref(plan, cycle)}>{plan.id === "free" ? "Try for free" : `Choose ${plan.name}`} <ArrowIcon /></a></article>;
            })}
          </div>
        </section>

        <section className="landing-section home-faq" id="faq" aria-labelledby="faq-title">
          <div className="home-faq-heading">
            <svg className="home-faq-icon" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
              <path d="m40 40 14 14" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
              <circle cx="25" cy="25" r="19" fill="#dceef6" stroke="currentColor" strokeWidth="6" />
            </svg>
            <h2 id="faq-title">FAQs</h2>
          </div>
          <div className="home-faq-grid">
            <article className="home-faq-item"><h3>How can I use Meadow?</h3><p>Create directly in the Meadow workspace, connect a supported AI agent through MCP, or build an automated workflow with the API. All three paths use the same connected accounts and publishing structure.</p></article>
            <article className="home-faq-item"><h3>Which social platforms can I connect?</h3><p>Meadow supports workflows across all these platforms: Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, Telegram, and Google Business, plus chat integrations for Twitch and Kick. Connect Telegram channels and groups through the Meadow bot. Connection availability can vary by platform status.</p></article>
            <article className="home-faq-item"><h3>Can I save work before it is published?</h3><p>Yes. You can keep content as a draft, review the destination details, and publish only when it is ready.</p></article>
            <article className="home-faq-item"><h3>Can I schedule posts?</h3><p>Yes. Choose a future date and time for supported destinations, then follow scheduled and published delivery from Meadow.</p></article>
            <article className="home-faq-item"><h3>What content formats can I prepare?</h3><p>Prepare text, images, video, carousels, stories, reels, and documents where the selected destination supports that format.</p></article>
            <article className="home-faq-item"><h3>Can I connect an AI agent or my own app?</h3><p>Yes. Meadow includes API and MCP integration for secure, structured workflows such as creating drafts, previewing posts, publishing, and checking available analytics.</p></article>
          </div>
        </section>
      </main>

      <script {...schemaScriptProps(homepageSchema())} />
      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
