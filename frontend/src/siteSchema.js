import { CONTACT_EMAIL, CONTACT_PHONE, LEGAL_ENTITY } from "./siteContact.js";
import { MARKETING_ORIGIN } from "./siteUrls.js";

// What search engines are told about Meadow. Every value here is already stated
// somewhere on the site. Regional prices and Free limits are fetched at runtime,
// so static structured data must not advertise a single global amount. Nothing is asserted that a visitor cannot also read, and
// no rating, review or user count is claimed, because none exist.
const ORGANIZATION_ID = `${MARKETING_ORIGIN}/#organization`;
const WEBSITE_ID = `${MARKETING_ORIGIN}/#website`;

export const organizationSchema = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: "Meadow",
  legalName: LEGAL_ENTITY,
  url: `${MARKETING_ORIGIN}/`,
  logo: `${MARKETING_ORIGIN}/meadow-flower-logo.png`,
  email: CONTACT_EMAIL,
  telephone: CONTACT_PHONE,
  contactPoint: [{ "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, telephone: CONTACT_PHONE, availableLanguage: "English" }],
};

export const websiteSchema = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: "Meadow",
  url: `${MARKETING_ORIGIN}/`,
  publisher: { "@id": ORGANIZATION_ID },
};

export const softwareApplicationSchema = {
  "@type": "SoftwareApplication",
  "@id": `${MARKETING_ORIGIN}/#software`,
  name: "Meadow",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Social media publishing",
  operatingSystem: "Web browser",
  url: `${MARKETING_ORIGIN}/`,
  publisher: { "@id": ORGANIZATION_ID },
};

export function homepageSchema() {
  return { "@context": "https://schema.org", "@graph": [organizationSchema, websiteSchema, softwareApplicationSchema] };
}

// Inline JSON-LD has to survive a closing tag appearing inside a string value.
export function schemaScriptProps(schema) {
  return { type: "application/ld+json", dangerouslySetInnerHTML: { __html: JSON.stringify(schema).replace(/</g, "\\u003c") } };
}
