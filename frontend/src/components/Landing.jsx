import { useEffect, useState } from "react";
import { SiClaude, SiCursor } from "react-icons/si";
import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLANS } from "../pricing.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import SiteFooter from "./SiteFooter.jsx";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);


function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="m3.5 8.8 3.1 3.1 6.9-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlatformMark({ platform, className = "", variant = "default" }) {
  return (
    <span
      className={`landing-platform-mark ${className}`}
      style={{ "--platform-color": platform.color }}
      role="img"
      aria-label={platform.name}
      title={platform.name}
    >
      <PlatformIcon platform={platform.id} size={variant === "hero" ? 32 : 24} variant={variant} />
    </span>
  );
}

// Keep this agent briefing aligned with Meadow's API-key authenticated MCP and
// REST contracts. Limits and fields come from the route and service validation.
const AGENT_SETUP = `Meadow publishing API - setup for coding agents

MCP URL: https://findmeadow.com/mcp
Base URL: https://findmeadow.com/api/bridge
Auth header: Authorization: Bearer br_live_...
Create a key in Meadow under Configuration > API Keys. It is shown once.
Read it from the environment; never hardcode or commit it.

MCP tools
  get_profile, list_projects, list_accounts, list_posts, get_post,
  create_draft, get_analytics

Endpoints
  GET   /projects                              list workspaces
  POST  /projects/default                      create or fetch the default workspace
  GET   /projects/{projectId}/accounts         list connected social accounts
  POST  /projects/{projectId}/media            register media for a post
  POST  /projects/{projectId}/posts/preview    validate before publishing
  POST  /projects/{projectId}/posts            publish or schedule
  GET   /projects/{projectId}/posts            delivery status
  GET   /projects/{projectId}/analytics        metrics for published posts

Publish request body
  {
    "requestId": "unique-per-submission",
    "items": [
      {
        "accountIds": ["id from /accounts"],
        "caption": "up to 65000 characters",
        "title": "up to 500 characters, where the platform uses one",
        "mediaIds": ["id from /media"]
      }
    ]
  }

Rules
  - requestId must match [A-Za-z0-9_-]{16,100} and makes the submission
    idempotent. Reusing one with different content returns 409.
  - 1 to 100 posts per request, up to 35 media items per post.
  - Call /posts/preview first: it returns per-destination validation errors.
  - Publishing only happens for content you submit explicitly.`;

function CodexLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
    </svg>
  );
}

const AGENT_LOGOS = [
  { name: "Claude", Icon: SiClaude, className: "is-claude" },
  { name: "Codex", Icon: CodexLogo, className: "is-codex" },
  { name: "Cursor", Icon: SiCursor, className: "is-cursor" },
];

const HOW_STEPS = [
  {
    number: "01",
    title: "Connect your accounts",
    text: "Authorize the social accounts you already use. Meadow keeps each connection organized in one private workspace.",
  },
  {
    number: "02",
    title: "Give your agent one key",
    text: "Create a private Meadow API key, store it in your agent's secret manager, and copy the ready-made setup prompt.",
  },
  {
    number: "03",
    title: "Ask for the campaign",
    text: "Your agent can prepare text, images, video, carousels, titles, timing, and destination-specific settings.",
  },
  {
    number: "04",
    title: "Preview, publish, and track",
    text: "Meadow validates every destination before publishing, then returns delivery status and available performance metrics.",
  },
];
function AgentSetupCopyButton() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2200);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(AGENT_SETUP);
      setCopied(true);
    } catch {
      // A denied clipboard leaves the label alone rather than claiming success.
      setCopied(false);
    }
  }

  return (
    <button type="button" className="hero-agent-copy" onClick={copy} data-copied={copied ? "true" : undefined}>
      <span>{copied ? "Setup copied" : "Copy setup prompt"}</span>
      <span className="hero-agent-logos" aria-hidden="true">
        {AGENT_LOGOS.map((agent) => (
          <span key={agent.name} className={agent.className} title={agent.name}>
            <agent.Icon />
          </span>
        ))}
      </span>
      <svg className="hero-agent-copy-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="5.25" y="2.25" width="7.5" height="8.5" rx="1.25" stroke="currentColor" strokeWidth="1.25" />
        <path d="M3.25 5.5v7.25c0 .69.56 1.25 1.25 1.25h6.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function HeroPlatformRail() {
  return (
    <div className="hero-platform-rail" aria-label="Supported social platforms">
      {PLATFORMS.map((platform) => (
        <span className="hero-platform-item" key={platform.id} title={platform.name} style={{ "--platform-color": platform.color }}>
          <PlatformIcon platform={platform.id} size={24} variant="hero" />
          <span className="sr-only">{platform.name}</span>
        </span>
      ))}
    </div>
  );
}

export default function Landing({ onGetStarted }) {
  const [yearlyPricing, setYearlyPricing] = useState(true);

  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-logo-link" href="#top" aria-label="Meadow home">
          <BrandLogo />
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#platforms">Platforms</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <div className="landing-actions">
          <button className="btn-ghost" onClick={onGetStarted}>Sign in</button>
          <button className="btn-small-primary" onClick={onGetStarted}>Connect an agent <ArrowIcon /></button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="top">
          <div className="hero-copy">
            <h1 className="landing-title">
              <span data-rise>Publish across</span>
              <span data-rise style={{ "--d": "90ms" }}>every social media</span>
              <span data-rise style={{ "--d": "180ms" }}>from your AI agent.</span>
            </h1>
            <p className="landing-subtitle" data-rise style={{ "--d": "300ms" }}>
              Give Claude, Codex, Cursor, or your own automation one secure Meadow key. Your agent can preview, publish, schedule, and track posts across every connected account.
            </p>
            <div className="hero-actions" data-rise style={{ "--d": "400ms" }}>
              <button className="btn-primary landing-cta" onClick={onGetStarted}>Connect your AI agent <ArrowIcon /></button>
              <AgentSetupCopyButton />
            </div>
            <HeroPlatformRail />
          </div>
        </section>


        <section className="landing-section platform-section" id="platforms">
          <div className="platform-section-layout">
            <div className="section-heading platform-heading">
              <span className="section-eyebrow">Supported platforms</span>
              <h2>Every network your agent needs. One publishing API.</h2>
              <p>Connect the accounts you already use once. Your agent gets one consistent workflow for publishing across all ten destinations.</p>
            </div>
            <div className="platform-grid" aria-label="Supported publishing platforms">
              {PLATFORMS.map((platform) => (
                <a className="platform-card" key={platform.id} href={`/${platform.slug}`} aria-label={`Learn about ${platform.name} publishing`} title={platform.name} style={{ "--platform-color": platform.color }}>
                  <PlatformMark platform={platform} />
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section how-section" id="how-it-works" aria-labelledby="how-title">
          <div className="how-heading">
            <span className="section-eyebrow">How it works</span>
            <h2 id="how-title">From agent prompt to published campaign.</h2>
            <p>Meadow gives your AI agent a safe, structured last mile for social publishing—without making it learn ten different platform APIs.</p>
          </div>
          <div className="how-grid">
            {HOW_STEPS.map((step) => (
              <article className="how-card" key={step.number}>
                <span className="how-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
          <div className="how-info-panel">
            <div>
              <span className="how-info-kicker">Built for controlled automation</span>
              <h3>Your agent prepares the work. Meadow validates the delivery.</h3>
            </div>
            <p>Use the preview endpoint before publishing to catch destination-specific issues. Idempotent request IDs prevent accidental duplicates, and every submitted post returns a delivery status your agent can check.</p>
            <AgentSetupCopyButton />
          </div>
        </section>

        <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="home-pricing-title">
          <div className="home-pricing-heading">
            <h2 id="home-pricing-title">Choose the space your publishing needs.</h2>
            <p>Every plan includes unlimited posts, scheduling, and API access for your agent. Choose the number of connected accounts that fits your publishing workflow.</p>
            <div className="pricing-cycle" role="group" aria-label="Billing frequency">
              <button className={!yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(false)}>Monthly</button>
              <button className={yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(true)}>Yearly <span>Save up to 17%</span></button>
            </div>
          </div>
          <div className="pricing-grid" aria-label="Meadow plans">
            {PLANS.map((plan) => {
              const price = yearlyPricing ? plan.yearly : plan.monthly;
              const cycle = yearlyPricing ? "yearly" : "monthly";
              return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}>
                <div className="pricing-card-top">
                  <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
                  {(plan.popular || plan.best) && <span className="pricing-badge">{plan.popular ? "Most popular" : "Best value"}</span>}
                </div>
                <div className="pricing-price"><strong>${price}</strong><span>/month</span></div>
                <p className="pricing-billing-note">{yearlyPricing ? `Billed $${price * 12} yearly` : "Billed monthly"}</p>
                <ul><li className="pricing-account"><CheckIcon />{plan.accounts}</li>{plan.features.map(feature => <li key={feature}><CheckIcon />{feature}</li>)}</ul>
                <a className={plan.popular ? "btn-primary" : "pricing-button"} href={`/pricing?checkout=${encodeURIComponent(plan.id)}&cycle=${cycle}`}>Choose {plan.name} <ArrowIcon /></a>
              </article>;
            })}
          </div>
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="faq-heading">
            <h2>FAQs</h2>
          </div>
          <div className="faq-grid">
            <article className="faq-card">
              <h3>How does an AI agent publish through Meadow?</h3>
              <p>Create a private API key, copy Meadow's setup prompt into your agent, and keep the key in its secret manager. The agent can then preview, publish, schedule, and check delivery status through the Meadow API.</p>
            </article>
            <article className="faq-card">
              <h3>Which social platforms can my agent reach?</h3>
              <p>Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business—all through one Meadow workflow. Telegram and Snapchat are coming soon.</p>
            </article>
            <article className="faq-card">
              <h3>Does Meadow validate posts before publishing?</h3>
              <p>Yes. Your agent can call the preview endpoint first to receive destination-specific validation errors before it submits the campaign.</p>
            </article>
            <article className="faq-card">
              <h3>What can my agent publish?</h3>
              <p>Text, images, video, carousels, stories, reels, and documents where the selected destination supports that format.</p>
            </article>
            <article className="faq-card">
              <h3>Can my agent publish now or schedule later?</h3>
              <p>Both. It can publish immediately or choose a future date and time, then monitor scheduled, published, and failed deliveries from the same API.</p>
            </article>
          </div>
        </section>

        <section className="landing-cta-section" aria-labelledby="landing-cta-title">
          <div className="landing-cta-content">
            <h2 id="landing-cta-title">Turn one agent prompt into posts everywhere.</h2>
            <p>Connect your accounts, copy one secure setup prompt, and let Meadow handle validation, scheduling, delivery, and status.</p>
            <div className="landing-cta-actions">
              <button className="landing-cta-primary" onClick={onGetStarted}>Connect your AI agent <ArrowIcon /></button>
              <a className="landing-cta-secondary" href="#how-it-works">See how it works</a>
            </div>
          </div>
        </section>

      </main>

      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
