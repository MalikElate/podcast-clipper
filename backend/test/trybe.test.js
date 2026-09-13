import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { TrybeService, stripeAmount } from "../src/bridge/services/TrybeService.js";
import { BillingService } from "../src/bridge/services/BillingService.js";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { deletionMarker } from "../src/bridge/services/PrivacyService.js";

const metadata = { meadowUserId: "alice", meadowPlanId: "starter", trybeVisitorId: "visitor-123" };
const env = { TRYBE_ORDERS_API_KEY: "sk_test_fixture", TRYBE_STORE_ID: "store-123", STRIPE_WEBHOOK_SECRET: "whsec_fixture" };
const invoice = (overrides = {}) => ({
  id: "in_initial", livemode: true, status: "paid", amount_paid: 2900, currency: "usd",
  customer_email: "buyer@example.com", created: 1789326000, status_transitions: { paid_at: 1789326060 },
  parent: { subscription_details: { subscription: "sub_123", metadata } }, ...overrides,
});
function setup(t, reply = () => Response.json({ success: true })) {
  const store = new SqliteStore(); t.after(() => store.close());
  const calls = [];
  const trybe = new TrybeService({ store, env, fetchImpl: async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) }); return reply();
  } });
  return { store, calls, trybe };
}

test("reads only the correct Trybe cookie and rejects malformed visitor IDs", t => {
  const { trybe } = setup(t);
  assert.equal(trybe.visitorId("session=secret; ugc_vid_store-123=visitor-123; ugc_vid_other=other"), "visitor-123");
  assert.equal(trybe.visitorId("ugc_vid=legacy-visitor"), "legacy-visitor");
  assert.equal(trybe.visitorId("ugc_vid_other=other"), null);
  assert.equal(trybe.visitorId("ugc_vid=%E0%A4%A"), null);
  assert.equal(trybe.visitorId("ugc_vid=bad%20value"), null);
  assert.equal(trybe.visitorId(), null);
});

test("paid invoices send actual amounts, buyer attribution and payment time once per invoice", async t => {
  const { calls, trybe } = setup(t);
  await trybe.invoicePaid(invoice(), {});
  await trybe.invoicePaid(invoice(), {});
  await trybe.invoicePaid(invoice({ id: "in_renewal", amount_paid: 2400 }), {});
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://jointrybe.com/attribution/v1/orders");
  assert.deepEqual(calls[0].body, {
    apiKey: env.TRYBE_ORDERS_API_KEY, orderId: "in_initial", value: 29, currency: "USD",
    vid: "visitor-123", email: "buyer@example.com", orderTime: "2026-09-13T19:01:00.000Z",
  });
  assert.equal(calls[1].body.value, 24);
  assert.equal(calls[0].options.redirect, "error");
});

test("Stripe amount conversion supports adaptive pricing and currency exceptions", () => {
  assert.equal(stripeAmount(2900, "usd"), 29);
  assert.equal(stripeAmount(17052, "xaf"), 17052);
  assert.equal(stripeAmount(12345, "kwd"), 12.345);
  assert.equal(stripeAmount(50000, "isk"), 500);
  assert.equal(stripeAmount(50000, "ugx"), 500);
});

test("never sends unpaid, zero-value, test-mode, unrelated or unattributed orders", async t => {
  const { calls, trybe } = setup(t);
  for (const candidate of [
    invoice({ status: "open" }), invoice({ amount_paid: 0 }), invoice({ livemode: false }),
    invoice({ parent: null }),
    invoice({ parent: { subscription_details: { subscription: "sub_other", metadata: { trybeVisitorId: "visitor-123" } } } }),
    invoice({ parent: { subscription_details: { subscription: "sub_123", metadata: { meadowUserId: "alice", meadowPlanId: "starter" } } } }),
  ]) await trybe.invoicePaid(candidate, { subscriptions: { retrieve: async () => ({ metadata: {} }) } });
  assert.equal(calls.length, 0);
});

test("recovers attribution from Stripe subscription metadata for older invoice API versions", async t => {
  const { calls, trybe } = setup(t);
  await trybe.invoicePaid(invoice({ parent: null, subscription: "sub_123" }), {
    subscriptions: { retrieve: async id => { assert.equal(id, "sub_123"); return { metadata }; } },
  });
  assert.equal(calls[0].body.vid, "visitor-123");
});

test("Trybe failures remain retryable, and duplicate orders are acknowledged after a lost response", async t => {
  let attempt = 0;
  const { calls, store, trybe } = setup(t, () => {
    if (++attempt === 1) throw new Error("network failure");
    return Response.json({ success: false, error: "Duplicate order" }, { status: 409 });
  });
  await assert.rejects(trybe.invoicePaid(invoice(), {}), { status: 503, code: "trybe_unavailable" });
  assert.equal(store.get("trybe_order", "in_initial"), null);
  await trybe.invoicePaid(invoice(), {});
  await trybe.invoicePaid(invoice(), {});
  assert.equal(calls.length, 2);
  assert.equal(store.get("trybe_order", "in_initial").status, "sent");
});

test("HTTP errors and unsuccessful JSON do not mark an order delivered", async t => {
  for (const status of [200, 403, 409, 429, 500]) {
    const { store, trybe } = setup(t, () => Response.json({ success: false, error: "Other error" }, { status }));
    await assert.rejects(trybe.invoicePaid(invoice(), {}), { status: 503, code: "trybe_order_failed" });
    assert.equal(store.get("trybe_order", "in_initial"), null);
  }
});

test("only signature-verified invoice payment events reach Trybe", async t => {
  const { store, calls, trybe } = setup(t);
  const stripe = new Stripe("sk_test_fixture");
  const billing = new BillingService({ store, env, stripe, trybe, appUrl: "https://findmeadow.com" });
  const raw = JSON.stringify({ id: "evt_paid", type: "invoice.payment_succeeded", data: { object: invoice() } });
  await assert.rejects(billing.webhook(raw, "invalid"), { code: "invalid_webhook" });
  assert.equal(calls.length, 0);
  const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: env.STRIPE_WEBHOOK_SECRET });
  assert.deepEqual(await billing.webhook(raw, signature), { received: true });
  assert.equal(calls.length, 1);
});

test("read-only Brand API keys cannot enable order submissions", t => {
  const { store } = setup(t);
  const service = new TrybeService({ store, env: { ...env, TRYBE_ORDERS_API_KEY: "tk_live_read_only" } });
  assert.equal(service.configured, false);
});

test("delayed payment webhooks do not track deleted accounts", async t => {
  const { store, calls, trybe } = setup(t);
  store.put("privacyBlock", { id: deletionMarker("alice"), status: "complete" });
  await trybe.invoicePaid(invoice(), {});
  assert.equal(calls.length, 0);
});
