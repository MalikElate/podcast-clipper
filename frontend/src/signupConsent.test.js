import assert from "node:assert/strict";
import test from "node:test";
import { buildSignupConsentMetadata, PRIVACY_POLICY_VERSION } from "./signupConsent.js";

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
