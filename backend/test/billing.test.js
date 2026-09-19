import test from "node:test";
import assert from "node:assert/strict";
import { BillingService } from "../src/bridge/services/BillingService.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { deletionMarker } from "../src/bridge/services/PrivacyService.js";

function fixture(t) {
  const store = new SqliteStore();
  t.after(() => store.close());
  const env = { STRIPE_WEBHOOK_SECRET: "fixture" };
  for (const plan of ["starter", "creator", "growth", "pro"]) for (const cycle of ["monthly", "yearly"]) env[`STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`] = `price_${plan}_${cycle}`;
  const sessions = new Map(), keys = new Map(), subscriptions = new Map(), calls = { created: 0, attempts: [], expired: [], cancelled: [] };
  let now = Date.now(), loseResponse = false, event;
  const stripe = {
    checkout: { sessions: {
      create: async (params, options) => {
        calls.attempts.push({ params, ...options });
        let session = keys.get(options.idempotencyKey);
        if (!session) {
          session = { ...params, id: `cs_test_session${++calls.created}`, url: `https://checkout.stripe.com/session${calls.created}`, status: "open", payment_status: "unpaid" };
          sessions.set(session.id, session); keys.set(options.idempotencyKey, session);
        }
        if (loseResponse) { loseResponse = false; throw new Error("network response lost"); }
        return session;
      },
      retrieve: async id => { assert.ok(sessions.has(id)); return sessions.get(id); },
      expire: async id => { calls.expired.push(id); sessions.get(id).status = "expired"; },
    } },
    subscriptions: {
      retrieve: async id => { assert.ok(subscriptions.has(id), id); return subscriptions.get(id); },
      cancel: async id => { calls.cancelled.push(id); subscriptions.get(id).status = "canceled"; },
    },
    webhooks: { constructEvent: () => event },
    billingPortal: { sessions: { create: async input => ({ url: "https://billing.stripe.com/session", ...input }) } },
  };
  const options = { store, env, stripe, appUrl: "https://app.findmeadow.com", clock: () => now };
  const billing = new BillingService(options);
  function subscription({ id = "sub_alice", status = "active", planId = "starter", cycle = "monthly" } = {}) {
    const sub = { id, status, customer: "cus_alice", metadata: { meadowUserId: "alice", meadowPlanId: "starter", meadowBillingCycle: "monthly" }, items: { data: [{ price: { id: `price_${planId}_${cycle}` }, current_period_end: 1800000000 }] } };
    subscriptions.set(id, sub); return sub;
  }
  return { store, billing, options, calls, sessions, subscriptions, subscription, setEvent: value => { event = value; }, loseResponse: () => { loseResponse = true; }, advance: ms => { now += ms; } };
}
const starter = { planId: "starter", cycle: "monthly" };

test("concurrent checkout requests reuse one Stripe session and changing plans expires it", async t => {
  const h = fixture(t);
  const [first, second] = await Promise.all([h.billing.checkout("alice", "alice@example.test", starter), h.billing.checkout("alice", "alice@example.test", starter)]);
  assert.equal(first.url, second.url); assert.equal(h.calls.created, 1);
  const changed = await h.billing.checkout("alice", "alice@example.test", { planId: "creator", cycle: "yearly" });
  assert.notEqual(changed.url, first.url); assert.deepEqual(h.calls.expired, ["cs_test_session1"]);
  assert.equal(h.calls.attempts.at(-1).params.line_items[0].price, "price_creator_yearly");
});

test("a lost Stripe response is recovered with the durable key after service restart", async t => {
  const h = fixture(t); h.loseResponse();
  await assert.rejects(h.billing.checkout("alice", "alice@example.test", starter), /response lost/);
  const restarted = new BillingService(h.options);
  const result = await restarted.checkout("alice", "new-email@example.test", starter);
  assert.equal(result.url, "https://checkout.stripe.com/session1"); assert.equal(h.calls.created, 1);
  assert.equal(h.calls.attempts[0].idempotencyKey, h.calls.attempts[1].idempotencyKey);
  assert.deepEqual(h.calls.attempts[0].params, h.calls.attempts[1].params);
  assert.equal(h.store.get("billing", "alice").checkoutAttempt, null);
});

test("a retry key too old to safely replay never creates another checkout", async t => {
  const h = fixture(t); h.loseResponse();
  await assert.rejects(h.billing.checkout("alice", null, starter));
  h.advance(24 * 3600 * 1000);
  await assert.rejects(h.billing.checkout("alice", null, starter), { code: "checkout_pending" });
  assert.equal(h.calls.created, 1);
});

test("durable storage failure stops checkout before Stripe receives a request", async t => {
  const h = fixture(t); h.store.flush = async () => { throw new Error("storage unavailable"); };
  await assert.rejects(h.billing.checkout("alice", null, starter), /storage unavailable/);
  assert.equal(h.calls.created, 0);
});

test("completed checkout blocks a second subscription even before the webhook arrives", async t => {
  const h = fixture(t); await h.billing.checkout("alice", null, starter);
  const session = h.sessions.get("cs_test_session1"); session.status = "complete"; session.subscription = h.subscription().id;
  await assert.rejects(h.billing.checkout("alice", null, starter), { code: "subscription_exists" });
  assert.equal(h.calls.created, 1); assert.equal(h.billing.publicRecord("alice").status, "active");
});

test("confirmation verifies the owner and checks Stripe instead of trusting the success URL", async t => {
  const h = fixture(t); await h.billing.checkout("alice", null, starter);
  await assert.rejects(h.billing.confirmCheckout("bob", "cs_test_session1"), { code: "checkout_not_found" });
  await assert.rejects(h.billing.confirmCheckout("alice", "https://evil.example/session"), { code: "invalid_checkout" });
  const pending = await h.billing.confirmCheckout("alice", "cs_test_session1");
  assert.equal(pending.paymentStatus, "unpaid"); assert.equal(pending.billing.status, "free");
  Object.assign(h.sessions.get("cs_test_session1"), { status: "complete", payment_status: "paid", subscription: h.subscription().id });
  const confirmed = await h.billing.confirmCheckout("alice", "cs_test_session1");
  assert.equal(confirmed.billing.status, "active"); assert.equal(confirmed.billing.planId, "starter");
  assert.equal(h.store.get("billing", "bob"), null);
});

test("portal price changes override the original Checkout plan metadata", async t => {
  const h = fixture(t), sub = h.subscription({ planId: "growth", cycle: "yearly" });
  h.billing.syncSubscription(sub);
  assert.equal(h.billing.publicRecord("alice").planId, "growth"); assert.equal(h.billing.publicRecord("alice").cycle, "yearly");
  sub.cancel_at_period_end = true;
  const refreshed = await h.billing.record("alice", true);
  assert.equal(refreshed.cancelAtPeriodEnd, true); assert.equal(refreshed.currentPeriodEnd, 1800000000000);
});

test("out-of-order subscription webhooks read current Stripe state, and old cancellations cannot overwrite a replacement", async t => {
  const h = fixture(t), sub = h.subscription({ planId: "pro", cycle: "yearly" });
  h.setEvent({ type: "customer.subscription.updated", data: { object: { ...sub, status: "past_due", items: { data: [{ price: { id: "price_starter_monthly" } }] } } } });
  await h.billing.webhook(Buffer.from("{}"), "signature");
  assert.equal(h.billing.publicRecord("alice").status, "active"); assert.equal(h.billing.publicRecord("alice").planId, "pro");
  const old = h.subscription({ id: "sub_old", status: "canceled" });
  h.setEvent({ type: "customer.subscription.deleted", data: { object: old } });
  await h.billing.webhook(Buffer.from("{}"), "signature");
  assert.equal(h.store.get("billing", "alice").subscriptionId, "sub_alice");
});

test("failed renewal updates billing and unrelated prices cannot overwrite the Meadow plan", async t => {
  const h = fixture(t), sub = h.subscription(); h.billing.syncSubscription(sub); sub.status = "past_due";
  h.setEvent({ type: "invoice.payment_failed", data: { object: { customer: "cus_alice", parent: { subscription_details: { subscription: sub.id } } } } });
  await h.billing.webhook(Buffer.from("{}"), "signature");
  assert.equal(h.billing.publicRecord("alice").status, "past_due");
  assert.equal(h.billing.syncSubscription({ ...sub, items: { data: [{ price: { id: "unrelated_product_price" } }] } }), null);
  assert.equal(h.billing.publicRecord("alice").planId, "starter");
});

test("account deletion recovers and expires an ambiguous checkout, and late subscription events cannot restore billing", async t => {
  const h = fixture(t); h.loseResponse();
  await assert.rejects(h.billing.checkout("alice", null, starter));
  await h.billing.cancelForDeletion("alice");
  assert.equal(h.calls.created, 1); assert.deepEqual(h.calls.expired, ["cs_test_session1"]);
  h.store.remove("billing", "alice");
  h.store.put("privacyBlock", { id: deletionMarker("alice") });
  const sub = h.subscription(); h.setEvent({ type: "customer.subscription.updated", data: { object: sub } });
  await h.billing.webhook(Buffer.from("{}"), "signature");
  assert.deepEqual(h.calls.cancelled, [sub.id]); assert.equal(h.store.get("billing", "alice"), null);
});


test("invalid plan properties cannot select a price and a rejected Stripe request can be corrected", async t => {
  const h = fixture(t);
  await assert.rejects(h.billing.checkout("alice", null, { planId: "constructor", cycle: "monthly" }), { code: "invalid_plan" });
  await assert.rejects(h.billing.checkout("alice", null, { planId: "starter", cycle: "toString" }), { code: "invalid_plan" });
  const create = h.options.stripe.checkout.sessions.create;
  h.options.stripe.checkout.sessions.create = async () => { throw Object.assign(new Error("Invalid price"), { type: "StripeInvalidRequestError", statusCode: 400 }); };
  await assert.rejects(h.billing.checkout("alice", null, starter), /Invalid price/);
  assert.equal(h.store.get("billing", "alice").checkoutAttempt, null);
  h.options.stripe.checkout.sessions.create = create;
  assert.equal((await h.billing.checkout("alice", null, starter)).url, "https://checkout.stripe.com/session1");
});
