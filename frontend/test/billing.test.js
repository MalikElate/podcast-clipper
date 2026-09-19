import test from "node:test";
import assert from "node:assert/strict";
import { checkoutNotice, billingWarning, SUBSCRIPTION_STATUSES } from "../src/bridge/billingState.js";

test("only confirmed, paid, active checkout shows payment confirmation", () => {
  for (const result of [{}, { checkoutStatus: "complete", paymentStatus: "unpaid", billing: { status: "active" } }, { checkoutStatus: "open", paymentStatus: "paid", billing: { status: "active" } }, { checkoutStatus: "complete", paymentStatus: "paid", billing: { status: "incomplete" } }]) {
    assert.equal(checkoutNotice(result).pending, true);
    assert.doesNotMatch(checkoutNotice(result).message, /Payment confirmed/);
  }
  const success = checkoutNotice({ checkoutStatus: "complete", paymentStatus: "paid", billing: { status: "active" } });
  assert.equal(success.pending, false); assert.match(success.message, /Payment confirmed/);
});

test("zero-charge trials, expired checkouts, and failed payments are distinguished", () => {
  assert.equal(checkoutNotice({ checkoutStatus: "expired" }).pending, false);
  assert.match(checkoutNotice({ checkoutStatus: "complete", paymentStatus: "no_payment_required", billing: { status: "trialing" } }).message, /trial is active/);
  assert.match(billingWarning("past_due"), /payment needs attention/);
  assert.match(billingWarning("incomplete"), /hasn’t completed/);
  assert.equal(billingWarning("active"), "");
  assert.equal(SUBSCRIPTION_STATUSES.has("paused"), true);
  assert.equal(SUBSCRIPTION_STATUSES.has("canceled"), false);
});
