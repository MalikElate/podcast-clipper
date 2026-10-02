// The one message Meadow sends on its own behalf. Everything else a user
// receives about their account comes from Clerk or Stripe.
//
// A welcome email is never worth failing a signup for: when the service is
// unconfigured or the send fails, the account is already created and the
// webhook still succeeds, so Clerk does not retry a delivery that cannot help.
export const CONTACT_EMAIL = "hello@findmeadow.com";
export const CONTACT_PHONE = "+16122237014";
export const CONTACT_PHONE_DISPLAY = "+1 (612) 223-7014";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SUBJECT = "Welcome to Meadow";

// Names come from the signup form, so they are text rather than markup.
function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function welcomeEmailContent({ firstName = "", appUrl = "https://app.findmeadow.com" } = {}) {
  const name = String(firstName || "").trim();
  const greeting = name ? `Hi ${name},` : "Hi,";
  const dashboard = `${appUrl.replace(/\/$/, "")}/dashboard`;
  const text = [
    greeting,
    "",
    "Thanks for creating a Meadow account. Meadow is where you write a post once, decide where it should go, and schedule it across your channels from one place.",
    "",
    "To get started, open your workspace and connect an account. Once a destination is connected you can create a post, set when it should publish, and follow its delivery status.",
    "",
    dashboard,
    "",
    "If you get stuck or have a question, reply to this email or reach us directly:",
    `Email: ${CONTACT_EMAIL}`,
    `Phone: ${CONTACT_PHONE_DISPLAY}`,
    "",
    "A person reads every message.",
    "",
    "The Meadow team",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18222f;">
<div style="max-width:520px;margin:0 auto;padding:32px;background:#ffffff;border-radius:16px;line-height:1.6;">
<p style="margin:0 0 16px;">${escapeHtml(greeting)}</p>
<p style="margin:0 0 16px;">Thanks for creating a Meadow account. Meadow is where you write a post once, decide where it should go, and schedule it across your channels from one place.</p>
<p style="margin:0 0 16px;">To get started, open your workspace and connect an account. Once a destination is connected you can create a post, set when it should publish, and follow its delivery status.</p>
<p style="margin:0 0 24px;"><a href="${escapeHtml(dashboard)}" style="display:inline-block;padding:11px 20px;border-radius:999px;background:#18222f;color:#ffffff;text-decoration:none;font-weight:600;">Open your workspace</a></p>
<p style="margin:0 0 8px;">If you get stuck or have a question, reply to this email or reach us directly:</p>
<p style="margin:0 0 16px;">Email: <a href="mailto:${CONTACT_EMAIL}" style="color:#18222f;">${CONTACT_EMAIL}</a><br />Phone: <a href="tel:${CONTACT_PHONE}" style="color:#18222f;">${CONTACT_PHONE_DISPLAY}</a></p>
<p style="margin:0 0 16px;">A person reads every message.</p>
<p style="margin:0;">The Meadow team</p>
</div></body></html>`;

  return { subject: SUBJECT, text, html };
}

// Clerk lists every address a user has verified and names which one is primary.
// A signup without a usable address is possible, and yields no recipient.
export function clerkSignupContact(data = {}) {
  const addresses = Array.isArray(data.email_addresses) ? data.email_addresses : [];
  const primary = addresses.find(address => address?.id === data.primary_email_address_id) || addresses[0];
  return { email: primary?.email_address || "", firstName: data.first_name || "", userId: data.id || "" };
}

export class WelcomeEmailService {
  constructor({ env = process.env, fetcher = fetch, appUrl = "https://app.findmeadow.com", logger = console } = {}) {
    this.apiKey = env.RESEND_API_KEY || "";
    this.from = env.MEADOW_EMAIL_FROM || `Meadow <${CONTACT_EMAIL}>`;
    this.fetcher = fetcher;
    this.appUrl = appUrl;
    this.logger = logger;
  }

  get configured() { return Boolean(this.apiKey); }

  // Resolves to whether the message was sent. A false result is already logged
  // and means the signup went through without its welcome email.
  async sendWelcome({ email, firstName = "", userId = "" } = {}) {
    if (!this.configured || !email) return false;
    const { subject, text, html } = welcomeEmailContent({ firstName, appUrl: this.appUrl });
    try {
      const response = await this.fetcher(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          // Clerk can deliver user.created more than once; one account gets one welcome.
          ...(userId ? { "Idempotency-Key": `meadow-welcome-${userId}` } : {}),
        },
        body: JSON.stringify({ from: this.from, to: [email], reply_to: CONTACT_EMAIL, subject, text, html }),
      });
      if (!response.ok) {
        this.logger.warn?.(`Welcome email rejected for new account: ${response.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn?.(`Welcome email could not be sent: ${error.message}`);
      return false;
    }
  }
}
