import { useEffect } from "react";

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
        heading: "3. Your content and connected accounts",
        paragraphs: [
          "You keep ownership of the media, text, and other material you provide to Meadow. You give Meadow permission to process that material only as needed to provide the features you request. You must have the rights and permissions needed to upload, transform, schedule, and publish your content.",
          "When you connect a third-party account, you authorize Meadow to use the permissions you grant through that platform. You are responsible for following the platform’s rules, including its privacy, music, copyright, and publishing requirements.",
        ],
      },
      {
        heading: "4. Acceptable use",
        paragraphs: [
          "Do not use Meadow to break the law, infringe another person’s rights, distribute harmful or malicious material, bypass platform safeguards, or interfere with the service. We may suspend access when necessary to protect the service, users, or connected platforms.",
        ],
      },
      {
        heading: "5. Service changes and availability",
        paragraphs: [
          "Meadow is evolving, so features may change, be limited, or be discontinued. We work to keep the service available, but we do not promise that it will be uninterrupted or error-free.",
        ],
      },
      {
        heading: "6. Disclaimers",
        paragraphs: [
          "Meadow is provided as available. To the extent allowed by law, Meadow is not responsible for losses caused by content you publish, actions taken by connected platforms, or interruptions outside our reasonable control.",
        ],
      },
      {
        heading: "7. Contact",
        paragraphs: [
          <>Questions about these terms can be sent to <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a>.</>,
        ],
      },
    ],
  },
  privacy: {
    label: "Privacy policy",
    title: "Privacy Policy",
    intro: "This policy describes the information Meadow receives, why we use it, and the choices available to you.",
    sections: [
      {
        heading: "1. Information we receive",
        paragraphs: [
          "We receive account details from Clerk, such as your email address and user identifier. We also receive the media, captions, post settings, connected-account selections, schedules, and other workspace information you choose to provide.",
          "We may receive basic technical information such as browser details, approximate timestamps, error information, and product usage events. PostHog may process product analytics when analytics is enabled for the deployment.",
        ],
      },
      {
        heading: "2. How we use information",
        paragraphs: [
          "We use information to authenticate you, operate your workspace, process and deliver content, maintain security, troubleshoot failures, improve Meadow, and respond to support requests. We use connected-account credentials only to provide the actions you authorize.",
        ],
      },
      {
        heading: "3. When information is shared",
        paragraphs: [
          "We share information with service providers that help operate Meadow, such as authentication, hosting, analytics, media-processing, and infrastructure providers. We send content to a connected platform only when you request an action that requires it. We may also disclose information when required by law or when needed to protect the service and its users.",
        ],
      },
      {
        heading: "4. Storage and retention",
        paragraphs: [
          "Workspace data and generated media are stored for the period needed to provide the service and maintain your workspace. Retention can vary by data type and deployment configuration. Contact us if you need help understanding or deleting information associated with your account.",
        ],
      },
      {
        heading: "5. Your choices",
        paragraphs: [
          <>You can disconnect supported accounts, remove workspace content, and ask us about access or deletion by contacting <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a>. You can also manage browser storage and analytics controls through your browser and the relevant provider settings.</>,
        ],
      },
      {
        heading: "6. Updates",
        paragraphs: [
          "We may update this policy as Meadow changes. The effective date at the top of this page shows when the current version was published.",
        ],
      },
      {
        heading: "7. Contact",
        paragraphs: [
          <>Privacy questions can be sent to <a href="mailto:hello@findmeadow.com">hello@findmeadow.com</a>.</>,
        ],
      },
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
          <span className="legal-brand-mark">meadow<span>.</span></span>
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
          <span className="legal-effective">Effective September 11, 2026</span>
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
