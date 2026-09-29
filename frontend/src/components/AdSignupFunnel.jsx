import { SiClaude } from "react-icons/si";
import { PlatformIcon } from "../bridge/ui.jsx";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { appHref, marketingHref, signupHref } from "../siteUrls.js";
import BrandLogo from "./BrandLogo.jsx";
import HeroDemo from "./HeroDemo.jsx";

const FEATURED_PLATFORM_IDS = ["instagram", "tiktok", "youtube", "facebook", "x", "linkedin"];
const FEATURED_PLATFORMS = FEATURED_PLATFORM_IDS.map(id => PLATFORM_USE_CASES.find(platform => platform.id === id)).filter(Boolean);

const FAQS = [
  ["Is Meadow really free to start?", "Yes. The Free plan includes five connected social accounts, scheduling, and AI agent access. No credit card is required."],
  ["Can I prepare posts from Claude?", "Yes. Connect a supported Claude client to Meadow through MCP, then ask it to create a structured draft. Open Meadow to review, schedule, and publish it."],
  ["Do I have to share my social media passwords?", "No. You connect through each platform’s authorization flow. Meadow never asks for your social account password."],
  ["What happens after I sign up?", "Meadow opens your workspace so you can connect a social account and prepare your first post. You can publish directly in Meadow or connect an AI client when you are ready."],
];

function ArrowIcon() {
  return <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true"><path d="M3 8.5h10M9 4l4.5 4.5L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SignupLink({ children, className = "" }) {
  return <a className={className} href={signupHref()}>{children}</a>;
}

function PublishingFlow() {
  return (
    <div className="ad-funnel-flow" aria-label="A Claude draft prepared in Meadow for six social platforms">
      <div className="ad-funnel-flow-top">
        <span className="ad-funnel-claude"><SiClaude aria-hidden="true" /></span>
        <div><span>Claude</span><strong>Prepare this launch draft for tomorrow morning.</strong></div>
      </div>
      <div className="ad-funnel-connector"><span>Saved to Meadow</span></div>
      <div className="ad-funnel-deliveries">
        <div className="ad-funnel-deliveries-head"><strong>Draft ready for review</strong><span>6 destinations</span></div>
        {FEATURED_PLATFORMS.map((platform) => (
          <div className="ad-funnel-delivery" key={platform.id}>
            <PlatformIcon platform={platform.id} size={22} variant={platform.id === "google_business" ? "hero" : "default"} />
            <span>{platform.name}</span>
            <em>Draft</em>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdSignupFunnel() {
  return (
    <div className="ad-funnel">
      <header className="ad-funnel-header">
        <a href={marketingHref("/")} aria-label="Meadow home"><BrandLogo /></a>
        <div><a className="ad-funnel-sign-in" href={appHref("/dashboard")}>Sign in</a><SignupLink className="ad-funnel-header-cta">Start free</SignupLink></div>
      </header>

      <main>
        <section className="ad-funnel-hero">
          <div className="ad-funnel-hero-copy">
            <h1>Your post is ready. Meadow handles the publishing.</h1>
            <p>Keep creating in Claude or work directly in Meadow. Let Claude prepare a draft through MCP, then review, schedule, and track every delivery in Meadow.</p>
            <div className="ad-funnel-actions">
              <SignupLink className="ad-funnel-primary">Start posting free <ArrowIcon /></SignupLink>
              <a className="ad-funnel-secondary" href="#see-meadow">See Meadow in action</a>
            </div>
            <p className="ad-funnel-free-note"><strong>$0 to start</strong><span>5 social accounts</span><span>No credit card</span></p>
          </div>
          <PublishingFlow />
        </section>

        <section className="ad-funnel-relief" aria-labelledby="ad-funnel-relief-title">
          <div>
            <h2 id="ad-funnel-relief-title">Leave the tab switching behind.</h2>
            <p>One idea should not turn into the same manual task six times. Meadow keeps the content, destinations, timing, and delivery status together.</p>
          </div>
          <ol>
            <li><span>01</span><div><strong>Create where you work</strong><p>Prepare a draft in Claude or compose directly in Meadow.</p></div></li>
            <li><span>02</span><div><strong>Choose every destination</strong><p>Adapt the post for each connected social account.</p></div></li>
            <li><span>03</span><div><strong>Know what went live</strong><p>See the delivery result for every platform in one place.</p></div></li>
          </ol>
        </section>

        <section className="ad-funnel-proof" id="see-meadow" aria-labelledby="ad-funnel-proof-title">
          <div className="ad-funnel-proof-heading">
            <h2 id="ad-funnel-proof-title">From ready to published, without losing your flow.</h2>
            <p>Create one campaign, tailor each destination, then publish now or choose the right time. Meadow keeps every result visible.</p>
          </div>
          <HeroDemo />
        </section>

        <section className="ad-funnel-agent" aria-labelledby="ad-funnel-agent-title">
          <div className="ad-funnel-agent-mark" aria-hidden="true"><SiClaude /></div>
          <div>
            <h2 id="ad-funnel-agent-title">Already creating in Claude? Bring the draft with you.</h2>
            <p>Connect Claude to Meadow through MCP. Your assistant can prepare a structured draft, then you can review its destinations, schedule it, and publish from your Meadow workspace.</p>
            <ul>
              <li>Use one private Meadow key</li>
              <li>Move structured drafts into Meadow</li>
              <li>Keep delivery status in one workspace</li>
            </ul>
            <SignupLink className="ad-funnel-text-link">Create your free workspace <ArrowIcon /></SignupLink>
          </div>
        </section>

        <section className="ad-funnel-free" aria-labelledby="ad-funnel-free-title">
          <div>
            <h2 id="ad-funnel-free-title">Start with the work you already have.</h2>
            <p>Bring your next post. Connect your accounts. Let Meadow take care of the repetitive part.</p>
          </div>
          <div className="ad-funnel-free-offer">
            <span>Free plan</span>
            <strong>$0</strong>
            <p>Five connected social accounts, post scheduling, and AI agent access.</p>
            <SignupLink className="ad-funnel-primary">Sign up free <ArrowIcon /></SignupLink>
            <small>No credit card required.</small>
          </div>
        </section>

        <section className="ad-funnel-faq" aria-labelledby="ad-funnel-faq-title">
          <h2 id="ad-funnel-faq-title">Questions before you start?</h2>
          <div>{FAQS.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
        </section>

        <section className="ad-funnel-final" aria-labelledby="ad-funnel-final-title">
          <h2 id="ad-funnel-final-title">Your next post is already waiting.</h2>
          <p>Give it every place to work—without giving up your afternoon.</p>
          <SignupLink className="ad-funnel-primary">Start posting free <ArrowIcon /></SignupLink>
          <small>Free plan · No credit card required</small>
        </section>
      </main>

      <footer className="ad-funnel-footer">
        <a href={marketingHref("/")} aria-label="Meadow home"><BrandLogo /></a>
        <div><a href={marketingHref("/privacy")}>Privacy</a><a href={marketingHref("/terms")}>Terms</a><a href="mailto:hello@findmeadow.com">Contact</a></div>
      </footer>
    </div>
  );
}
