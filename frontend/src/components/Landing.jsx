import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import Waveform from "./Waveform.jsx";

const PLATFORMS = [
  { id: "x", name: "X", color: "#171717", formats: "Text, images, video" },
  { id: "instagram", name: "Instagram", color: "#d94686", formats: "Images, video, carousels, stories" },
  { id: "linkedin", name: "LinkedIn", color: "#0a66c2", formats: "Text, images, video, documents" },
  { id: "facebook", name: "Facebook", color: "#1877f2", formats: "Text, images, video, carousels" },
  { id: "tiktok", name: "TikTok", color: "#111111", formats: "Video, images, carousels" },
  { id: "youtube", name: "YouTube", color: "#ff0033", formats: "Video" },
  { id: "bluesky", name: "Bluesky", color: "#168aff", formats: "Text, images, video" },
  { id: "threads", name: "Threads", color: "#111111", formats: "Text, images, video, carousels" },
  { id: "pinterest", name: "Pinterest", color: "#e60023", formats: "Images, video, carousels" },
  { id: "google_business", name: "Google Business", color: "#4285f4", formats: "Updates, images, carousels" },
];

const STEPS = [
  {
    number: "01",
    title: "Connect your social accounts",
    text: "Add the profiles, pages, channels, and business locations you already publish to.",
  },
  {
    number: "02",
    title: "Build one post for every destination",
    text: "Add text, images, video, or a carousel, then tailor the caption and settings for each account.",
  },
  {
    number: "03",
    title: "Publish now or schedule it",
    text: "Send the post immediately or choose a time, then follow every delivery from the queue and calendar.",
  },
];

const FEATURES = [
  {
    eyebrow: "Create",
    title: "One composer for every connected account.",
    text: "Choose several destinations at once, reuse the same media, and make platform-specific changes before anything goes live.",
  },
  {
    eyebrow: "Schedule",
    title: "A clear calendar and queue for every post.",
    text: "See drafts, scheduled posts, published posts, and failed deliveries without checking ten separate apps.",
  },
  {
    eyebrow: "Learn and automate",
    title: "Analytics and API access stay close to the work.",
    text: "Compare post performance, spot what is working, and create private API keys for your own tools or AI agent.",
  },
];

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlatformMark({ platform, className = "" }) {
  return (
    <span
      className={`landing-platform-mark ${className}`}
      style={{ "--platform-color": platform.color }}
      role="img"
      aria-label={platform.name}
      title={platform.name}
    >
      <PlatformIcon platform={platform.id} size={24} />
    </span>
  );
}

function PlatformStrip() {
  return (
    <div className="hero-platforms" aria-label="Supported social platforms">
      {PLATFORMS.map((platform) => <PlatformMark platform={platform} key={platform.id} />)}
    </div>
  );
}

export default function Landing({ onGetStarted }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-logo-link" href="#top" aria-label="Meadow home">
          <BrandLogo />
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#platforms">Platforms</a>
          <a href="#features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-actions">
          <button className="btn-ghost" onClick={onGetStarted}>Sign in</button>
          <button className="btn-small-primary" onClick={onGetStarted}>Start posting <ArrowIcon /></button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="top">
          <div className="hero-copy">
            <PlatformStrip />
            <h1 className="landing-title">Publish across every social media from one place.</h1>
            <p className="landing-subtitle">
              Create text, image, video, and carousel posts. Publish now or schedule them across your connected accounts, then track every delivery in Meadow.
            </p>
            <div className="hero-actions">
              <button className="btn-primary landing-cta" onClick={onGetStarted}>Create your first post <ArrowIcon /></button>
              <a className="text-link" href="#platforms">See supported platforms <ArrowIcon /></a>
            </div>
          </div>
        </section>

        <section className="landing-section platform-section" id="platforms">
          <div className="section-heading platform-heading">
            <span className="section-eyebrow">Supported platforms</span>
            <h2>Ten platforms. One publishing workflow.</h2>
            <p>Connect the accounts you already use and manage each one from the same dashboard.</p>
          </div>
          <div className="platform-grid">
            {PLATFORMS.map((platform) => (
              <article className="platform-card" key={platform.id} style={{ "--platform-color": platform.color }}>
                <PlatformMark platform={platform} />
                <div><h3>{platform.name}</h3><p>{platform.formats}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section steps-section" id="how-it-works">
          <div className="section-heading">
            <span className="section-eyebrow">How Meadow works</span>
            <h2>From connected account to published post.</h2>
            <p>Choose your destinations once. Meadow keeps the media, schedule, and delivery state together.</p>
          </div>
          <div className="step-grid">
            {STEPS.map((step) => (
              <article className="step-card" key={step.number}>
                <span className="step-number">{step.number}</span>
                <div className="step-line" />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section feature-section" id="features">
          <div className="feature-intro">
            <span className="section-eyebrow">Built for daily publishing</span>
            <h2>Everything between upload and published, in one workspace.</h2>
            <p>Meadow gives the work a clear place to move from draft to delivery.</p>
          </div>
          <div className="feature-list">
            {FEATURES.map((feature, index) => (
              <article className="feature-row" key={feature.title}>
                <span className="feature-row-number">0{index + 1}</span>
                <div>
                  <span className="feature-row-eyebrow">{feature.eyebrow}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.text}</p>
                </div>
                <ArrowIcon />
              </article>
            ))}
          </div>
        </section>

        <section className="quote-panel">
          <Waveform className="quote-waveform" bars={22} />
          <p>From draft to scheduled to published, every post stays in view.</p>
          <span>One composer · one calendar · every connected account</span>
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="section-heading compact-heading">
            <span className="section-eyebrow">Good to know</span>
            <h2>Questions before your first post?</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Which social platforms does Meadow support?</summary>
              <p>Meadow supports Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business.</p>
            </details>
            <details>
              <summary>What can I publish?</summary>
              <p>You can create text, image, video, carousel, story, reel, and document posts where the destination supports that format.</p>
            </details>
            <details>
              <summary>Can I publish immediately or schedule posts?</summary>
              <p>Both. Publish right away or choose a future date and time, then monitor drafts, scheduled posts, published posts, and failed deliveries.</p>
            </details>
            <details>
              <summary>Can I use Meadow with an AI agent or my own tools?</summary>
              <p>Yes. Meadow can create private API keys for a CLI, server automation, or an AI agent that calls the Meadow API.</p>
            </details>
            <details>
              <summary>Can Meadow create clips?</summary>
              <p>Clipping is coming soon. Today, you can upload finished media and use Meadow to adapt, schedule, publish, and track each post.</p>
            </details>
          </div>
        </section>

        <section className="landing-cta-panel">
          <div>
            <span className="section-eyebrow">Your social schedule, one place</span>
            <h2>Connect your accounts and send your first post.</h2>
          </div>
          <button className="btn-primary landing-cta" onClick={onGetStarted}>Start posting with Meadow <ArrowIcon /></button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <BrandLogo />
            <p>Create, schedule, publish, and track from one workspace.</p>
          </div>
          <div className="footer-links">
            <div><h2>Use Cases</h2><a href="#how-it-works">How it works</a><a href="#platforms">Platforms</a><a href="#features">Features</a><a href="/pricing">Pricing</a></div>
            <div><h2>About</h2><a href="#faq">FAQ</a><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a></div>
            <div><h2>Community</h2><button onClick={onGetStarted}>Create your first post</button><a href="mailto:hello@findmeadow.com">Contact support</a></div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Meadow</span>
          <span>Publish across your social media from one place.</span>
          <span>Only publish media you have permission to use.</span>
        </div>
      </footer>
    </div>
  );
}
