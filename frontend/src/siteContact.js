// How people reach Meadow. The nav, the contact page and the welcome email all
// read from here, so the address and number are written once. The backend keeps
// its own copy for the welcome email; contact-details.test.js compares the two.
export const CONTACT_EMAIL = "hello@findmeadow.com";
export const CONTACT_PHONE = "+16122237014";
export const CONTACT_PHONE_DISPLAY = "+1 (612) 223-7014";
export const LEGAL_ENTITY = "WoodBark Software LLC";

export const CONTACT_EMAIL_HREF = `mailto:${CONTACT_EMAIL}`;
export const CONTACT_PHONE_HREF = `tel:${CONTACT_PHONE}`;

// The prerenderer runs in plain Node and cannot parse JSX, so the page's own
// title and description live here rather than beside its component.
export const DEVELOPERS_TITLE = "MCP Server for Social Media Publishing | Meadow";
export const DEVELOPERS_DESCRIPTION = "Let Claude or any MCP client draft posts for 11 social platforms, plus Twitch and Kick chat. You review and publish. Free plan, API key in minutes.";

export const CONTACT_TITLE = "Contact Meadow · Support Email and Phone";
export const CONTACT_DESCRIPTION = `Reach the Meadow team by email at ${CONTACT_EMAIL} or by phone at ${CONTACT_PHONE_DISPLAY}. Meadow is operated by ${LEGAL_ENTITY}.`;
