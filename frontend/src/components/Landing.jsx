import { PlatformIcon } from "../bridge/ui.jsx";
import BrandLogo from "./BrandLogo.jsx";
import { sortPlatforms } from "../bridge/platforms.js";

const PLATFORMS = sortPlatforms([
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
]);

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

const CROSSPOST_PLATFORMS = PLATFORMS.filter((platform) => ["facebook", "instagram", "x", "linkedin", "tiktok"].includes(platform.id));
const CROSSPOST_ANGLES = [-90, -18, 54, 126, 198];

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FaqIcon() {
  return (
    <svg className="faq-heading-icon" width="42" height="42" viewBox="0 0 42 42" fill="none" aria-hidden="true">
      <circle cx="18.5" cy="18.5" r="11.5" stroke="currentColor" strokeWidth="2.2" />
      <path d="m27 27 8.5 8.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18.5 13.5v10M13.5 18.5h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
    </svg>
  );
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

function PlatformStrip() {
  return (
    <div className="hero-platforms" aria-label="Supported social platforms">
      {PLATFORMS.map((platform) => <PlatformMark platform={platform} variant="hero" key={platform.id} />)}
    </div>
  );
}

function CrosspostVisual() {
  return (
    <div className="crosspost-visual" role="img" aria-label="A Meadow post connected to Facebook, Instagram, X, LinkedIn, and TikTok">
      <div className="crosspost-lines" aria-hidden="true">
        {CROSSPOST_PLATFORMS.map((platform, index) => (
          <span className="crosspost-line" key={platform.id} style={{ "--platform-angle": `${CROSSPOST_ANGLES[index]}deg` }} />
        ))}
      </div>
      <span className="crosspost-flower-node" aria-hidden="true">
        <svg className="crosspost-line-mark" viewBox="0 0 92 92" fill="none">
          <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M46 39c-3-18-2-27 0-32M46 39c9-17 15-23 20-26M46 39c18-9 27-10 32-9M46 39c17 9 23 15 26 20M46 39c9 18 10 27 9 32M46 39c-9 17-15 23-20 26M46 39c-18 9-27 10-32 9M46 39C29 39 23 33 20 28" strokeWidth="2.4" opacity=".72" />
            <path d="M46 42c-2 15-1 29-7 39M40 69c-8-4-14-3-19 1M48 50c8 2 13 5 17 10" stroke="#36745b" strokeWidth="2.6" />
            <circle cx="46" cy="39" r="5.5" fill="var(--accent)" stroke="none" />
          </g>
        </svg>
      </span>
      <div className="crosspost-platform-nodes" aria-hidden="true">
        {CROSSPOST_PLATFORMS.map((platform, index) => (
          <span className="crosspost-platform-node" key={platform.id} style={{ "--platform-angle": `${CROSSPOST_ANGLES[index]}deg`, "--platform-color": platform.color }}>
            <PlatformIcon platform={platform.id} size={25} />
          </span>
        ))}
      </div>
      <span className="crosspost-visual-caption" aria-hidden="true">One post · many destinations</span>
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
              <button className="btn-primary landing-cta" onClick={onGetStarted}>Post for free <ArrowIcon /></button>
            </div>
          </div>
        </section>

        <section className="landing-section crosspost-section" aria-labelledby="crosspost-title">
          <div className="crosspost-copy">
            <h2 id="crosspost-title">One post, every platform <span>in sync.</span></h2>
            <p>Create once, then send the right version to every connected account from one calm workspace. Meadow keeps the post and its destinations together.</p>
            <div className="crosspost-actions">
              <button className="btn-primary crosspost-cta" onClick={onGetStarted}>Start posting <ArrowIcon /></button>
              <a className="crosspost-secondary" href="#platforms">View platforms</a>
            </div>
          </div>
          <CrosspostVisual />
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

        <section className="landing-section faq-section" id="faq">
          <div className="faq-heading">
            <FaqIcon />
            <span className="section-eyebrow">Good to know</span>
            <h2>FAQs</h2>
            <p>Everything you need to know before your first post.</p>
          </div>
          <div className="faq-grid">
            <article className="faq-card">
              <h3>Which social platforms does Meadow support?</h3>
              <p>Meadow supports Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Pinterest, Threads, Bluesky, and Google Business.</p>
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

      </main>

      <footer className="landing-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <BrandLogo />
            <p>Create, schedule, publish, and track from one workspace.</p>
            <p>Meadow is operated by MALIK SEITU MUNYENGE, trading as Woodbark Software.</p>
          </div>
          <div className="footer-links">
            <div><h2>Use Cases</h2><a href="#platforms">Platforms</a><a href="#features">Features</a><a href="/pricing">Pricing</a></div>
            <div><h2>About</h2><a href="#faq">FAQ</a><a href="/terms">Terms of service</a><a href="/privacy">Privacy policy</a></div>
            <div><h2>Community</h2><button onClick={onGetStarted}>Create your first post</button><a href="mailto:hello@findmeadow.com">Contact support</a></div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Meadow</span>
        </div>
      </footer>
    </div>
  );
}
