import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignupConsentMetadata,
  isSignupAction,
  PRIVACY_POLICY_VERSION,
  SIGNUP_ACTION_SELECTOR,
  preventSignupWithoutConsent,
} from "./signupConsent.js";

test("the consent gate covers Clerk's visible primary action", () => {
  assert.match(SIGNUP_ACTION_SELECTOR, /\.cl-formButtonPrimary/);
});

function signupEvent({ type = "click", action = true } = {}) {
  return {
    type,
    target: { closest: () => action ? {} : null },
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

test("clicking a signup action without consent stops OAuth or signup from starting", () => {
  const event = signupEvent();
  assert.equal(preventSignupWithoutConsent(event, false), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test("submitting the form without consent is blocked, including keyboard submission", () => {
  const event = signupEvent({ type: "submit", action: false });
  assert.equal(preventSignupWithoutConsent(event, false), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test("signup actions and form submission proceed when privacy consent is accepted", () => {
  for (const type of ["click", "submit"]) {
    const event = signupEvent({ type });
    assert.equal(preventSignupWithoutConsent(event, true), false);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.propagationStopped, false);
  }
});

test("other form controls remain usable without privacy consent", () => {
  const event = signupEvent({ action: false });
  assert.equal(preventSignupWithoutConsent(event, false), false);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
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
