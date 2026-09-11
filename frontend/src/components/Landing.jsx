import Waveform from "./Waveform.jsx";

const STEPS = [
  {
    number: "01",
    title: "Bring in your media",
    text: "Start with the files, links, and ideas that already power your next piece of content.",
  },
  {
    number: "02",
    title: "Make it fit each channel",
    text: "Shape one idea for every audience without losing the thread that made it worth sharing.",
  },
  {
    number: "03",
    title: "Queue it once. Ship everywhere.",
    text: "Schedule the right version to the right account, then keep an eye on what happens next.",
  },
];

const FEATURES = [
  {
    eyebrow: "Signal over noise",
    title: "Keep every channel in the same conversation.",
    text: "Plan a campaign, adapt the message, and keep the media, captions, accounts, and publishing context together.",
  },
  {
    eyebrow: "Ready to move",
    title: "See what ships and what needs attention.",
    text: "Move from drafts to scheduled to published with clear delivery states and useful performance signals in one workspace.",
  },
];

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="m5 3.5 5 3.5-5 3.5v-7Z" fill="currentColor" />
    </svg>
  );
}

function Logo() {
  return (
    <div className="brand">
      <Waveform className="brand-mark" bars={5} />
      <span className="brand-name">bridge<span className="brand-accent">.</span></span>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <div className="preview-wrap" aria-label="Preview of the Bridge publishing workspace">
      <div className="preview-orbit preview-orbit-a" />
      <div className="preview-orbit preview-orbit-b" />
      <div className="preview-window">
        <div className="preview-window-bar">
          <span className="preview-dots"><i /><i /><i /></span>
          <span className="preview-window-title">bridge / campaign-042</span>
          <span className="preview-live"><span /> ready</span>
        </div>
        <div className="preview-window-body">
          <div className="preview-sidebar">
            <div className="preview-side-brand"><Waveform bars={4} /></div>
            <div className="preview-side-line active" />
            <div className="preview-side-line" />
            <div className="preview-side-line short" />
            <div className="preview-side-spacer" />
            <div className="preview-side-avatar" />
          </div>
          <div className="preview-content">
            <div className="preview-content-heading">
              <div>
                <span className="preview-kicker">this week · 8 posts</span>
                <strong>The creative life, connected</strong>
              </div>
              <span className="preview-chip">ready to publish</span>
            </div>
            <div className="preview-clip-list">
              <div className="preview-clip selected">
                <div className="preview-thumb thumb-one"><Waveform bars={14} /></div>
                <div className="preview-clip-copy"><strong>Make work that compounds</strong><span>Instagram · today 10:00</span></div>
                <span className="preview-score">ready</span>
              </div>
              <div className="preview-clip">
                <div className="preview-thumb thumb-two"><Waveform bars={14} /></div>
                <div className="preview-clip-copy"><strong>The honest first draft</strong><span>LinkedIn · tomorrow 09:00</span></div>
                <span className="preview-score">draft</span>
              </div>
              <div className="preview-clip">
                <div className="preview-thumb thumb-three"><Waveform bars={14} /></div>
                <div className="preview-clip-copy"><strong>Leave room for surprise</strong><span>TikTok · queued</span></div>
                <span className="preview-score">queued</span>
              </div>
            </div>
            <div className="preview-timeline"><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
          </div>
        </div>
      </div>
      <div className="preview-note preview-note-top"><span className="preview-note-dot" /> every channel, one plan</div>
      <div className="preview-note preview-note-bottom"><span className="preview-note-icon"><PlayIcon /></span> platform-ready</div>
    </div>
  );
}

export default function Landing({ onGetStarted }) {
  return (
    <div className="landing">
      <header className="landing-header">
        <a className="landing-logo-link" href="#top" aria-label="Bridge home">
          <Logo />
        </a>
        <nav className="landing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#why-bridge">Why Bridge</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="landing-actions">
          <button className="btn-ghost" onClick={onGetStarted}>Sign in</button>
          <button className="btn-small-primary" onClick={onGetStarted}>Start creating <ArrowIcon /></button>
        </div>
      </header>

      <main>
        <section className="landing-hero" id="top">
          <div className="hero-copy">
            <div className="hero-kicker"><span className="hero-kicker-pulse" /> Your content, connected</div>
            <h1 className="landing-title">Move from idea to published without losing the thread.</h1>
            <p className="landing-subtitle">
              Bridge gives your team one place to turn raw media into platform-ready posts, schedule what’s next, and learn what lands.
            </p>
            <div className="hero-actions">
              <button className="btn-primary landing-cta" onClick={onGetStarted}>Build your first post <ArrowIcon /></button>
              <a className="text-link" href="#how-it-works">See how it works <ArrowIcon /></a>
            </div>
            <div className="hero-proof">
              <span><strong>1</strong> workspace to start</span>
              <span><i /> every channel</span>
              <span><i /> publish with confidence</span>
            </div>
          </div>
          <WorkspacePreview />
        </section>

        <section className="signal-strip" aria-label="Bridge benefits">
          <span className="signal-label">Everything your content needs to move</span>
          <div className="signal-items">
            <span><strong>01</strong> Create across channels</span>
            <span><strong>02</strong> Schedule with context</span>
            <span><strong>03</strong> Learn what lands</span>
          </div>
        </section>

        <section className="landing-section steps-section" id="how-it-works">
          <div className="section-heading">
            <span className="section-eyebrow">A shorter route to good content</span>
            <h2>From raw idea to content that ships.</h2>
            <p>Plan once. Adapt everywhere. Keep the story intact.</p>
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

        <section className="landing-section feature-section" id="why-bridge">
          <div className="feature-intro">
            <span className="section-eyebrow">Made for the messy middle</span>
            <h2>The part after making something should not scatter across six tools.</h2>
            <p>Bridge keeps the plan, the post, and the result in the same conversation.</p>
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
          <p>“The next post is already in the work. Bridge helps it travel.”</p>
          <span>Bridge, for the work between the idea and the publish button</span>
        </section>

        <section className="landing-section faq-section" id="faq">
          <div className="section-heading compact-heading">
            <span className="section-eyebrow">Good to know</span>
            <h2>Questions before you press play?</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>What can I manage in Bridge?</summary>
              <p>Bring in media, write posts, connect accounts, schedule content, and monitor results across the channels where your audience already is.</p>
            </details>
            <details>
              <summary>Do I need to know how to edit video?</summary>
              <p>No. Build a post once, adapt it for each destination, and keep the schedule and delivery state visible from one place.</p>
            </details>
            <details>
              <summary>Can Bridge help with clips?</summary>
              <p>Yes. The clipping studio can turn permitted source media into vertical, captioned clips that are ready to add to your publishing queue.</p>
            </details>
          </div>
        </section>

        <section className="landing-cta-panel">
          <div>
            <span className="section-eyebrow">Your next post is already in the work</span>
            <h2>Make it easier to ship the good stuff.</h2>
          </div>
          <button className="btn-primary landing-cta" onClick={onGetStarted}>Get started with Bridge <ArrowIcon /></button>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="footer-main">
          <div className="footer-brand">
            <Logo />
            <p>Plan, publish, and learn from the same workspace.</p>
          </div>
          <div className="footer-links">
            <div><span>Explore</span><a href="#how-it-works">How it works</a><a href="#why-bridge">Why Bridge</a><a href="#faq">FAQ</a></div>
            <div><span>Get started</span><button onClick={onGetStarted}>Create your first post</button><a href="mailto:hello@findmeadow.com">Contact us</a></div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Bridge</span>
          <span>Made for the work that moves people.</span>
          <span>Only process media you have permission to use.</span>
        </div>
      </footer>
    </div>
  );
}
