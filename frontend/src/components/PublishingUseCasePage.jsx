import { PlatformIcon } from "../bridge/ui.jsx";
import { sortPlatforms } from "../bridge/platforms.js";
import { PLATFORM_USE_CASES } from "../platformUseCases.js";
import { PUBLISHING_PAGES } from "../marketing/publishingPages.js";
import { AGENT_API_PAGES } from "../marketing/agentApiPages.js";
import { signupHref } from "../siteUrls.js";
import { schemaScriptProps } from "../siteSchema.js";
import { AccountPlans } from "./MultipleAccountsPage.jsx";
import SiteHeader from "./SiteHeader.jsx";
import SiteFooter from "./SiteFooter.jsx";
import HeroDemo from "./HeroDemo.jsx";
import "./publishingUseCasePage.css";

const ALL_PLATFORMS = sortPlatforms(PLATFORM_USE_CASES);
const PLATFORMS = ALL_PLATFORMS.filter(platform => !platform.chatOnly);
const CALENDAR_EVENTS = [
  { day: 8, platform: "instagram", title: "New collection Reel", time: "09:00", status: "Scheduled" },
  { day: 10, platform: "linkedin", title: "Studio launch", time: "14:00", status: "Scheduled" },
  { day: 15, platform: "tiktok", title: "Behind the scenes", time: "11:00", status: "Finish in TikTok" },
  { day: 18, platform: "facebook", title: "Weekend opening hours", time: "10:00", status: "Scheduled" },
];
const BATCH_REQUEST = JSON.stringify({
  requestId: "studio-batch-20300108",
  items: [
    { caption: "Meet our new collection.", format: "image", mediaIds: ["UPLOADED_IMAGE_ID"], accountIds: ["INSTAGRAM_ACCOUNT_ID"], schedule: { mode: "scheduled", localDateTime: "2030-01-08T09:00", timeZone: "Africa/Douala" } },
    { caption: "A look inside our studio.", format: "text", accountIds: ["LINKEDIN_ACCOUNT_ID"], schedule: { mode: "scheduled", localDateTime: "2030-01-10T14:00", timeZone: "Africa/Douala" } },
  ],
}, null, 2);

function Arrow() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function PlatformMark({ id, size = 28 }) {
  const platform = ALL_PLATFORMS.find(item => item.id === id);
  return <span className="landing-platform-mark" role="img" aria-label={platform.name}><PlatformIcon platform={id} size={size} /></span>;
}

function AccountExample({ platform }) {
  return <div className="use-case-example" aria-label={`Illustrative ${platform} account versions`}>
    <div className="use-case-example-heading"><strong>Collection launch</strong><span>One uploaded video</span></div>
    <div className="use-case-account-version"><PlatformMark id={platform} /><div><h3>Meadow Studio</h3><p>Meet the collection. Made for the everyday.</p></div><span>8 Jan · 09:00<br />Scheduled</span></div>
    <div className="use-case-account-version"><PlatformMark id={platform} /><div><h3>Meadow Studio Douala</h3><p>The new collection is here. Visit us in Douala this week.</p></div><span>8 Jan · 12:00<br />Scheduled</span></div>
    <p className="use-case-example-note">Illustrative accounts, captions, and schedules. No posts are sent from this example.</p>
  </div>;
}

function CalendarExample() {
  return <div className="use-case-example use-case-calendar-example">
    <div className="use-case-example-heading"><strong>January 2030</strong><span>Illustrative monthly view</span></div>
    <div className="use-case-calendar" aria-label="Illustrative January 2030 content calendar">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <div className="use-case-weekday" key={day}>{day}</div>)}
      {Array.from({ length: 35 }, (_, index) => {
        const day = index >= 1 && index <= 31 ? index : null;
        const event = CALENDAR_EVENTS.find(item => item.day === day);
        return <div className={`use-case-calendar-day ${event ? "has-event" : ""}`} key={index}><span>{day}</span>{event && <div><PlatformMark id={event.platform} size={18} /><strong>{event.title}</strong><small>{event.time} · {event.status}</small></div>}</div>;
      })}
    </div>
    <ul className="use-case-calendar-agenda">{CALENDAR_EVENTS.map(event => <li key={event.day}><PlatformMark id={event.platform} size={22} /><div><strong>{event.title}</strong><span>January {event.day} · {event.time} · {event.status}</span></div></li>)}</ul>
    <p className="use-case-example-note">Sample content and dates. This is an illustration of planning, not your live Meadow calendar.</p>
  </div>;
}

function WorkflowPreview({ page }) {
  if (page.preview === "agent") return <div className="use-case-example use-case-agent-example">
    <h3>A prompt to start with</h3>
    <blockquote>{page.prompt}</blockquote>
    <ol aria-label="Meadow tool workflow">{page.toolFlow.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="use-case-example-note">Illustrative prompt and workflow. This example does not connect an account or submit a post.</p>
  </div>;
  if (page.preview === "code") return <div className="use-case-example use-case-api-example">
    <h3>{page.codeLabel}</h3>
    <pre tabIndex="0" aria-label={page.codeLabel}><code>{page.code}</code></pre>
    <p className="use-case-example-note">{page.codeNote}</p>
  </div>;
  if (page.preview === "comparison") return <div className="use-case-comparison" role="region" aria-label="Social publishing tool comparison" tabIndex="0">
    <table><thead><tr><th scope="col">Tool or approach</th><th scope="col">Connection</th><th scope="col">What to evaluate</th></tr></thead><tbody>{page.comparison.map(row => <tr key={row.name}><th scope="row">{row.href ? <a href={row.href}>{row.name}</a> : row.name}</th><td>{row.connection}</td><td>{row.fit}</td></tr>)}</tbody></table>
  </div>;
  if (["tiktok", "instagram"].includes(page.preview)) return <AccountExample platform={page.preview} />;
  if (page.preview === "calendar") return <CalendarExample />;
  if (page.preview === "bulk") return <div className="use-case-example use-case-api-example">
    <h3>Example batch request</h3>
    <p>Authenticated POST to <code>/api/bridge/projects/PROJECT_ID/posts/preview</code>, then <code>/posts</code> to submit.</p>
    <pre tabIndex="0" aria-label="Example Meadow batch scheduling JSON"><code>{BATCH_REQUEST}</code></pre>
    <p className="use-case-example-note">Replace the project, account, and media IDs with your own. Choose future dates and a time zone. Use an Authorization: Bearer header with your private Meadow API key.</p>
    <a href="/developers/">Read the full API contract <Arrow /></a>
  </div>;
  if (page.preview === "comment") return <div className="use-case-example use-case-comment-example">
    <div><h3>Main post · scheduled in Meadow</h3><p>A look inside our studio. Here is what goes into every piece.</p></div>
    <div><h3>Prepared comment · added manually</h3><p>More about our materials and process: findmeadow.com. What would you like to see us make next?</p></div>
    <p className="use-case-example-note">Illustrative copy. Keep the comment in your notes and paste it in the platform after the main post is live.</p>
  </div>;
  return <div className="use-case-example" aria-label="Illustrative agency publishing destinations">
    <div className="use-case-example-heading"><strong>Today’s publishing plan</strong><span>Sample client accounts</span></div>
    {[{ platform: "instagram", name: "Harbor Café", text: "Weekend menu Reel", time: "09:00" }, { platform: "linkedin", name: "Northlight Studio", text: "New studio announcement", time: "14:00" }, { platform: "facebook", name: "Harbor Café · Facebook Page", text: "Updated opening hours", time: "16:00" }].map(item => <div className="use-case-account-version" key={item.name}><PlatformMark id={item.platform} /><div><h3>{item.name}</h3><p>{item.text}</p></div><span>{item.time}<br />Scheduled</span></div>)}
    <p className="use-case-example-note">Illustrative accounts in one workspace. This example does not represent separate client portals.</p>
  </div>;
}

export default function PublishingUseCasePage({ page, onGetStarted }) {
  const platforms = page.platformIds ? PLATFORMS.filter(platform => page.platformIds.includes(platform.id)) : PLATFORMS;
  const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: page.faqs.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) };
  return <div className="landing mkt-page multiple-accounts-page publishing-use-case-page">
    <SiteHeader onSignIn={onGetStarted} />
    <main>
      <section className="landing-hero multi-hero" id="top">
        <div className="hero-copy">
          <div className="hero-platforms" aria-label="Publishing platforms">{platforms.map(platform => <PlatformMark id={platform.id} size={30} key={platform.id} />)}</div>
          <h1 className="landing-title">{page.headline}</h1>
          <p className="landing-subtitle">{page.subtitle}</p>
          {page.heroNote && <p className="use-case-hero-notice">{page.heroNote}</p>}
          <div className="hero-actions mkt-hero-actions"><a className="btn-primary landing-cta" href={signupHref()}>{page.action} <Arrow /></a><a className="pricing-button mkt-secondary-cta" href={page.secondary.href}>{page.secondary.label}</a></div>
          <p className="multi-hero-note">Start on the Free plan. No credit card required.</p>
        </div>
      </section>

      <section className="multi-section use-case-workflow" id="workflow" aria-labelledby="use-case-workflow-title">
        <div className="multi-section-heading"><h2 id="use-case-workflow-title">{page.previewHeading}</h2><p>{page.previewText}</p></div>
        <WorkflowPreview page={page} />
        <dl className="multi-publishing-details">{page.details.map(item => <div key={item.title}><dt>{item.title}</dt><dd>{item.text}</dd></div>)}</dl>
      </section>

      {page.guide && <section className="multi-section use-case-guide" aria-labelledby="use-case-guide-title"><h2 id="use-case-guide-title">{page.path.startsWith("/blog/") ? "Follow the workflow from setup to delivery." : "Put the workflow into practice."}</h2>{page.guide.map(item => <div key={item.title}><h3>{item.title}</h3><p>{item.text}</p></div>)}{page.sources && <p className="use-case-sources">Client setup references: {page.sources.map(source => <a href={source.href} key={source.href}>{source.label}</a>)}. Checked 12 October 2026.</p>}</section>}

      <section className="multi-section use-case-scope" aria-labelledby="use-case-scope-title"><h2 id="use-case-scope-title">{page.noteHeading}</h2><p>{page.noteText}</p></section>

      {page.preview !== "comment" && <section className="multi-section" aria-labelledby="use-case-demo-title"><div className="multi-section-heading"><h2 id="use-case-demo-title">See Meadow’s publishing workspace.</h2><p>Create and preview a post, then follow the result for each destination. The same workflow is available through the API and a connected chatbot.</p></div><HeroDemo /><p className="multi-demo-note">Illustrative Meadow walkthrough with sample content on LinkedIn, Threads, and Bluesky.</p></section>}

      <AccountPlans />

      <section className="multi-section" aria-labelledby="use-case-platforms-title"><div className="multi-section-heading"><h2 id="use-case-platforms-title">Keep your other accounts in the same plan.</h2><p>Explore Meadow’s publishing options across 11 platforms. Formats, account eligibility, and permissions depend on the destination.</p></div><div className="multi-platform-links">{PLATFORMS.map(platform => <a href={`/${platform.slug}/`} key={platform.id}><PlatformMark id={platform.id} /><span>{platform.name}</span><Arrow /></a>)}</div><div className="multi-chat-platforms"><p>Twitch and Kick support scheduled chat, not video uploads or live broadcasts. Connections depend on platform configuration.</p><div>{ALL_PLATFORMS.filter(platform => platform.chatOnly).map(platform => <a href={`/${platform.slug}/`} key={platform.id}><PlatformMark id={platform.id} /><span>{platform.name} chat</span></a>)}</div></div></section>

      <section className="multi-section" id="faq" aria-labelledby="use-case-faq-title"><div className="multi-section-heading"><h2 id="use-case-faq-title">Frequently asked questions</h2></div><div className="mkt-faq-list">{page.faqs.map(item => <details className="mkt-faq-item" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div><script {...schemaScriptProps(faqSchema)} /></section>

      <section className="multi-section use-case-related" aria-labelledby="use-case-related-title"><h2 id="use-case-related-title">Keep exploring Meadow.</h2><nav aria-label="Related publishing pages">{(page.kind === "agent-api" ? AGENT_API_PAGES : PUBLISHING_PAGES).filter(item => item.path !== page.path).map(item => <a href={`${item.path}/`} key={item.path}>{item.footerLabel} <Arrow /></a>)}<a href="/manage-multiple-social-media-accounts/">All your social accounts <Arrow /></a><a href="/developers/">API and MCP docs <Arrow /></a></nav></section>

      <section className="multi-section multi-closing" aria-labelledby="use-case-closing-title"><h2 id="use-case-closing-title">{page.closing}</h2><p>Start free and prepare your next post in Meadow.</p><a className="btn-primary landing-cta" href={signupHref()}>{page.action} <Arrow /></a></section>
    </main>
    <SiteFooter onGetStarted={onGetStarted} />
  </div>;
}
