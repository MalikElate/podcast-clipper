import test from "node:test";
import assert from "node:assert/strict";
import { BillingService } from "../src/bridge/services/BillingService.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { deletionMarker } from "../src/bridge/services/PrivacyService.js";
import { pricingForCountry } from "../src/bridge/shared/regionalPricing.js";

function fixture(t) {
  const store = new SqliteStore();
  t.after(() => store.close());
  const env = { STRIPE_WEBHOOK_SECRET: "fixture" };
  for (const plan of ["starter", "creator", "growth", "pro"]) for (const cycle of ["monthly", "yearly"]) env[`STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`] = `price_${plan}_${cycle}`;
  const sessions = new Map(), keys = new Map(), subscriptions = new Map(), calls = { created: 0, attempts: [], expired: [], cancelled: [], configurations: [], portals: [] };
  let now = Date.now(), loseResponse = false, event;
  const stripe = {
    checkout: { sessions: {
      create: async (params, options) => {
        calls.attempts.push({ params, ...options });
        let session = keys.get(options.idempotencyKey);
        if (!session) {
          session = { ...params, id: `cs_test_session${++calls.created}`, url: `https://checkout.stripe.com/session${calls.created}`, status: "open", payment_status: "unpaid" };
          if (params.line_items[0].price_data) {
            session.currency = params.line_items[0].price_data.currency;
            session.amount_subtotal = params.line_items[0].price_data.unit_amount;
          }
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
    prices: { retrieve: async id => ({ id, product: `prod_${id.split("_")[1]}`, recurring: { interval: id.endsWith("yearly") ? "year" : "month" } }) },
    webhooks: { constructEvent: () => event },
    billingPortal: {
      configurations: { create: async (input, options) => { calls.configurations.push({ input, options }); return { id: `bpc_${calls.configurations.length}` }; } },
      sessions: { create: async input => { calls.portals.push(input); return { url: "https://billing.stripe.com/session", ...input }; } },
    },
  };
  const options = { store, env, stripe, appUrl: "https://app.findmeadow.com", clock: () => now };
  const billing = new BillingService(options);
  function subscription({ id = "sub_alice", status = "active", planId = "starter", cycle = "monthly" } = {}) {
    const sub = { id, status, customer: "cus_alice", metadata: { meadowUserId: "alice", meadowPlanId: "starter", meadowBillingCycle: "monthly" }, items: { data: [{ price: { id: `price_${planId}_${cycle}` }, current_period_end: 1800000000 }] } };
    subscriptions.set(id, sub); return sub;
  }
  function regionalSubscription({ id = "sub_regional", sessionId = "cs_test_session1", uid = "alice", priceId = "price_generated", overrides = {} } = {}) {
    const session = sessions.get(sessionId);
    const data = session.line_items[0].price_data;
    const sub = { id, status: "active", customer: "cus_alice", metadata: { ...session.subscription_data.metadata },
      items: { data: [{ quantity: 1, price: { id: priceId, product: data.product, currency: data.currency,
        unit_amount: data.unit_amount, recurring: data.recurring }, current_period_end: 1800000000 }] }, ...overrides };
    sub.metadata.meadowUserId = uid;
    subscriptions.set(id, sub); return sub;
  }
  return { store, billing, options, calls, sessions, subscriptions, subscription, regionalSubscription,
    setEvent: value => { event = value; }, loseResponse: () => { loseResponse = true; }, advance: ms => { now += ms; } };
}
const starter = { planId: "starter", cycle: "monthly" };

test("concurrent checkout requests reuse one Stripe session and changing plans expires it", async t => {
  const h = fixture(t);
  const [first, second] = await Promise.all([h.billing.checkout("alice", "alice@example.test", starter), h.billing.checkout("alice", "alice@example.test", starter)]);
  assert.equal(first.url, second.url); assert.equal(h.calls.created, 1);
  const changed = await h.billing.checkout("alice", "alice@example.test", { planId: "creator", cycle: "yearly" });
  assert.notEqual(changed.url, first.url); assert.deepEqual(h.calls.expired, ["cs_test_session1"]);
  assert.equal(h.calls.attempts.at(-1).params.line_items[0].price, "price_creator_yearly");
  assert.deepEqual(h.calls.attempts.at(-1).params.adaptive_pricing, { enabled: false });
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

test("regional checkout uses the fixed catalog amount and the configured plan product", async t => {
  const h = fixture(t), pricing = pricingForCountry("CM");
  await h.billing.checkout("alice", "alice@example.test", starter, null, { countryCode: "CM" });
  const params = h.calls.attempts[0].params;
  assert.deepEqual(params.adaptive_pricing, { enabled: false });
  assert.deepEqual(params.line_items, [{ price_data: {
    currency: pricing.currency.toLowerCase(), product: "prod_starter", unit_amount: pricing.plans.starter.monthlyMinor,
    recurring: { interval: "month" },
  }, quantity: 1 }]);
  assert.equal(params.metadata.meadowCountryCode, "CM");
  assert.equal(params.subscription_data.metadata.meadowCheckoutKey, params.metadata.meadowCheckoutKey);
  const saved = h.store.list("checkout_session", { ownerUid: "alice" })[0];
  assert.equal(saved.currency, pricing.currency); assert.equal(saved.amountMinor, pricing.plans.starter.monthlyMinor);
  assert.equal(saved.productId, "prod_starter");
  await assert.rejects(h.billing.checkout("bob", null, { planId: "growth", cycle: "monthly" }, null, { countryCode: "CM" }), { code: "invalid_plan" });
});

test("regional checkout charges the catalog currency for NGN and EUR fallback countries", async t => {
  const h = fixture(t);
  for (const [uid, countryCode, currency] of [["nigerian", "NG", "NGN"], ["eritrean", "ER", "EUR"]]) {
    const pricing = pricingForCountry(countryCode);
    await h.billing.checkout(uid, null, { planId: "pro", cycle: "yearly" }, null, { countryCode });
    const data = h.calls.attempts.at(-1).params.line_items[0].price_data;
    assert.equal(pricing.currency, currency);
    assert.equal(data.currency, currency.toLowerCase());
    assert.equal(data.unit_amount, pricing.plans.pro.yearlyMinor);
    assert.equal(data.product, "prod_pro");
    assert.deepEqual(data.recurring, { interval: "year" });
  }
  assert.equal(pricingForCountry("ER").usesFallback, true);
});

test("large UGX and TZS annual charges offer only card payments", async t => {
  const h = fixture(t);
  for (const [uid, countryCode] of [["ugandan", "UG"], ["tanzanian", "TZ"]]) {
    const pricing = pricingForCountry(countryCode);
    assert.ok(pricing.plans.pro.yearlyMinor > 99_999_999);
    await h.billing.checkout(uid, null, { planId: "pro", cycle: "yearly" }, null, { countryCode });
    const params = h.calls.attempts.at(-1).params;
    assert.deepEqual(params.payment_method_types, ["card"]);
    assert.equal(params.line_items[0].price_data.unit_amount, pricing.plans.pro.yearlyMinor);
  }
  await h.billing.checkout("monthly", null, { planId: "pro", cycle: "monthly" }, null, { countryCode: "UG" });
  assert.equal(h.calls.attempts.at(-1).params.payment_method_types, undefined);
});

test("a changed visitor quote stops checkout before Stripe is called", async t => {
  const h = fixture(t), quote = pricingForCountry("CM");
  const quoted = { ...starter, expectedCountryCode: quote.countryCode,
    expectedCurrency: quote.currency, expectedAmountMinor: quote.plans.starter.monthlyMinor };
  await assert.rejects(h.billing.checkout("alice", null, quoted, null, { countryCode: "NG" }), { code: "pricing_changed", status: 409 });
  await assert.rejects(h.billing.checkout("alice", null, { ...quoted, expectedAmountMinor: 1 }, null, { countryCode: "CM" }), { code: "pricing_changed" });
  await assert.rejects(h.billing.checkout("alice", null, { ...starter, expectedCurrency: "XAF" }, null, { countryCode: "CM" }), { code: "pricing_changed" });
  const globalQuote = pricingForCountry("US");
  await assert.rejects(h.billing.checkout("alice", null, { ...starter,
    expectedCountryCode: globalQuote.countryCode, expectedCurrency: globalQuote.currency,
    expectedAmountMinor: globalQuote.plans.starter.monthlyMinor }, null, { countryCode: "CM" }), { code: "pricing_changed" });
  assert.equal(h.calls.created, 0);
  assert.equal(h.store.get("billing", "alice"), null);
  await h.billing.checkout("alice", null, quoted, null, { countryCode: "CM" });
  assert.equal(h.calls.created, 1);
});

test("regional checkout reuses only the matching country, currency, and amount", async t => {
  const h = fixture(t);
  const first = await h.billing.checkout("alice", null, starter, null, { countryCode: "CM" });
  assert.equal((await h.billing.checkout("alice", null, starter, null, { countryCode: "CM" })).url, first.url);
  const sameCurrency = await h.billing.checkout("alice", null, starter, null, { countryCode: "GA" });
  assert.notEqual(sameCurrency.url, first.url);
  assert.deepEqual(h.calls.expired, ["cs_test_session1"]);
  const second = await h.billing.checkout("alice", null, starter, null, { countryCode: "NG" });
  assert.notEqual(second.url, first.url);
  assert.deepEqual(h.calls.expired, ["cs_test_session1", "cs_test_session2"]);
  h.sessions.get("cs_test_session3").amount_subtotal++;
  await h.billing.checkout("alice", null, starter, null, { countryCode: "NG" });
  assert.deepEqual(h.calls.expired, ["cs_test_session1", "cs_test_session2", "cs_test_session3"]);
  assert.equal(h.calls.created, 4);
});

test("regional checkout retries an ambiguous Stripe response with the same inline price", async t => {
  const h = fixture(t); h.loseResponse();
  await assert.rejects(h.billing.checkout("alice", null, { planId: "pro", cycle: "yearly" }, null, { countryCode: "KE" }), /response lost/);
  const restarted = new BillingService(h.options);
  await restarted.checkout("alice", null, { planId: "pro", cycle: "yearly" }, null, { countryCode: "KE" });
  assert.equal(h.calls.created, 1);
  assert.equal(h.calls.attempts[0].idempotencyKey, h.calls.attempts[1].idempotencyKey);
  assert.deepEqual(h.calls.attempts[0].params, h.calls.attempts[1].params);
});

test("Stripe rejecting a regional currency returns a clear error and clears the attempt", async t => {
  const h = fixture(t);
  h.options.stripe.checkout.sessions.create = async () => { throw Object.assign(new Error("Currency unavailable"), { type: "StripeInvalidRequestError", statusCode: 400 }); };
  await assert.rejects(h.billing.checkout("alice", null, starter, null, { countryCode: "CM" }), { code: "regional_checkout_unavailable" });
  assert.equal(h.store.get("billing", "alice").checkoutAttempt, null);
  assert.equal(h.calls.created, 0);
});

test("regional webhook maps an inline Price only when metadata, owner, and price match checkout", async t => {
  const h = fixture(t);
  await h.billing.checkout("alice", null, { planId: "creator", cycle: "yearly" }, null, { countryCode: "CM" });
  const sub = h.regionalSubscription();
  h.setEvent({ type: "customer.subscription.created", data: { object: sub } });
  await h.billing.webhook(Buffer.from("{}"), "signature");
  assert.equal(h.billing.publicRecord("alice").planId, "creator");
  assert.equal(h.billing.publicRecord("alice").cycle, "yearly");
  assert.equal(h.store.get("billing", "alice").currency, "XAF");
  assert.equal(h.store.get("billing", "alice").priceId, "price_generated");

  sub.status = "past_due";
  sub.items.data[0].current_period_end = 1900000000;
  h.setEvent({ type: "customer.subscription.updated", data: { object: { ...sub, status: "active" } } });
  await new BillingService(h.options).webhook(Buffer.from("{}"), "signature");
  assert.equal(h.billing.publicRecord("alice").status, "past_due");
  assert.equal(h.billing.publicRecord("alice").currentPeriodEnd, 1900000000000);

  const invalid = [
    { ...sub, metadata: { ...sub.metadata, meadowPlanId: "pro" } },
    { ...sub, items: { data: [{ ...sub.items.data[0], price: { ...sub.items.data[0].price, product: "prod_unrelated" } }] } },
    { ...sub, items: { data: [{ ...sub.items.data[0], price: { ...sub.items.data[0].price, unit_amount: 1 } }] } },
    { ...sub, items: { data: [{ ...sub.items.data[0], price: { ...sub.items.data[0].price, currency: "usd" } }] } },
  ];
  for (const changed of invalid) assert.equal(h.billing.syncSubscription(changed, "alice"), null);
  assert.equal(h.billing.syncSubscription(sub, "bob"), null);
  assert.equal(h.store.get("billing", "alice").planId, "creator");
  assert.equal(h.store.get("billing", "bob"), null);
});

test("regional portal keeps cancellation and payment updates but disables plan switching", async t => {
  const h = fixture(t);
  await h.billing.checkout("alice", null, starter, null, { countryCode: "CM" });
  h.billing.syncSubscription(h.regionalSubscription());
  await h.billing.portal("alice");
  await h.billing.portal("alice");
  assert.equal(h.calls.configurations.length, 1);
  assert.equal(h.calls.configurations[0].input.features.subscription_update.enabled, false);
  assert.equal(h.calls.configurations[0].input.features.subscription_cancel.enabled, true);
  assert.equal(h.calls.configurations[0].input.features.payment_method_update.enabled, true);
  assert.equal(h.calls.portals[0].configuration, "bpc_1");
  h.store.put("billing", { id: "bob", ownerUid: "bob", customerId: "cus_bob", status: "active", region: "global" });
  await h.billing.portal("bob");
  assert.equal(h.calls.portals.at(-1).configuration, undefined);
});
