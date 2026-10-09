import { useEffect } from "react";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";
import { appHref, marketingHref } from "../siteUrls.js";
import { DEVELOPERS_DESCRIPTION, DEVELOPERS_TITLE } from "../siteContact.js";
import { usePricingQuote } from "../pricingQuote.js";

// Every claim here is checked against docs/mcp-api.md and docs/webhooks.md.
// Overclaiming would send developers to an endpoint that cannot do what the
// page promised, so keep this list in step with MeadowMcpServer.js.
const TOOLS = [
  ["get_profile", "Identify the connected Meadow profile."],
  ["list_projects", "List the profile's owned projects."],
  ["list_accounts", "List cached connected-account data for a project."],
  ["list_posts", "List drafts, scheduled posts and publishing history, with bounded pagination."],
  ["get_post", "Return one post by ID, with the status of each destination."],
  ["get_account_options", "Fetch an account's current publishing options, such as TikTok privacy choices and Pinterest boards."],
  ["get_analytics", "Return cached project totals and account summaries, without calling the social platforms."],
  ["create_draft", "Save one non-empty draft. A stable requestId makes a retry idempotent."],
  ["upload_media", "Add an image, video or document from a public URL, base64 bytes, or a file attached in ChatGPT."],
  ["create_upload_url", "Create a one-time link for uploading a large local file."],
  ["preview_post", "Check a post against every selected account without publishing it."],
  ["publish_post", "Publish a post now or schedule it. A stable requestId keeps a retry from posting twice."],
  ["publish_draft", "Publish or schedule a saved draft."],
];

const FAQS = [
  { q: "Can the API publish a post?", a: "Yes. publish_post publishes or schedules a post on the accounts you choose, and publish_draft sends a saved draft. Upload media first with upload_media, or with create_upload_url for a large local file. preview_post checks every destination without sending anything, and get_post reports when each one is live. Connecting accounts still happens in the dashboard." },
  { q: "How does a client authenticate?", a: "With a Meadow API key created in Settings → API Keys, sent as an Authorization: Bearer header. A key has your full access. Clients that support OAuth sign-in can use that instead, and you approve each permission: meadow:read for the read tools, meadow:draft for create_draft, meadow:media for upload_media and create_upload_url, and meadow:publish for publish_post and publish_draft." },
  { q: "Which platforms can a post target?", a: "The same destinations the dashboard reaches: 11 platforms that accept posts, plus Twitch and Kick for channel chat. A post names its destinations, and each destination keeps its own text and settings." },
  { q: "How do I find out what happened to a post?", a: "Subscribe a webhook. post.completed fires once per destination with the platform, delivery ID and outcome; connection.needs_reconnect fires when an account needs reauthorizing. Payloads carry references and outcomes, never credentials, post content or media." },
  { q: "Is the MCP endpoint public?", a: "The endpoint is reachable, but anonymous clients can only initialize the protocol and read tool descriptors. Retrieving anything from a workspace requires a key." },
];

const faqSchema = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQS.map(item => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })) };

function Code({ children }) {
  return <pre className="dev-code"><code>{children}</code></pre>;
}

export default function DevelopersPage({ onGetStarted }) {
  const { quote } = usePricingQuote();
  useEffect(() => {
    document.title = DEVELOPERS_TITLE;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = DEVELOPERS_DESCRIPTION;
  }, []);

  return (
    <div className="landing dev-page">
      <SiteHeader onSignIn={onGetStarted} onStartPosting={onGetStarted} />

      <main>
        <section className="landing-section dev-hero" aria-labelledby="dev-title">
          <div className="section-heading">
            <h1 id="dev-title">Let an AI client draft, schedule and publish your posts.</h1>
            <p>
              Meadow runs an MCP server so a supported AI client, a script or an automation can read your workspace, upload
              media, and draft, schedule or publish posts across 11 publishing platforms, plus Twitch and Kick chat.
              Publishing is a separate permission you grant when you connect.
            </p>
          </div>
        </section>

        <section className="landing-section dev-section" aria-labelledby="dev-start">
          <h2 id="dev-start">Connect in one command</h2>
          <p>Create a key in Settings → API Keys, then point any MCP client at the server:</p>
          <Code>{`npx @modelcontextprotocol/inspector@latest \\
  --server-url https://findmeadow.com/mcp \\
  --transport http \\
  --header "Authorization: Bearer $MEADOW_API_KEY"`}</Code>
          <p>
            The same URL and header work from a client that speaks MCP over HTTP. Clients that support OAuth sign-in can
            authorize instead of carrying a key.
          </p>
        </section>

        <section className="landing-section dev-section" aria-labelledby="dev-tools">
          <h2 id="dev-tools">Thirteen tools</h2>
          <p>Eight read your workspace. Five write: a draft, uploaded media, or a published post.</p>
          <dl className="dev-tool-list">
            {TOOLS.map(([name, purpose]) => <div className="dev-tool-row" key={name}><dt><code>{name}</code></dt><dd>{purpose}</dd></div>)}
          </dl>
        </section>

        <section className="landing-section dev-section" aria-labelledby="dev-webhooks">
          <h2 id="dev-webhooks">Know what happened</h2>
          <p>
            Register a destination and Meadow signs every delivery. <code>post.completed</code> arrives once per
            destination with the platform, delivery ID and outcome. <code>connection.needs_reconnect</code> arrives when an
            account needs reauthorizing. Failed deliveries retry after one, two, four and eight minutes.
          </p>
          <p>Events carry references and outcomes, never credentials, post content or media.</p>
        </section>

        <section className="landing-section faq-section" id="faq" aria-labelledby="dev-faq">
          <div className="faq-heading"><h2 id="dev-faq">Questions from developers</h2></div>
          <div className="mkt-faq-list">
            {FAQS.map(item => <details className="mkt-faq-item" key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}
          </div>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
        </section>

        <section className="landing-cta-section">
          <div className="landing-cta-content">
            <h2>Start with a free workspace</h2>
            <p>Create an account, connect a destination, and issue a key from Settings. {quote ? `The free plan covers ${quote.freeAccounts} connected accounts.` : "See pricing for your local free account limit."}</p>
            <div className="landing-cta-actions">
              <a className="landing-cta-primary" href={appHref("/sign-up")}>Create a free account</a>
              <a className="landing-cta-secondary" href={marketingHref("/#ways-to-use")}>See how teams use it</a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
