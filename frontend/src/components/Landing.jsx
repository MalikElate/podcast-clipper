import { useEffect, useMemo, useState } from "react";
import { SiClaude, SiCursor } from "react-icons/si";
import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLANS, planHref, planBillingNote } from "../pricing.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import SiteFooter from "./SiteFooter.jsx";

const PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);

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

const HOW_STEPS = [
  { number: "01", title: "Connect your channels", text: "Bring the social accounts you already use into one private Meadow workspace." },
  { number: "02", title: "Create your campaign", text: "Prepare the message, media, destinations, and timing for each post." },
  { number: "03", title: "Review every version", text: "Preview destination-specific details before anything is submitted." },
  { number: "04", title: "Publish and follow delivery", text: "Publish now or schedule later, then check status from the same workspace." },
];

const AGENT_SETUP = `Meadow publishing API - setup for coding agents

MCP URL: https://findmeadow.com/mcp
Base URL: https://findmeadow.com/api/bridge
Auth header: Authorization: Bearer br_live_...
Create a key in Meadow under Configuration > API Keys. It is shown once.
Read it from the environment; never hardcode or commit it.

MCP tools
  get_profile, list_projects, list_accounts, list_posts, get_post,
  create_draft, get_analytics

Start with list_projects and list_accounts. Use create_draft to prepare work for
review, or use the REST preview endpoint before a publish request.`;

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
      setCopied(false);
    }
  }

  return (
    <button type="button" className="hero-agent-copy" onClick={copy} data-copied={copied ? "true" : undefined}>
      <span>{copied ? "Setup copied" : "Copy agent setup"}</span>
      <span className="hero-agent-logos" aria-hidden="true">
        {AGENT_LOGOS.map((agent) => <span key={agent.name} className={agent.className} title={agent.name}><agent.Icon /></span>)}
      </span>
      <svg className="hero-agent-copy-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.25" y="2.25" width="7.5" height="8.5" rx="1.25" stroke="currentColor" strokeWidth="1.25" /><path d="M3.25 5.5v7.25c0 .69.56 1.25 1.25 1.25h6.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg>
    </button>
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

function HeroWorkflow() {
  const destinations = ["instagram", "tiktok", "linkedin", "youtube"].map((id) => PLATFORMS.find((platform) => platform.id === id)).filter(Boolean);
  return (
    <div className="hero-workflow" aria-label="Illustration of one campaign prepared for multiple social channels">
      <div className="workflow-toolbar"><span className="workflow-brand-dot" /><span>Autumn studio launch</span><span className="workflow-status">Draft saved</span></div>
      <div className="workflow-body">
        <article className="workflow-composer">
          <div className="workflow-composer-head"><span className="workflow-avatar">M</span><div><strong>New campaign</strong><small>4 destinations selected</small></div></div>
          <div className="workflow-media"><span>New collection</span><strong>Made for the way your day moves.</strong></div>
          <p>Meet the collection built for busy mornings, long afternoons, and everything in between.</p>
          <div className="workflow-schedule"><span>Publish</span><strong>Thursday · 10:30 AM</strong></div>
        </article>
        <div className="workflow-routes" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="workflow-destinations">
          {destinations.map((platform, index) => (
            <div className="workflow-destination" key={platform.id} style={{ "--platform-color": platform.color, "--delay": `${index * 80}ms` }}>
              <PlatformMark platform={platform} variant="hero" />
              <div><strong>{platform.name}</strong><span>{index === 2 ? "Company update" : index === 3 ? "Video release" : "Social post"}</span></div>
              <span className="workflow-ready">Ready</span>
            </div>
          ))}
        </div>
      </div>
      <div className="workflow-note">One campaign. The right version for every connected channel.</div>
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

function GoalScenarios() {
  const [activeId, setActiveId] = useState(GOALS[0].id);
  const activeGoal = useMemo(() => GOALS.find((goal) => goal.id === activeId) ?? GOALS[0], [activeId]);
  return (
    <section className="landing-section goals-section" id="workflows" aria-labelledby="goals-title">
      <div className="goals-heading">
        <h2 id="goals-title">What do you want your content to do?</h2>
        <p>Meadow gives every workflow a clear path from idea to published campaign.</p>
      </div>
      <div className="goal-tabs" role="tablist" aria-label="Content goals">
        {GOALS.map((goal) => (
          <button type="button" role="tab" id={`goal-tab-${goal.id}`} aria-controls={`goal-panel-${goal.id}`} aria-selected={activeId === goal.id} className={activeId === goal.id ? "active" : ""} key={goal.id} onClick={() => setActiveId(goal.id)}>{goal.tab}</button>
        ))}
      </div>
      <div className="goal-panel" role="tabpanel" id={`goal-panel-${activeGoal.id}`} aria-labelledby={`goal-tab-${activeGoal.id}`}>
        <div className="goal-panel-copy">
          <h3>{activeGoal.title}</h3>
          <p>{activeGoal.text}</p>
          <div className="goal-audience-notes goal-workflow-notes">
            <div><p>{activeGoal.noteA}</p></div>
            <div><p>{activeGoal.noteB}</p></div>
          </div>
        </div>
        <ScenarioVisual goal={activeGoal} />
      </div>
    </section>
  );
}

export default function Landing({ onGetStarted }) {
  const [yearlyPricing, setYearlyPricing] = useState(true);
  return (
    <div className="landing landing-v2">
      <header className="landing-header">
        <a className="landing-logo-link" href="#top" aria-label="Meadow home"><BrandLogo /></a>
        <nav className="landing-nav" aria-label="Main navigation"><a href="#ways-to-use">Ways to use</a><a href="#workflows">Workflows</a><a href="#platforms">Platforms</a><a href="/pricing">Pricing</a></nav>
        <div className="landing-actions"><button className="btn-ghost" onClick={onGetStarted}>Sign in</button><button className="btn-small-primary" onClick={onGetStarted}>Try for free <ArrowIcon /></button></div>
      </header>

      <main>
        <section className="landing-hero landing-hero-v2" id="top">
          <div className="hero-copy">
            <h1 className="landing-title"><span data-rise style={{ "--d": "70ms" }}>Publish your way.</span><span data-rise style={{ "--d": "150ms" }}>Reach every channel.</span></h1>
            <p className="landing-subtitle" data-rise style={{ "--d": "250ms" }}>Create directly in Meadow, work through an AI agent, or connect your own automation. Every path leads to one clear publishing workspace.</p>
            <div className="hero-actions hero-actions-v2" data-rise style={{ "--d": "340ms" }}><button className="btn-primary landing-cta" onClick={onGetStarted}>Get started <ArrowIcon /></button><a className="hero-text-link" href="#ways-to-use">See ways to use Meadow</a></div>
            <HeroPlatformRail />
          </div>
          <HeroWorkflow />
        </section>

        <section className="landing-section platform-section platform-showcase-section" id="platforms">
          <div className="platform-showcase" onPointerDown={movePlatformOrbit} onPointerMove={movePlatformOrbit} onPointerLeave={resetPlatformOrbit} onPointerCancel={resetPlatformOrbit} onPointerUp={resetPlatformOrbit}>
            <div className="platform-showcase-center">
              <h2>Plan once. Publish across the places that matter.</h2>
              <p>Bring every destination into one consistent Meadow workflow.</p>
              <a className="platform-showcase-button" href="#how-it-works">See how it works <ArrowIcon /></a>
            </div>
            <div className="platform-orbit" aria-label="Social publishing platforms">
              {PLATFORMS.map((platform, index) => (
                <a className={`orbit-platform-logo orbit-card-${index + 1}`} data-platform={platform.id} data-motion-x={PLATFORM_ORBIT_MOTION[index][0]} data-motion-y={PLATFORM_ORBIT_MOTION[index][1]} key={platform.id} href={`/${platform.slug}`} aria-label={`Learn about ${platform.name} publishing`} title={platform.name} style={{ "--platform-color": platform.color, "--logo-tilt": PLATFORM_ORBIT_MOTION[index][2] }}>
                  <span className="orbit-platform-logo-inner"><PlatformIcon platform={platform.id} size={96} variant={platform.id === "google_business" ? "hero" : "default"} /></span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <GoalScenarios />

        <section className="landing-section audience-section usage-section" id="ways-to-use" aria-labelledby="usage-title">
          <div className="audience-heading"><h2 id="usage-title">Three paths. One publishing workspace.</h2><p>Choose the level of control and automation that fits the way you work today. You can move between them whenever your workflow changes.</p></div>
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
                <img src="/marketing/meadow-business-team.webp" alt="A team planning an automated publishing workflow" />
                <div className="usage-automation-flow" aria-label="API and MCP publishing workflow"><span>Trigger</span><strong>API + MCP</strong><span>Connected channels</span></div>
              </div>
              <div className="usage-card-copy"><h3>For custom workflows</h3><p>Connect internal tools, scheduled jobs, or your own application to Meadow&apos;s publishing layer.</p><ul><li><CheckIcon />Use one consistent API</li><li><CheckIcon />Preview and validate destinations</li><li><CheckIcon />Track delivery programmatically</li></ul></div>
            </article>
          </div>
        </section>

        <section className="landing-section how-section" id="how-it-works" aria-labelledby="how-title">
          <div className="how-heading"><h2 id="how-title">However you start, Meadow carries the work forward.</h2><p>The same drafting, review, scheduling, and delivery steps support hands-on creators, agent-assisted work, and automated systems.</p></div>
          <div className="how-grid">{HOW_STEPS.map((step) => <article className="how-card" key={step.number}><span className="how-number">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p></article>)}</div>
          <div className="how-info-panel automation-panel"><div><h3>Direct, agent, and automated work stay together.</h3></div><p>Use one secure Meadow key to connect supported clients or your own workflow. Drafts, previews, publishing, delivery status, and available performance data follow the same structure.</p><AgentSetupCopyButton /></div>
        </section>

        <section className="landing-section home-pricing-section" id="pricing" aria-labelledby="home-pricing-title">
          <div className="home-pricing-heading"><h2 id="home-pricing-title">Choose the space your publishing needs.</h2><p>Start for free, then choose the paid plan that fits your publishing workflow.</p><div className="pricing-cycle" role="group" aria-label="Billing frequency"><button className={!yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(false)}>Monthly</button><button className={yearlyPricing ? "active" : ""} onClick={() => setYearlyPricing(true)}>Yearly <span>Save up to 17%</span></button></div></div>
          <div className="pricing-grid" aria-label="Meadow plans">
            {PLANS.map((plan) => {
              const price = yearlyPricing ? plan.yearly : plan.monthly;
              const cycle = yearlyPricing ? "yearly" : "monthly";
              return <article className={`pricing-card ${plan.popular ? "featured" : ""}`} key={plan.id}><div className="pricing-card-top"><div><h3>{plan.name}</h3><p>{plan.description}</p></div>{(plan.popular || plan.best) && <span className="pricing-badge">{plan.popular ? "Most popular" : "Best value"}</span>}</div><div className="pricing-price"><strong>${price}</strong><span>/month</span></div><p className="pricing-billing-note">{planBillingNote(plan, yearlyPricing)}</p><ul><li className="pricing-account"><CheckIcon />{plan.accounts}</li>{plan.features.map((feature) => <li key={feature}><CheckIcon />{feature}</li>)}</ul><a className={plan.popular ? "btn-primary" : "pricing-button"} href={planHref(plan, cycle)}>{plan.id === "free" ? "Try for free" : `Choose ${plan.name}`} <ArrowIcon /></a></article>;
            })}
          </div>
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="faq-heading"><h2>Questions, answered.</h2></div>
          <div className="faq-grid">
            <article className="faq-card"><h3>How can I use Meadow?</h3><p>Create directly in the Meadow workspace, connect a supported AI agent through MCP, or build an automated workflow with the API. All three paths use the same connected accounts and publishing structure.</p></article>
            <article className="faq-card"><h3>Which social platforms can I connect?</h3><p>Meadow supports workflows across all eleven platforms: Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, Telegram, and Google Business. Connect Telegram channels and groups through the Meadow bot. Connection availability can vary by platform status.</p></article>
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
