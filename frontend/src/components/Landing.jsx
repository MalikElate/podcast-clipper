import { useEffect, useRef, useState } from "react";
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
      <span className="hero-agent-logos" aria-hidden="true">
        {AGENT_LOGOS.map((agent) => (
          <span key={agent.name} className={agent.className} title={agent.name}>
            <agent.Icon />
          </span>
        ))}
      </span>
      {copied ? "Setup copied" : "Copy setup prompt"}
    </button>
  );
}

// Marks drift around the copy instead of sitting in a strip above it. Order
// only decides which .hf-* slot each platform lands in; the slots themselves
// are positioned in CSS so the layout stays declarative.
function HeroFloat({ fieldRef }) {
  return (
    <div className="hero-float" aria-hidden="true" ref={fieldRef}>
      {PLATFORMS.map((platform) => (
        <span className={`hero-float-mark hf-${platform.id}`} key={platform.id}>
          <span className="hero-float-card" style={{ "--platform-color": platform.color }}>
            <PlatformIcon platform={platform.id} size={32} variant="hero" />
          </span>
        </span>
      ))}
    </div>
  );
}

// Pointer parallax, skipped for coarse pointers and reduced-motion users. The
// pointer position is stored and applied on an animation frame so a burst of
// move events still writes the custom properties at most once per frame.
function useHeroParallax(heroRef, fieldRef) {
  useEffect(() => {
    const hero = heroRef.current;
    const field = fieldRef.current;
    if (!hero || !field || typeof window.matchMedia !== "function") return undefined;

    const finePointer = window.matchMedia("(pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const enabled = () => finePointer.matches && !reducedMotion.matches;
    let frame;
    let point = null;

    const reset = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = undefined;
      point = null;
      field.style.setProperty("--px", "0px");
      field.style.setProperty("--py", "0px");
    };

    const move = (event) => {
      if (!enabled()) return;
      point = { x: event.clientX, y: event.clientY };
      frame ??= requestAnimationFrame(() => {
        frame = undefined;
        if (!point || !enabled()) return;
        const rect = hero.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        field.style.setProperty("--px", `${(((point.x - rect.left) / rect.width - 0.5) * 36).toFixed(1)}px`);
        field.style.setProperty("--py", `${(((point.y - rect.top) / rect.height - 0.5) * 28).toFixed(1)}px`);
      });
    };

    const sync = () => {
      field.style.setProperty("--parallax-duration", enabled() ? "0.7s" : "0s");
      if (!enabled()) reset();
    };

    hero.addEventListener("pointermove", move);
    hero.addEventListener("pointerleave", reset);
    finePointer.addEventListener("change", sync);
    reducedMotion.addEventListener("change", sync);
    sync();

    return () => {
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", reset);
      finePointer.removeEventListener("change", sync);
      reducedMotion.removeEventListener("change", sync);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [heroRef, fieldRef]);
}


export default function Landing({ onGetStarted }) {
  const [yearlyPricing, setYearlyPricing] = useState(true);
  const heroRef = useRef(null);
  const heroFieldRef = useRef(null);
  useHeroParallax(heroRef, heroFieldRef);

  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-logo-link" href="#top" aria-label="Meadow home">
          <BrandLogo />
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#platforms">Platforms</a>
          <a href="/pricing">Pricing</a>
        </nav>
        <div className="landing-actions">
          <button className="btn-ghost" onClick={onGetStarted}>Sign in</button>
          <button className="btn-small-primary" onClick={onGetStarted}>Start posting <ArrowIcon /></button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="top" ref={heroRef}>
          <HeroFloat fieldRef={heroFieldRef} />
          <div className="hero-copy">
            <h1 className="landing-title">
              <span data-rise>Publish across</span>
              <span data-rise style={{ "--d": "90ms" }}>every social media</span>
              <span data-rise style={{ "--d": "180ms" }}>from one place.</span>
            </h1>
            <p className="landing-subtitle" data-rise style={{ "--d": "300ms" }}>
              Create text, image, video, and carousel posts. Publish now or schedule them across your connected accounts, then track every delivery in Meadow.
            </p>
            <div className="hero-actions" data-rise style={{ "--d": "400ms" }}>
              <button className="btn-primary landing-cta" onClick={onGetStarted}>Post for free <ArrowIcon /></button>
              <AgentSetupCopyButton />
            </div>
          </div>
        </section>


        <section className="landing-section platform-section" id="platforms">
          <div className="platform-section-layout">
            <div className="section-heading platform-heading">
              <span className="section-eyebrow">Supported platforms</span>
              <h2>Ten platforms. One publishing workflow.</h2>
              <p>Connect the accounts you already use and manage each one from the same dashboard.</p>
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

        <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="home-pricing-title">
          <div className="home-pricing-heading">
            <h2 id="home-pricing-title">Choose the space your publishing needs.</h2>
            <p>Every plan includes unlimited posts and scheduling. Pick the number of connected accounts and level of support that fit your workflow.</p>
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
              <h3>Which social platforms does Meadow support?</h3>
              <p>Meadow supports Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business. Telegram and Snapchat are coming soon.</p>
            </article>
            <article className="faq-card">
              <h3>What can I publish?</h3>
              <p>You can create text, image, video, carousel, story, reel, and document posts where the destination supports that format.</p>
            </article>
            <article className="faq-card">
              <h3>Can I publish immediately or schedule posts?</h3>
              <p>Both. Publish right away or choose a future date and time, then monitor drafts, scheduled posts, published posts, and failed deliveries.</p>
            </article>
            <article className="faq-card">
              <h3>Can I use Meadow with an AI agent or my own tools?</h3>
              <p>Yes. Meadow can create private API keys for a CLI, server automation, or an AI agent that calls the Meadow API.</p>
            </article>
            <article className="faq-card">
              <h3>Can Meadow create clips?</h3>
              <p>Clipping is coming soon. Today, you can upload finished media and use Meadow to adapt, schedule, publish, and track each post.</p>
            </article>
          </div>
        </section>

        <section className="landing-cta-section" aria-labelledby="landing-cta-title">
          <div className="landing-cta-content">
            <h2 id="landing-cta-title">Ready to publish?</h2>
            <p>Start posting across every platform from one calm workspace.</p>
            <div className="landing-cta-actions">
              <button className="landing-cta-primary" onClick={onGetStarted}>Start posting free <ArrowIcon /></button>
              <a className="landing-cta-secondary" href="#pricing">View pricing</a>
            </div>
          </div>
        </section>

      </main>

      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
