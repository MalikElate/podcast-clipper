export const PRIVACY_POLICY_VERSION = "2026-10-01";
export const SIGNUP_ACTION_SELECTOR = '.cl-formButtonPrimary, .cl-form button[type="submit"], .cl-socialButtonsRoot button';

export function isSignupAction(target) {
  return Boolean(target?.closest?.(SIGNUP_ACTION_SELECTOR));
}

export function preventSignupWithoutConsent(event, privacyAccepted) {
  if (privacyAccepted || (event.type !== "submit" && !isSignupAction(event.target))) return false;

  event.preventDefault();
  event.stopPropagation();
  return true;
}

export function buildSignupConsentMetadata({
  privacyAcceptedAt,
  marketingOptIn,
  marketingUpdatedAt,
}) {
  if (!privacyAcceptedAt) return undefined;

  return {
    signupConsent: {
      privacyPolicy: {
        acceptedAt: privacyAcceptedAt,
        version: PRIVACY_POLICY_VERSION,
      },
      marketingEmails: {
        optedIn: Boolean(marketingOptIn),
        updatedAt: marketingUpdatedAt || null,
      },
      source: "signup",
    },
  };
}
