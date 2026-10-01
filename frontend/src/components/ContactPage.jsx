import { useEffect } from "react";
import SiteFooter from "./SiteFooter.jsx";
import SiteHeader from "./SiteHeader.jsx";
import { CONTACT_DESCRIPTION, CONTACT_EMAIL, CONTACT_EMAIL_HREF, CONTACT_PHONE, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_HREF, CONTACT_TITLE, LEGAL_ENTITY } from "../siteContact.js";

const CONTACT_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Meadow",
  legalName: LEGAL_ENTITY,
  url: "https://findmeadow.com/",
  email: CONTACT_EMAIL,
  telephone: CONTACT_PHONE,
  contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, telephone: CONTACT_PHONE, availableLanguage: "English" }],
};

export default function ContactPage({ onGetStarted }) {
  useEffect(() => {
    document.title = CONTACT_TITLE;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = CONTACT_DESCRIPTION;
  }, []);

  return (
    <div className="landing contact-page">
      <SiteHeader onSignIn={onGetStarted} onStartPosting={onGetStarted} />

      <main>
        <section className="landing-section contact-hero" aria-labelledby="contact-title">
          <div className="section-heading">
            <h1 id="contact-title">Contact Meadow</h1>
            <p>Questions about publishing, billing, your account or anything else reach the same team. Email is the fastest way to get a written answer you can refer back to.</p>
          </div>

          <div className="contact-methods">
            <article className="contact-method">
              <h2>Email</h2>
              <p><a href={CONTACT_EMAIL_HREF}>{CONTACT_EMAIL}</a></p>
              <p className="contact-method-note">Best for account questions, billing and anything needing a record. Include your workspace email so we can find your account.</p>
            </article>

            <article className="contact-method">
              <h2>Phone</h2>
              <p><a href={CONTACT_PHONE_HREF}>{CONTACT_PHONE_DISPLAY}</a></p>
              <p className="contact-method-note">Call or text. If no one picks up, leave a message with your email address and the team will follow up there.</p>
            </article>
          </div>

          <p className="contact-entity">Meadow is operated by {LEGAL_ENTITY}. For privacy requests, including access, correction, export or deletion, email <a href={CONTACT_EMAIL_HREF}>{CONTACT_EMAIL}</a> or use Privacy &amp; Account in your workspace settings.</p>
        </section>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(CONTACT_SCHEMA).replace(/</g, "\\u003c") }} />
      </main>

      <SiteFooter onGetStarted={onGetStarted} />
    </div>
  );
}
