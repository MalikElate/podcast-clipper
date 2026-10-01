export const PRIVACY_POLICY_VERSION = "2026-10-01";

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
