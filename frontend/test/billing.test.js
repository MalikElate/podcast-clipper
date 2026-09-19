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


test("dashboard normalization preserves checkout and portal returns until billing can load", async () => {
  const { dashboardSearch, dashboardView, dashboardPath } = await import("../src/bridge/dashboardRoutes.js");
  const query = "?view=billing&checkout=success&session_id=cs_live_123&connection=private";
  const view = dashboardView("/dashboard/", query);
  assert.equal(dashboardPath(view) + dashboardSearch(view, query), "/dashboard/billing?checkout=success&session_id=cs_live_123");
  assert.equal(dashboardSearch("billing", "?portal_return=1"), "?portal_return=1");
  assert.equal(dashboardSearch("accounts", "?connection=private&session_id=cs_live_123"), "");
  assert.equal(dashboardSearch("billing"), "");
});
