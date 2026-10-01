import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignupConsentMetadata,
  isSignupAction,
  PRIVACY_POLICY_VERSION,
  setSignupActionsConsentState,
} from "./signupConsent.js";

test("signup actions stay disabled until privacy consent is accepted", () => {
  const clerkEnabledButton = { disabled: false, dataset: {} };
  const clerkDisabledButton = { disabled: true, dataset: {} };
  const root = {
    querySelectorAll() {
      return [clerkEnabledButton, clerkDisabledButton];
    },
  };

  setSignupActionsConsentState(root, false);
  assert.equal(clerkEnabledButton.disabled, true);
  assert.equal(clerkEnabledButton.dataset.meadowConsentDisabled, "true");
  assert.equal(clerkDisabledButton.disabled, true);
  assert.equal(clerkDisabledButton.dataset.meadowConsentDisabled, undefined);

  setSignupActionsConsentState(root, true);
  assert.equal(clerkEnabledButton.disabled, false);
  assert.equal(clerkEnabledButton.dataset.meadowConsentDisabled, undefined);
  assert.equal(clerkDisabledButton.disabled, true);
});

test("signup action detection tolerates non-element event targets", () => {
  assert.equal(isSignupAction({ closest: () => ({}) }), true);
  assert.equal(isSignupAction({ closest: () => null }), false);
  assert.equal(isSignupAction(null), false);
});

test("signup consent metadata is withheld until the privacy policy is accepted", () => {
  assert.equal(buildSignupConsentMetadata({
    privacyAcceptedAt: null,
    marketingOptIn: true,
    marketingUpdatedAt: "2026-10-01T12:00:00.000Z",
  }), undefined);
});

test("signup consent metadata records the policy version and explicit marketing choice", () => {
  assert.deepEqual(buildSignupConsentMetadata({
    privacyAcceptedAt: "2026-10-01T12:00:00.000Z",
    marketingOptIn: true,
    marketingUpdatedAt: "2026-10-01T12:01:00.000Z",
  }), {
    signupConsent: {
      privacyPolicy: {
        acceptedAt: "2026-10-01T12:00:00.000Z",
        version: PRIVACY_POLICY_VERSION,
      },
      marketingEmails: {
        optedIn: true,
        updatedAt: "2026-10-01T12:01:00.000Z",
      },
      source: "signup",
    },
  });
});

test("an untouched optional marketing choice remains opted out", () => {
  const metadata = buildSignupConsentMetadata({
    privacyAcceptedAt: "2026-10-01T12:00:00.000Z",
    marketingOptIn: false,
    marketingUpdatedAt: null,
  });

  assert.deepEqual(metadata.signupConsent.marketingEmails, {
    optedIn: false,
    updatedAt: null,
  });
});
