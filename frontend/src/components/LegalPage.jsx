import { useEffect } from "react";
import BrandLogo from "./BrandLogo.jsx";

const PAGE_COPY = {
  terms: {
    label: "Terms of service",
    title: "Terms of Service",
    intro: "These terms explain the basic rules for using Meadow to create, schedule, and understand social content.",
    sections: [
      {
        heading: "1. Using Meadow",
        paragraphs: [
          "Meadow provides tools for organizing media, creating posts, connecting supported accounts, scheduling content, and reviewing delivery and performance information. You may use Meadow only if you can enter into a binding agreement and only in accordance with these terms.",
        ],
      },
      {
        heading: "2. Your account",
        paragraphs: [
          "You are responsible for the information on your account and for keeping your sign-in details secure. You are also responsible for activity carried out through your account and for making sure the people who use your workspace have the right level of access.",
        ],
      },
      {
        heading: "3. Paid subscriptions",
        paragraphs: [
          "Paid plans renew automatically at the billing frequency shown at checkout until cancelled. Stripe processes payments and provides the billing portal. You can manage or cancel a subscription from Meadow’s Billing page; cancellation takes effect according to the date shown in the portal. Deleting your Meadow account requests immediate cancellation of the subscription; deletion does not automatically create a refund. Prices, taxes, and the amount due are shown before you subscribe.",
        ],
      },
      {
        heading: "4. Your content and connected accounts",
        paragraphs: [
          "You keep ownership of the media, text, and other material you provide to Meadow. You give Meadow permission to process that material only as needed to provide the features you request. You must have the rights and permissions needed to upload, transform, schedule, and publish your content.",
          "When you connect a third-party account, you authorize Meadow to use the permissions you grant to perform the actions you request. You must follow that platform’s privacy, music, copyright, and publishing requirements. You remain in control of the destinations, content, and publishing settings you submit.",
        ],
      },
      {
        heading: "5. YouTube API Services",
        paragraphs: [<>Meadow uses YouTube API Services. By using Meadow’s YouTube features, you agree to be bound by the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>. The <a href="https://policies.google.com/privacy">Google Privacy Policy</a> also applies to information processed by Google.</>],
      },
      {
        heading: "6. Acceptable use",
        paragraphs: [
          "Do not use Meadow to break the law, infringe another person’s rights, distribute harmful or malicious material, bypass platform safeguards, or interfere with the service. We may suspend access when necessary to protect the service, users, or connected platforms.",
        ],
      },
      {
        heading: "7. Service changes and availability",
        paragraphs: [
          "Meadow is evolving, so features may change, be limited, or be discontinued. We work to keep the service available, but we do not promise that it will be uninterrupted or error-free.",
        ],
      },
      {
        heading: "8. Disclaimers",
        paragraphs: [
          "Meadow is provided as available. To the extent allowed by law, Meadow is not responsible for losses caused by content you publish, actions taken by connected platforms, or interruptions outside our reasonable control.",
        ],
      },
      {
        heading: "9. Contact",
        paragraphs: [
          <>Questions about these terms can be sent to <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a>.</>,
        ],
      },
    ],
  },
  privacy: {
    label: "Privacy policy",
    title: "Privacy Policy",
    intro: "This policy explains the information Meadow receives, how we use it, how long we keep it, and how you can withdraw access or delete it.",
    sections: [
      { heading: "1. Account and workspace information", paragraphs: [
        "Clerk handles sign-in and provides your user identifier and account details, such as your email address. We store the media, captions, settings, schedules, API-key records, and workspace information you give us to operate your account and carry out your publishing requests.",
        "We receive technical information needed to operate and protect the service, including request times, IP addresses processed by our infrastructure, and error information. We do not request or store your social-platform password. OAuth access and refresh tokens are encrypted in Meadow’s application database.",
      ] },
      { heading: "2. Connected platforms and purposes", paragraphs: [
        "For connected platforms, Meadow receives the account identifiers and permissions needed to direct your content to the account you select. Depending on the platform, we also receive account names, profile images, publishing options, delivery identifiers and status, and performance statistics. We use this information to display your connections, validate and deliver your posts, show publishing results, and provide the analytics you request.",
        "TikTok: we use the basic profile and account identifier to show your connection; creator information to present available privacy and interaction settings; publishing permissions to deliver videos or photos you submit; and available video statistics to show performance. We receive authorization-removal webhooks so that access withdrawn through TikTok can stop publishing and trigger local deletion.",
        "Pinterest: we retrieve the connected profile and available boards when needed, and use your chosen board and publishing settings to create Pins you authorize. Profile details, board lists, and organic performance metrics are not kept as a database cache. We keep the authorization and routing identifiers needed to operate the connection, your chosen publishing settings, and delivery records needed to prevent duplicate publishing. Pinterest metrics are fetched on refresh and disappear when you leave or reload the analytics screen.",
        <>YouTube: Meadow uses YouTube API Services. We receive your channel identifier and profile, upload the videos and metadata you request, check processing and delivery status, and obtain available video statistics and authorized analytics. We use this data only to provide the requested connection, publishing, and analytics features. See the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a> and <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</>,
        "Other supported connections use the profile, destination, publishing, and performance data required by the features you select. The platform’s authorization screen shows the permissions requested. Connecting an account does not authorize Meadow to publish content you have not submitted.",
      ] },
      { heading: "3. Limits on use and sharing", paragraphs: [
        "We do not sell connected-platform data or use it for advertising, data brokerage, or training general-purpose AI models. We do not use your Google or YouTube data for purposes unrelated to the features you request. Meadow’s use and transfer of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.",
        <>Read the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>. Access by people is limited to what is necessary for authorized support, security, legal obligations, or operation of the requested service, subject to the applicable platform rules.</>,
        "Clerk processes authentication data; Cloudflare provides hosting and infrastructure; and Stripe processes subscription payments and billing records. We send media, captions, and settings to the social destinations you select. These providers process information under their own terms and privacy policies. We may disclose information when legally required or necessary to protect the service and its users.",
      ] },
      { heading: "4. Cookies and product analytics", paragraphs: [
        "Meadow and Clerk use browser storage and cookies needed for sign-in, security, and workspace preferences. Product analytics tracking is currently disabled; Meadow does not send new product usage events to PostHog. Earlier versions used PostHog and may have sent usage events, your account identifier, email address, and name. Account deletion includes a request to remove historical analytics associated with your account.",
        "Social performance analytics are separate from product usage tracking. They use your connected-platform permissions to show the results of the posts you published. Your browser may contact a platform when displaying its profile images or when you follow a platform link.",
      ] },
      { heading: "5. Retention", paragraphs: [
        "We keep user-provided workspace content while your account is active and until you delete it or your account. Temporary OAuth connection requests expire after ten minutes; Bluesky authorization state expires after fifteen minutes. Expired state is removed by the maintenance worker. Abandoned temporary uploads and unreferenced media files are removed after twenty-four hours.",
        "YouTube channel data is checked regularly while connected. Stored YouTube API data is refreshed or removed within thirty days. When access can no longer be verified or a video is no longer available, Meadow removes the affected API data instead of continuing to show old statistics. Disconnecting YouTube or deleting your Meadow account requests deletion immediately; our target for completing the requested local deletion is within seven days.",
        "Pinterest profile details, board lists, and organic statistics are retrieved for the current operation or screen and are not persisted as a reusable cache. Credentials and the minimum records required for your authorized publishing workflow remain until the connection is removed.",
        "Deletion jobs start immediately and retry failed cleanup. Where direct token revocation is supported, encrypted credentials needed only for revocation are retained for no longer than seven days and are then destroyed even if the platform cannot confirm revocation. A minimal deletion receipt and hashed account identifier remain to prevent stale sign-ins or delayed webhooks from recreating deleted workspaces. These markers are not used for analytics or advertising.",
        "Records needed to finish billing cancellation or processor deletion are retained only while that work is outstanding. Stripe may retain payment records required for legal and accounting obligations. Restricted infrastructure logs, legal records, and any recovery copies follow their applicable operational or legal retention schedules; they are not used to restore an erased workspace to active service. Contact us for the status of a specific deletion request or recovery-copy removal.",
      ] },
      { heading: "6. Disconnecting a platform", paragraphs: [
        "In Connections, remove the relevant account to stop new publishing and delete its stored credentials, profile, delivery history, and metrics from Meadow. Matching connections in your other Meadow workspaces may also be removed when they share that authorization. Your original media, captions, and posts for other destinations remain in Meadow. A request already sent to a platform may still finish, and posts already published remain on that platform until you remove them there.",
        <>For Google and YouTube, you can also revoke Meadow’s access in your <a href="https://myaccount.google.com/connections">Google Account permissions</a>. Google may revoke the entire authorization, affecting other channels or Google connections using it. Meadow checks YouTube access regularly and removes data when authorization can no longer be verified, within the thirty-day refresh-or-delete limit.</>,
        <>For TikTok, use the app’s security and app-permissions settings to remove Meadow. For Pinterest, also remove Meadow from <a href="https://www.pinterest.com/settings/security">Pinterest’s security and app settings</a>: Pinterest does not currently offer direct revocation for the regular user tokens Meadow uses. Other platforms offer similar connected-app controls. Removing tokens from Meadow ends Meadow’s local access; removing the app in the platform’s settings revokes the platform-side grant.</>,
      ] },
      { heading: "7. Delete your account or make a privacy request", paragraphs: [
        "Open Settings → Privacy & Account → Delete account. After confirmation, Meadow closes all your workspaces, stops new publishing, revokes API keys, removes workspace content and social data, requests cancellation of your subscription, and deletes your Clerk sign-in account. This is permanent. You receive a deletion reference, and cleanup normally completes within seven days. A platform outage or manual processor follow-up may delay external completion; we keep the request pending rather than reporting it as completed.",
        <>You can request access, correction, an export, deletion, or information about a pending request at <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a>. Include the account email or deletion reference, but never passwords or access tokens. We may ask for enough information to verify that the request concerns your account. Depending on your location, you may also have rights to restrict or object to processing, withdraw consent, or complain to a privacy regulator.</>,
      ] },
      { heading: "8. Updates and contact", paragraphs: [
        "The effective date identifies this version of the policy. When we require agreement to an updated policy, the dashboard asks you to review it before resuming use or scheduled publishing.",
        <>Meadow is operated by MALIK SEITU MUNYENGE, trading as Woodbark Software. Contact <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a> about privacy or this policy.</>,
      ] },
    ],
  },
};

export default function LegalPage({ kind }) {
  const copy = PAGE_COPY[kind] || PAGE_COPY.terms;

  useEffect(() => {
    document.title = `${copy.label} · Meadow`;
  }, [copy.label]);

  return (
    <div className="legal-shell">
      <header className="legal-header">
        <a className="legal-brand" href="/" aria-label="Meadow home">
          <BrandLogo />
        </a>
        <nav className="legal-nav" aria-label="Legal navigation">
          <a className={kind === "terms" ? "active" : ""} href="/terms">Terms</a>
          <a className={kind === "privacy" ? "active" : ""} href="/privacy">Privacy</a>
          <a href="/">Back to Meadow</a>
        </nav>
      </header>

      <main className="legal-page">
        <div className="legal-intro">
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <p>Meadow is operated by MALIK SEITU MUNYENGE, trading as Woodbark Software.</p>
          <span className="legal-effective">Effective September 12, 2026</span>
        </div>
        <div className="legal-body">
          {copy.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </main>

      <footer className="legal-footer">
        <span>© {new Date().getFullYear()} Meadow</span>
        <span>Questions? <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a></span>
      </footer>
    </div>
  );
}
