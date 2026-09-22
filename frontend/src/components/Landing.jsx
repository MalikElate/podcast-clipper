import { useState } from "react";
import { SiClaude, SiCursor } from "react-icons/si";
import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import HeroDemo from "./HeroDemo.jsx";
import SchedulingDemo from "./SchedulingDemo.jsx";
import PricingComparison from "./PricingComparison.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLANS, planHref, planBillingNote } from "../pricing.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import SiteFooter from "./SiteFooter.jsx";
import { appHref } from "../siteUrls.js";

const PLATFORMS = [
  ...sortPlatforms(PLATFORM_USE_CASES.filter(platform => !platform.chatOnly)),
  ...sortPlatforms(PLATFORM_USE_CASES.filter(platform => platform.chatOnly)),
];
const SHOWCASE_SWAPS = { twitch: "youtube", youtube: "twitch", facebook: "kick", kick: "facebook" };
const SHOWCASE_PLATFORMS = PLATFORMS.map(platform =>
  PLATFORMS.find(item => item.id === (SHOWCASE_SWAPS[platform.id] || platform.id))
);

const PLATFORM_ORBIT_MOTION = [
  [22, 16, "-5deg"],
  [-16, 22, "3deg"],
  [20, -18, "5deg"],
  [-24, 14, "-2deg"],
  [18, -22, "4deg"],
  [-18, 20, "3deg"],
  [24, -16, "-4deg"],
  [-22, -18, "5deg"],
  [16, 24, "-6deg"],
  [-20, 18, "6deg"],
  [18, -20, "-3deg"],
  [-16, 18, "4deg"],
  [20, -16, "-4deg"],
];

const GOALS = [
  {
    id: "grow",
    tab: "Grow your audience",
    title: "Make every release feel like a launch.",
    text: "Plan one coordinated campaign, tailor the message for each channel, and keep every post moving from draft to published.",
    noteA: "Turn one release, announcement, or idea into a coordinated social rollout.",
    noteB: "Keep every message, format, and destination aligned in one campaign.",
    badge: "Launch week",
    accent: "blue",
    posts: ["Teaser", "Launch post", "Follow-up"],
  },
  {
    id: "consistent",
    tab: "Create consistently",
    title: "Keep your calendar full without losing the thread.",
    text: "See what is ready, what needs attention, and what is scheduled next in one clear publishing workspace.",
    noteA: "Build a repeatable weekly plan around the content that matters most.",
    noteB: "See drafts, scheduled posts, and upcoming campaign moments together.",
    badge: "This week",
    accent: "green",
    posts: ["Behind the scenes", "Quick tip", "Weekly recap"],
  },
  {
    id: "repurpose",
    tab: "Repurpose content",
    title: "Give strong content more places to work.",
    text: "Organize platform-ready versions of the same idea together, with the right caption, media, and timing for every destination.",
    noteA: "Organize every version around one strong source idea.",
    noteB: "Adjust the caption, format, and timing for each destination.",
    badge: "Content series",
    accent: "violet",
    posts: ["Main story", "Short clip", "Visual recap"],
  },
  {
    id: "promote",
    tab: "Promote what matters",
    title: "Put the right message on every channel.",
    text: "Prepare the campaign once, preview each destination, and publish now or choose the exact time it should go live.",
    noteA: "Coordinate launches, events, updates, and time-sensitive moments.",
    noteB: "Preview every destination before publishing now or scheduling later.",
    badge: "Campaign ready",
    accent: "orange",
    posts: ["Announcement", "Product story", "Last call"],
  },
];

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CheckIcon() {
  return <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="m3.5 8.8 3.1 3.1 6.9-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function CodexLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" fillRule="evenodd" d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
    </svg>
  );
}

const AGENT_LOGOS = [
  { name: "Claude", Icon: SiClaude, className: "is-claude" },
  { name: "Codex", Icon: CodexLogo, className: "is-codex" },
  { name: "Cursor", Icon: SiCursor, className: "is-cursor" },
];

function PlatformMark({ platform, className = "", variant = "default" }) {
  return (
    <span className={`landing-platform-mark ${className}`} style={{ "--platform-color": platform.color }} role="img" aria-label={platform.name} title={platform.name}>
      <PlatformIcon platform={platform.id} size={variant === "hero" ? 32 : 24} variant={variant} />
    </span>
  );
}

function HeroPlatformRail() {
  return (
    <div className="hero-platform-rail" aria-label="Social publishing destinations">
      {PLATFORMS.map((platform) => (
        <span className="hero-platform-item" key={platform.id} title={platform.name} style={{ "--platform-color": platform.color }}>
          <PlatformIcon platform={platform.id} size={24} variant="hero" />
          <span className="sr-only">{platform.name}</span>
        </span>
      ))}
    </div>
  );
}

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

function movePlatformOrbit(event) {
  const bounds = event.currentTarget.getBoundingClientRect();
  const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1));
  const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1));
  const scale = bounds.width <= 620 ? 0.45 : 1;
  event.currentTarget.querySelectorAll(".orbit-platform-logo").forEach((logo) => {
    logo.style.setProperty("--shift-x", `${x * Number(logo.dataset.motionX) * scale}px`);
    logo.style.setProperty("--shift-y", `${y * Number(logo.dataset.motionY) * scale}px`);
  });
}

function resetPlatformOrbit(event) {
  event.currentTarget.querySelectorAll(".orbit-platform-logo").forEach((logo) => {
    logo.style.setProperty("--shift-x", "0px");
    logo.style.setProperty("--shift-y", "0px");
  });
}

function ScenarioVisual({ goal }) {
  const previewPlatforms = ["instagram", "tiktok", "linkedin"].map((id) => PLATFORMS.find((platform) => platform.id === id)).filter(Boolean);
  return (
    <div className={`scenario-visual accent-${goal.accent}`} aria-label={`${goal.tab} example workflow`}>
      <div className="scenario-topline"><span>{goal.badge}</span><strong>3 posts</strong></div>
      <div className="scenario-calendar">
        {goal.posts.map((post, index) => {
          const platform = previewPlatforms[index % previewPlatforms.length];
          return (
            <article key={post} className="scenario-post">
              <div className="scenario-time"><strong>{["TUE", "THU", "SAT"][index]}</strong><span>{["09:00", "12:30", "17:00"][index]}</span></div>
              <div className="scenario-thumb"><span /><span /></div>
              <div className="scenario-post-copy"><strong>{post}</strong><span>{index === 0 ? "Ready to publish" : index === 1 ? "Scheduled" : "Draft saved"}</span></div>
              {platform && <PlatformMark platform={platform} />}
            </article>
          );
        })}
      </div>
      <div className="scenario-progress"><span /><small>Campaign prepared</small><strong>76%</strong></div>
    </div>
  );
}

function GoalScenarios({ onGetStarted }) {
  return (
    <section className="landing-section goals-section scheduling-use-case" id="workflows" aria-labelledby="goals-title">
      <div className="scheduling-use-case-visual">
        <SchedulingDemo />
      </div>
      <div className="scheduling-use-case-copy">
        <h2 id="goals-title">Plan, repurpose, publish everywhere. <span className="goal-once-highlight">Once!</span></h2>
        <p>Turn one idea into channel-ready posts, tailor each version for its destination, and schedule every connected platform from one Meadow campaign.</p>
        <div className="scheduling-use-case-actions">
          <button type="button" className="scheduling-use-case-primary" onClick={onGetStarted}>Start scheduling <ArrowIcon /></button>
          <a className="scheduling-use-case-secondary" href="#ways-to-use">See how it works</a>
        </div>
      </div>
    </section>
  );
}

export default function Landing({ onGetStarted }) {
  const [yearlyPricing, setYearlyPricing] = useState(true);
  return (
    <div className="landing landing-v2" id="top">
      <header className="landing-header">
        <a className="landing-logo-link" href="#top" aria-label="Meadow home"><BrandLogo /></a>
        <nav className="landing-nav" aria-label="Main navigation"><a href="#platforms">Platforms</a><a href="/pricing">Pricing</a></nav>
        <div className="landing-actions"><button className="btn-ghost" onClick={onGetStarted}>Sign in</button><button className="btn-small-primary" onClick={onGetStarted}>Try for free <ArrowIcon /></button></div>
      </header>

      <main>
        <section className="landing-section platform-section platform-showcase-section" id="platforms">
          <div className="platform-showcase" onPointerDown={movePlatformOrbit} onPointerMove={movePlatformOrbit} onPointerLeave={resetPlatformOrbit} onPointerCancel={resetPlatformOrbit} onPointerUp={resetPlatformOrbit}>
            <div className="platform-showcase-center">
              <h2><span>Plan once. Publish across</span>{" "}<span>the platforms that matter.</span></h2>
              <p>Bring every destination into one consistent Meadow workflow.</p>
              <a className="platform-showcase-button" href={appHref("/dashboard")}>Try for free <ArrowIcon /></a>
            </div>
            <div className="platform-orbit" aria-label="Social publishing platforms">
              {SHOWCASE_PLATFORMS.map((platform, index) => (
                <a className={`orbit-platform-logo orbit-card-${index + 1}`} data-platform={platform.id} data-motion-x={PLATFORM_ORBIT_MOTION[index][0]} data-motion-y={PLATFORM_ORBIT_MOTION[index][1]} key={platform.id} href={`/${platform.slug}`} aria-label={`Learn about ${platform.name} publishing`} title={platform.name} style={{ "--platform-color": platform.color, "--logo-tilt": PLATFORM_ORBIT_MOTION[index][2] }}>
                  <span className="orbit-platform-logo-inner"><PlatformIcon platform={platform.id} size={96} variant={platform.id === "google_business" ? "hero" : "default"} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-hero landing-hero-v2">
          <div className="hero-copy">
            <h1 className="landing-title"><span data-rise style={{ "--d": "70ms" }}>Publish your way.</span><span data-rise style={{ "--d": "150ms" }}>Reach every channel.</span></h1>
            <p className="landing-subtitle" data-rise style={{ "--d": "250ms" }}>Create directly in Meadow, work through an AI agent, or connect your own automation. Every path leads to one clear publishing workspace.</p>
            <div className="hero-actions hero-actions-v2" data-rise style={{ "--d": "340ms" }}><button className="btn-primary landing-cta" onClick={onGetStarted}>Get started <ArrowIcon /></button><a className="hero-text-link" href="#ways-to-use">See ways to use Meadow</a></div>
            <HeroPlatformRail />
          </div>
          <HeroDemo />
        </section>

        <GoalScenarios onGetStarted={onGetStarted} />

        <section className="landing-section audience-section usage-section" id="ways-to-use" aria-labelledby="usage-title">
          <div className="audience-heading">
            <h2 id="usage-title">However you work, publish with Meadow.</h2>
            <p>Draft, preview, and schedule in Meadow. Connect Claude, Codex, or Cursor through MCP to prepare posts for your review, or use the API from your own tools. Your connected accounts and delivery status stay in one workspace.</p>
          </div>
          <div className="usage-grid">
            <article className="usage-card usage-creator">
              <div className="usage-card-media"><img src="/marketing/meadow-creator-studio.webp" alt="A content creator recording and editing in a bright home studio" /></div>
              <div className="usage-card-copy"><h3>For creators and teams</h3><p>Plan, draft, preview, schedule, and publish from Meadow&apos;s visual workspace.</p><ul><li><CheckIcon />Stay hands-on from idea to delivery</li><li><CheckIcon />Save drafts and review every destination</li><li><CheckIcon />Keep your publishing calendar clear</li></ul></div>
            </article>
            <article className="usage-card usage-agents">
              <div className="usage-card-media usage-agent-visual" aria-label="AI agents connected to a Meadow draft">
                <div className="usage-agent-prompt"><span>New request</span><strong>Prepare the launch campaign.</strong></div>
                <div className="usage-agent-row" aria-hidden="true">{AGENT_LOGOS.map((agent) => <span key={agent.name} className={agent.className} title={agent.name}><agent.Icon /></span>)}</div>
                <div className="usage-agent-result"><span className="workflow-brand-dot" /><div><strong>Campaign draft ready</strong><small>4 destinations · waiting for review</small></div></div>
              </div>
              <div className="usage-card-copy"><h3>For agent-assisted publishing</h3><p>Let a supported AI client prepare work through Meadow while you keep visibility and control.</p><ul><li><CheckIcon />Use one private Meadow key</li><li><CheckIcon />Create structured drafts through MCP</li><li><CheckIcon />Review before anything is published</li></ul></div>
            </article>
            <article className="usage-card usage-automation">
              <div className="usage-card-media usage-automation-visual">
                <N8nAutomationBoard />
              </div>
              <div className="usage-card-copy"><h3>For custom workflows</h3><p>Connect internal tools, scheduled jobs, or your own application to Meadow&apos;s publishing layer.</p><ul><li><CheckIcon />Use one consistent API</li><li><CheckIcon />Preview and validate destinations</li><li><CheckIcon />Track delivery programmatically</li></ul></div>
            </article>
          </div>
          <div className="usage-integrations" aria-label="Supported AI clients">
            {AGENT_LOGOS.map((agent) => <span key={agent.name} className={agent.className}><agent.Icon /><span>{agent.name}</span></span>)}
          </div>
          <a className="btn-primary usage-start" href={appHref("/dashboard")}>Open Meadow <ArrowIcon /></a>
        </section>

        <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="home-pricing-title">
          <div className="home-pricing-heading"><h2 id="home-pricing-title">Choose the space your publishing needs.</h2><div className="pricing-cycle" role="group" aria-label="Billing frequency"><button className={!yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(false)}>Monthly</button><button className={yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(true)}>Yearly <span>Save up to 17%</span></button></div></div>
          <div className="pricing-grid" aria-label="Meadow plans">
            {PLANS.map((plan) => {
              const price = yearlyPricing ? plan.yearly : plan.monthly;
              const cycle = yearlyPricing ? "yearly" : "monthly";
              return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}><div className="pricing-card-top"><div><h3>{plan.name}</h3><p>{plan.description}</p></div></div><div className="pricing-price"><strong>${price}</strong><span>/month</span></div><p className="pricing-billing-note">{planBillingNote(plan, yearlyPricing)}</p><div className="pricing-card-divider" aria-hidden="true" /><ul><li className="pricing-account">{plan.accounts}</li>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><a className={plan.popular ? "btn-primary" : "pricing-button"} href={planHref(plan, cycle)}>{plan.id === "free" ? "Try for free" : `Choose ${plan.name}`} <ArrowIcon /></a></article>;
            })}
          </div>
          <PricingComparison yearly={yearlyPricing} onYearlyChange={setYearlyPricing} />
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="faq-heading"><h2>Questions, answered.</h2></div>
          <div className="faq-grid">
            <article className="faq-card"><h3>How can I use Meadow?</h3><p>Create directly in the Meadow workspace, connect a supported AI agent through MCP, or build an automated workflow with the API. All three paths use the same connected accounts and publishing structure.</p></article>
            <article className="faq-card"><h3>Which social platforms can I connect?</h3><p>Meadow supports workflows across all these platforms: Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, Telegram, and Google Business, plus chat integrations for Twitch and Kick. Connect Telegram channels and groups through the Meadow bot. Connection availability can vary by platform status.</p></article>
            <article className="faq-card"><h3>Can I save work before it is published?</h3><p>Yes. You can keep content as a draft, review the destination details, and publish only when it is ready.</p></article>
            <article className="faq-card"><h3>Can I schedule posts?</h3><p>Yes. Choose a future date and time for supported destinations, then follow scheduled and published delivery from Meadow.</p></article>
            <article className="faq-card"><h3>What content formats can I prepare?</h3><p>Prepare text, images, video, carousels, stories, reels, and documents where the selected destination supports that format.</p></article>
            <article className="faq-card"><h3>Can I connect an AI agent or my own app?</h3><p>Yes. Meadow includes API and MCP integration for secure, structured workflows such as creating drafts, previewing posts, publishing, and checking available analytics.</p></article>
          </div>
        </section>

        <section className="landing-cta-section" aria-labelledby="landing-cta-title">
          <div className="landing-cta-content"><h2 id="landing-cta-title">One workspace. However you publish.</h2><p>Start directly, bring an agent, or connect your own automation.</p><div className="landing-cta-actions"><button className="landing-cta-primary" onClick={onGetStarted}>Get started <ArrowIcon /></button><a className="landing-cta-secondary" href="#ways-to-use">Choose your path</a></div></div>
        </section>
      </main>

      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
