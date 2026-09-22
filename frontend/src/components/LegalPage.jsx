import { useEffect } from "react";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";
import { PLATFORM_PRIVACY } from "./platformPrivacy.js";
import AnalyticsPreference from "./AnalyticsPreference.jsx";

const PAGE_COPY = {
  terms: {
    label: "Terms of service",
    title: "Terms of Service",
    effectiveDate: "September 12, 2026",
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
    effectiveDate: "September 22, 2026",
    intro: <>This policy explains the information Meadow receives, how we use it, how long we keep it, and how you can withdraw access or delete it. Google and YouTube data are covered in plain language in the <a href="#privacy-youtube">YouTube section</a>.</>,
    sections: [
      { heading: "1. Account and workspace information", paragraphs: [
        "Clerk handles sign-in and provides your user identifier and account details, such as your email address. We store the media, captions, settings, schedules, API-key records, and workspace information you give us to operate your account and carry out your publishing requests.",
        "We receive technical information needed to operate and protect the service, including request times, IP addresses processed by our infrastructure, and error information. We do not request or store your social-platform password. OAuth access and refresh tokens are encrypted in Meadow’s application database.",
      ] },
      { heading: "2. Connected platforms and purposes", paragraphs: [
        "You can enter and use your Meadow workspace without connecting a social account. Before supported connections or reconnections, Meadow may present a separate data notice and ask for your agreement. We save the notice version and acceptance time with the authorization.",
        "For connected platforms, Meadow receives the account identifiers and permissions needed to direct your content to the account you select. Depending on the platform, we also receive account names, profile images, publishing options, delivery identifiers and status, and performance statistics. We use this information to display your connections, validate and deliver your posts, show publishing results, and provide the analytics you request.",
        "The platform-specific notices below describe the data used by each supported connection, its purpose, retention and removal, and provide links to the platform’s official privacy information. A platform’s authorization screen also shows the permissions requested. Connecting an account does not authorize Meadow to publish content you have not submitted.",
      ] },
      { heading: "3. Limits on use and sharing", paragraphs: [
        "We do not sell connected-platform data or use it for advertising, data brokerage, or training general-purpose AI models. We do not use your Google or YouTube data for purposes unrelated to the features you request. Meadow’s use and transfer of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.",
        <>Read the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>. Access by people is limited to what is necessary for authorized support, security, legal obligations, or operation of the requested service, subject to the applicable platform rules.</>,
        "Our free TikTok roast tool reads publicly embeddable profile information and captions, caches results for up to one hour, and may send those public captions to Cloudflare Workers AI to write a punchline. No TikTok login or connected-account data is used by this tool. The score uses the caption checks described on the tool page. Clerk processes authentication data; Cloudflare provides hosting and infrastructure; and Stripe processes subscription payments and billing records. We send media, captions, and settings to the social destinations you select. These providers process information under their own terms and privacy policies. We may disclose information when legally required or necessary to protect the service and its users.",
      ] },
      { heading: "4. Cookies and product analytics", paragraphs: [
        "Trybe uses a first-party visitor cookie to attribute purchases to creator referrals. When a payment succeeds, we send Trybe the visitor identifier, order identifier, amount, currency, payment time, and customer email. This includes subscription renewals. Trybe hashes customer emails for attribution; we do not send card details or connected-platform content to Trybe.",
        "Meadow and Clerk use browser storage and cookies needed for sign-in, security, and workspace preferences. Meadow uses PostHog in the United States for cookie-free usage analytics: page visits, browser and device categories, referring website domains, and successful actions such as saving a draft or submitting a post. PostHog uses a daily-changing hash derived from request information, including the IP address and user agent, to estimate visitors without storing an analytics identifier in your browser. Cookieless events have their IP address removed before processing. These counts do not identify your Meadow account or track return visits across days.",
        "We exclude email addresses, names, account and social-platform identifiers, post content, media, credentials, URL query strings, and URL fragments from new PostHog events. Session recordings and automatic form or text capture are disabled. We honor supported Do Not Track and Global Privacy Control browser settings. You can turn usage analytics off below or in Settings → Privacy & Account; a preference cookie remembers that choice across Meadow’s website and app for one year. Earlier versions sent identified analytics; account deletion still requests removal of historical analytics associated with your account.",
        <AnalyticsPreference />,
        "Social performance analytics are separate from product usage tracking. They use your connected-platform permissions to show the results of the posts you published. Your browser may contact a platform when displaying its profile images or when you follow a platform link.",
      ] },
      { heading: "5. Retention", paragraphs: [
        "We keep user-provided workspace content while your account is active and until you delete it or your account. Temporary OAuth connection requests expire after ten minutes; Bluesky authorization state expires after fifteen minutes. Expired state is removed by the maintenance worker. Abandoned temporary uploads and unreferenced media files are removed after twenty-four hours.",
        "Meadow checks stored YouTube information at least once every 30 days. If Meadow loses access to your channel or a video is removed from YouTube, Meadow deletes the related information within 30 days of that change. Disconnecting YouTube or deleting your Meadow account starts deletion immediately. Meadow deletes its stored YouTube information as soon as possible and no later than seven calendar days.",
        "Pinterest profile details, board lists, and organic statistics are retrieved for the current operation or screen and are not persisted as a reusable cache. Credentials and the minimum records required for your authorized publishing workflow remain until the connection is removed.",
        "Deletion jobs start immediately and retry failed cleanup. Where direct token revocation is supported, encrypted credentials needed only for revocation are retained for no longer than seven days and are then destroyed even if the platform cannot confirm revocation. A minimal deletion receipt and hashed account identifier remain to prevent stale sign-ins or delayed webhooks from recreating deleted workspaces. These markers are not used for analytics or advertising.",
        "Records needed to finish billing cancellation or processor deletion are retained only while that work is outstanding. Stripe may retain payment records required for legal and accounting obligations. Restricted infrastructure logs, legal records, and any recovery copies follow their applicable operational or legal retention schedules; they are not used to restore an erased workspace to active service. Contact us for the status of a specific deletion request or recovery-copy removal.",
      ] },
      { heading: "6. Disconnecting a platform", paragraphs: [
        "In Connections, remove the relevant account to stop new publishing and delete its stored credentials, profile, delivery history, and metrics from Meadow. Matching connections in your other Meadow workspaces may also be removed when they share that authorization. Your original media, captions, and posts for other destinations remain in Meadow. A request already sent to a platform may still finish, and posts already published remain on that platform until you remove them there.",
        <>For Google and YouTube, you can also revoke Meadow’s access in your <a href="https://security.google.com/settings/security/permissions">Google Account permissions</a>. Google may revoke the entire authorization, affecting other channels or Google connections using it. Meadow checks stored YouTube information at least once every 30 days and deletes related information within 30 days if access is lost.</>,
        <>For TikTok, use the app’s security and app-permissions settings to remove Meadow. For Pinterest, also remove Meadow from <a href="https://www.pinterest.com/settings/security">Pinterest’s security and app settings</a>: Pinterest does not currently offer direct revocation for the regular user tokens Meadow uses. Other platforms offer similar connected-app controls. Removing tokens from Meadow ends Meadow’s local access; removing the app in the platform’s settings revokes the platform-side grant.</>,
      ] },
      { heading: "7. Delete your account or make a privacy request", paragraphs: [
        "Open Settings → Privacy & Account → Delete account. After confirmation, Meadow closes all your workspaces, stops new publishing, revokes API keys, removes workspace content and social data, requests cancellation of your subscription, and deletes your Clerk sign-in account. This is permanent. You receive a deletion reference, and cleanup normally completes within seven days. Billing, sign-in, or historical analytics cleanup that still needs processor confirmation may take longer; we keep the request pending rather than reporting it as completed.",
        <>You can request access, correction, an export, deletion, or information about a pending request at <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a>. Include the account email or deletion reference, but never passwords or access tokens. We may ask for enough information to verify that the request concerns your account. Depending on your location, you may also have rights to restrict or object to processing, withdraw consent, or complain to a privacy regulator.</>,
      ] },
      { heading: "8. Updates and contact", paragraphs: [
        "The effective date identifies this version of the policy. Connection notices have their own version and are shown whenever you connect or reconnect the relevant platform. Agreement is specific to that authorization; it is not a requirement for entering your Meadow workspace.",
        <>Meadow is operated by WoodBark Software LLC. Contact <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a> about privacy or this policy.</>,
      ] },
    ],
  },
};

export default function LegalPage({ kind }) {
  const copy = PAGE_COPY[kind] || PAGE_COPY.terms;
  const privacy = kind === "privacy";

  useEffect(() => {
    document.title = `${copy.label} · Meadow`;
  }, [copy.label]);

  return (
    <div className={`legal-shell ${privacy ? "legal-shell-privacy" : ""}`}>
      <SiteHeader className="legal-header" />

      <main className="legal-page">
        <div className="legal-intro" id={privacy ? "privacy-overview" : undefined}>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <p>Meadow is operated by WoodBark Software LLC.</p>
          <span className="legal-effective">Effective {copy.effectiveDate}</span>
        </div>
        <div className={privacy ? "legal-layout" : undefined}>
          {privacy && <aside className="legal-sidebar" aria-label="Social platform privacy policies"><div className="legal-sidebar-card"><span>Social platforms</span><nav>{PLATFORM_PRIVACY.map(platform => <a key={platform.id} href={`#privacy-${platform.id}`}>{platform.name}</a>)}</nav></div></aside>}
          <div className="legal-body">
            {copy.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </section>
            ))}
            {privacy && <>
              <section id="social-platform-privacy" className="legal-platform-intro">
                <h2>9. Social platform privacy notices</h2>
                <p>Each notice describes what Meadow accesses through that platform, how the information supports the features you request, and how to remove the connection. The linked platform policies explain how the platform itself handles information.</p>
              </section>
              {PLATFORM_PRIVACY.map(platform => <section className="legal-platform-policy" id={`privacy-${platform.id}`} key={platform.id} aria-labelledby={`privacy-${platform.id}-title`}>
                <span className="legal-platform-label">Connected platform</span>
                <h2 id={`privacy-${platform.id}-title`}>{platform.name}</h2>
                <p>{platform.intro}</p>
                <dl>{platform.details.map(detail => <div key={detail.label}><dt>{detail.label}</dt><dd>
                  <p>{detail.text}</p>
                  {detail.items && <ul>{detail.items.map(item => <li key={item}>{item}</li>)}</ul>}
                  {detail.footer && <p>{detail.footer}</p>}
                </dd></div>)}</dl>
                <nav className="legal-platform-links" aria-label={`${platform.name} privacy links`}>{platform.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</nav>
              </section>)}
            </>}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
