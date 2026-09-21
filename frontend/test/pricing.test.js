import assert from "node:assert/strict";
import test from "node:test";
import { PLANS, PAID_PLANS, planBillingNote, planHref } from "../src/pricing.js";
import { billingPlanAction, SUBSCRIPTION_STATUSES } from "../src/bridge/billingState.js";

test("all pricing surfaces share Free, Starter, Creator and Pro capacities", () => {
  assert.deepEqual(PLANS.map(({ id, accounts }) => [id, accounts]), [
    ["free", "5 connected social accounts"],
    ["starter", "10 connected social accounts"],
    ["creator", "25 connected social accounts"],
    ["pro", "Unlimited connected accounts"],
  ]);
  assert.deepEqual(PAID_PLANS.map(plan => plan.id), ["starter", "creator", "pro"]);
  const free = PLANS[0];
  assert.equal(free.monthly, 0);
  assert.equal(free.yearly, 0);
  for (const yearly of [false, true]) assert.equal(planBillingNote(free, yearly), "No credit card required");
  assert.equal(new URL(planHref(free)).pathname, "/dashboard");
});

test("Free is the current plan without a subscription and never opens checkout", () => {
  for (const status of ["free", "canceled", "incomplete_expired"]) {
    assert.deepEqual(billingPlanAction("free", { status }), { current: true, action: "none", label: "Current plan" });
    assert.equal(billingPlanAction("starter", { status }).action, "checkout");
  }
  assert.equal(billingPlanAction("free", null).current, false);
  assert.equal(billingPlanAction("free", null).action, "none");
});

test("paid subscribers manage changes through the portal, including legacy Growth", () => {
  for (const status of SUBSCRIPTION_STATUSES) {
    for (const planId of ["starter", "creator", "growth", "pro"]) {
      const billing = { status, planId };
      assert.deepEqual(billingPlanAction("free", billing), { current: false, action: "portal", label: "Manage subscription" });
      assert.equal(billingPlanAction("starter", billing).action, "portal");
    }
  }
  assert.deepEqual(billingPlanAction("creator", { status: "active", planId: "creator" }), { current: true, action: "portal", label: "Manage current plan" });
});
