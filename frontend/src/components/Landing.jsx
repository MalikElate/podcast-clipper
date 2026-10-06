import { useState } from "react";
import { SiClaude, SiCursor } from "react-icons/si";
import OpenAILogo from "./OpenAILogo.jsx";
import { PlatformIcon } from "../bridge/ui.jsx";
import HeroDemo from "./HeroDemo.jsx";
import PixelMeadow from "./PixelMeadow.jsx";
import SchedulingDemo from "./SchedulingDemo.jsx";
import AgentPublishingDemo from "./AgentPublishingDemo.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLANS, planHref, planBillingNote } from "../pricing.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";
import { signupHref } from "../siteUrls.js";
import { homepageSchema, schemaScriptProps } from "../siteSchema.js";

const HOMEPAGE_RECORDING = {
  asset: "/marketing/meadow-landing-demo-caption-v4-20260929",
  width: 1776,
  height: 1080,
  description: "How to use Meadow: a narrated tour showing the homepage, social account connections, and the post composer with its supported content formats. Use the player controls to play, pause, seek, or adjust the sound.",
};

const PLATFORMS = [
  ...sortPlatforms(PLATFORM_USE_CASES.filter(platform => !platform.chatOnly)),
  ...sortPlatforms(PLATFORM_USE_CASES.filter(platform => platform.chatOnly)),
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


const AGENT_LOGOS = [
  { name: "Claude", Icon: SiClaude, className: "is-claude" },
  { name: "Codex", Icon: OpenAILogo, className: "is-codex" },
  { name: "Cursor", Icon: SiCursor, className: "is-cursor" },
];

function PlatformMark({ platform, className = "", variant = "default", size }) {
  return (
    <span className={`landing-platform-mark ${className}`} style={{ "--platform-color": platform.color }} role="img" aria-label={platform.name} title={platform.name}>
      <PlatformIcon platform={platform.id} size={size ?? (variant === "hero" ? 32 : 24)} variant={variant} />
    </span>
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
  return (
    <section className="landing-section goals-section scheduling-use-case" id="workflows" aria-labelledby="goals-title">
      <div className="scheduling-use-case-copy">
        <h2 id="goals-title">Cross-platform posting</h2>
        <p>Turn one idea into channel-ready posts, tailor each version for its destination, and schedule every connected platform from one Meadow campaign.</p>
        <div className="scheduling-use-case-actions">
          <a className="scheduling-use-case-primary" href={signupHref()}>Try for free <ArrowIcon /></a>
        </div>
      </div>
      <div className="scheduling-use-case-visual">
        <SchedulingDemo />
      </div>
    </section>
  );
}

export default function Landing({ onGetStarted }) {
  const [yearlyPricing, setYearlyPricing] = useState(true);
  return (
    <div className="landing landing-v2 landing-home" id="top">
      <SiteHeader homeHref="#top" onSignIn={onGetStarted} onStartPosting={onGetStarted} />

      <main>
        <section className="landing-hero landing-hero-v2 home-centered-hero" style={{ "--demo-ratio": HOMEPAGE_RECORDING.height / HOMEPAGE_RECORDING.width }}>
          <PixelMeadow />
          <div className="home-hero-top">
            <div className="hero-copy">
              <div className="home-hero-platforms" aria-label="Supported social platforms and AI agents">
                {PLATFORMS.map(platform => <PlatformMark platform={platform} size={32} variant={platform.id === "google_business" ? "hero" : "default"} key={platform.id} />)}
                {AGENT_LOGOS.map(agent => <span className={`home-hero-agent-mark ${agent.className}`} role="img" aria-label={agent.name} title={agent.name} key={agent.name}><agent.Icon /></span>)}
              </div>
              <h1 className="landing-title">creator tools for your AI</h1>
              <p className="landing-subtitle">Plan, tailor, and schedule posts across your social accounts from one Meadow dashboard.</p>
              <div className="hero-actions hero-actions-v2"><a className="btn-primary landing-cta" href={signupHref()}>Try for free <ArrowIcon /></a></div>
            </div>
          </div>
        <div className="home-hero-demo-stage"><HeroDemo recording={HOMEPAGE_RECORDING} /></div>
        </section>

        <section className="landing-section home-platform-section" id="platforms" aria-labelledby="home-platforms-title">
          <div className="home-platform-heading">
            <div><h2 id="home-platforms-title">Show up for every audience.</h2></div>
          </div>
          <div className="home-platform-grid" aria-label="Meadow platforms">
            {PLATFORMS.map(platform => (
              <a className="home-platform-link" key={platform.id} href={`/${platform.slug}/`} aria-label={`Learn about ${platform.name} publishing`} style={{ "--platform-color": platform.color }}>
                <span className="home-platform-icon"><PlatformIcon platform={platform.id} size={40} variant={platform.id === "google_business" ? "hero" : "default"} /></span>
                <span>{platform.name}</span>
              </a>
            ))}
            <div className="home-platform-coming-soon">
              <span>More coming soon</span>
            </div>
          </div>
        </section>

        <GoalScenarios />

        <section className="landing-section scheduling-use-case agent-publishing-section" id="publish-with-an-agent" aria-labelledby="agent-publishing-title">
          <div className="scheduling-use-case-visual">
            <AgentPublishingDemo />
          </div>
          <div className="scheduling-use-case-copy">
            <h2 id="agent-publishing-title">use from your assistant</h2>
            <p>Tell your AI assistant what you want to share. Let it prepare posts for your connected channels, review the details, and give the go-ahead. Meadow takes care of publishing.</p>
            <div className="scheduling-use-case-actions">
              <a className="scheduling-use-case-primary" href={signupHref()}>Try for free <ArrowIcon /></a>
            </div>
          </div>
        </section>

        <section className="landing-section audience-section usage-section" id="ways-to-use" aria-labelledby="usage-title">
          <div className="audience-heading">
            <h2 id="usage-title">However you work, publish with Meadow.</h2>
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
