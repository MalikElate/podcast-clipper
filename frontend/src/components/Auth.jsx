import { useState } from "react";
import { SignIn, SignUp } from "@clerk/react";
import { buildSignupConsentMetadata } from "../signupConsent.js";

function SignupAuth({ redirectUrl }) {
  const [privacyAcceptedAt, setPrivacyAcceptedAt] = useState(null);
  const [marketingChoice, setMarketingChoice] = useState({ optedIn: false, updatedAt: null });
  const privacyAccepted = Boolean(privacyAcceptedAt);
  const consentMetadata = buildSignupConsentMetadata({
    privacyAcceptedAt,
    marketingOptIn: marketingChoice.optedIn,
    marketingUpdatedAt: marketingChoice.updatedAt,
  });

  return (
    <div className="signup-auth">
      <section className="signup-consent-card" aria-labelledby="signup-consent-title">
        <div className="signup-consent-heading">
          <h1 id="signup-consent-title">Privacy and email preferences</h1>
          <p>Review these choices before creating your account.</p>
        </div>

        <label className="signup-consent-option" htmlFor="signup-privacy-consent">
          <input
            id="signup-privacy-consent"
            type="checkbox"
            checked={privacyAccepted}
            required
            onChange={(event) => setPrivacyAcceptedAt(event.target.checked ? new Date().toISOString() : null)}
          />
          <span>
            I agree to Meadow's <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            <small>Required to create an account.</small>
          </span>
        </label>

        <label className="signup-consent-option" htmlFor="signup-marketing-consent">
          <input
            id="signup-marketing-consent"
            type="checkbox"
            checked={marketingChoice.optedIn}
            onChange={(event) => setMarketingChoice({
              optedIn: event.target.checked,
              updatedAt: new Date().toISOString(),
            })}
          />
          <span>
            I want to receive marketing and promotional emails from Meadow.
            <small>Optional. You can unsubscribe at any time.</small>
          </span>
        </label>

        {!privacyAccepted && <p className="signup-consent-prompt">Accept the Privacy Policy to enable account creation.</p>}
      </section>

      <fieldset className="signup-auth-form" disabled={!privacyAccepted} aria-describedby={!privacyAccepted ? "signup-form-disabled" : undefined}>
        <legend className="sr-only">Create your Meadow account</legend>
        {!privacyAccepted && <span id="signup-form-disabled" className="sr-only">Account creation is disabled until you accept the Privacy Policy.</span>}
        <SignUp forceRedirectUrl={redirectUrl} unsafeMetadata={consentMetadata} />
      </fieldset>
    </div>
  );
}

// Keep authentication owned by Clerk so its native sign-in and sign-up flow,
// including headings, provider buttons, and recovery screens, remains intact.
export default function Auth({ redirectUrl = "/dashboard", mode = "sign-in" }) {
  return mode === "sign-up"
    ? <SignupAuth redirectUrl={redirectUrl} />
    : <SignIn forceRedirectUrl={redirectUrl} />;
}
