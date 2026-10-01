export const PRIVACY_POLICY_VERSION = "2026-10-01";
export const SIGNUP_ACTION_SELECTOR = '.cl-form button[type="submit"], .cl-socialButtonsRoot button';

export function setSignupActionsConsentState(root, privacyAccepted) {
  if (!root?.querySelectorAll) return;

  root.querySelectorAll(SIGNUP_ACTION_SELECTOR).forEach((button) => {
    if (!privacyAccepted && !button.disabled) {
      button.dataset.meadowConsentDisabled = "true";
      button.disabled = true;
      return;
    }

    if (privacyAccepted && button.dataset.meadowConsentDisabled === "true") {
      button.disabled = false;
      delete button.dataset.meadowConsentDisabled;
    }
  });
}

export function isSignupAction(target) {
  return Boolean(target?.closest?.(SIGNUP_ACTION_SELECTOR));
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
