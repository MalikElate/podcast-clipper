import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { invariant } from "../core/errors.js";
import { LockService } from "../core/LockService.js";
import { deletionMarker } from "./PrivacyService.js";
import { TrybeService } from "./TrybeService.js";

const PLAN_PRICE_ENV = {
  starter: { monthly: "STRIPE_PRICE_STARTER_MONTHLY", yearly: "STRIPE_PRICE_STARTER_YEARLY" },
  creator: { monthly: "STRIPE_PRICE_CREATOR_MONTHLY", yearly: "STRIPE_PRICE_CREATOR_YEARLY" },
  growth: { monthly: "STRIPE_PRICE_GROWTH_MONTHLY", yearly: "STRIPE_PRICE_GROWTH_YEARLY" },
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", yearly: "STRIPE_PRICE_PRO_YEARLY" },
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]);
const stripeId = value => typeof value === "string" ? value : value?.id;

export class BillingService {
  constructor({ store, env = process.env, appUrl, stripe, trybe, locks, clock = () => Date.now() }) {
    this.store = store;
    this.env = env;
    this.appUrl = appUrl;
    this.stripe = stripe || (env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null);
    this.trybe = trybe || new TrybeService({ store, env });
    this.locks = locks || new LockService(store);
    this.clock = clock;
  }

  get configured() {
    const priceNames = Object.values(PLAN_PRICE_ENV).flatMap(cycles => Object.values(cycles));
    return Boolean(this.stripe && this.env.STRIPE_WEBHOOK_SECRET && priceNames.every(name => this.env[name]));
  }

  priceId(planId, cycle) {
    const cycles = Object.hasOwn(PLAN_PRICE_ENV, planId) ? PLAN_PRICE_ENV[planId] : null;
    const envName = cycles && Object.hasOwn(cycles, cycle) ? cycles[cycle] : null;
    invariant(envName, "Choose a valid Meadow plan and billing frequency.", { status: 400, code: "invalid_plan" });
    const priceId = this.env[envName];
    invariant(priceId, `The ${planId} ${cycle} plan is not configured for checkout.`, { status: 503, code: "billing_not_configured" });
    return priceId;
  }

  publicRecord(uid) {
    const record = this.store.get("billing", uid);
    if (!record) return { configured: this.configured, planId: null, cycle: null, status: "free", cancelAtPeriodEnd: false, currentPeriodEnd: null, canManage: false };
    return {
      configured: this.configured,
      planId: record.planId || null,
      cycle: record.cycle || null,
      status: record.status || "unknown",
      cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
      currentPeriodEnd: record.currentPeriodEnd || null,
      canManage: Boolean(record.customerId),
    };
  }

  async record(uid, refresh = false) {
    const current = this.store.get("billing", uid);
    if (refresh && current?.subscriptionId && this.stripe) await this.syncLatest(current.subscriptionId, uid);
    return this.publicRecord(uid);
  }

  assertNoSubscription(uid) {
    const current = this.store.get("billing", uid);
    invariant(!(current?.subscriptionId && ACTIVE_STATUSES.has(current.status)), "You already have a subscription. Use Manage billing to change or cancel it.", { status: 409, code: "subscription_exists" });
  }

  async recoverCheckout(uid) {
    const attempt = this.store.get("billing", uid)?.checkoutAttempt;
    if (!attempt) return;
    // Stripe retains idempotency keys for at least 24 hours. Never replay an
    // ambiguous older request with a new key and risk a second subscription.
    invariant(this.clock() - attempt.createdAt < 23 * 60 * 60 * 1000, "An earlier checkout needs to be checked. Please contact hello@findmeadow.com before trying again.", { status: 409, code: "checkout_pending" });
    let session;
    try {
      session = await this.stripe.checkout.sessions.create(attempt.params, { idempotencyKey: attempt.key });
    } catch (error) {
      // Validation failures never created a Checkout. Allow corrected settings
      // or expired parameters to be retried without retaining a broken attempt.
      if (error.type === "StripeInvalidRequestError" && [400, 404].includes(error.statusCode)) {
        this.store.put("billing", { ...this.store.get("billing", uid), checkoutAttempt: null });
        await this.store.flush();
      }
      throw error;
    }
    invariant(session.id && session.url, "Stripe could not open checkout. Please try again.", { status: 502, code: "checkout_unavailable" });
    this.store.put("checkout_session", { id: session.id, ownerUid: uid, planId: attempt.planId, cycle: attempt.cycle, priceId: attempt.priceId, createdAt: attempt.createdAt });
    this.store.put("billing", { ...this.store.get("billing", uid), checkoutAttempt: null });
    await this.store.flush();
    return session;
  }

  async checkout(uid, email, { planId, cycle } = {}, cookieHeader) {
    invariant(this.configured, "Stripe checkout is not configured.", { status: 503, code: "billing_not_configured" });
    const price = this.priceId(planId, cycle);
    return this.locks.withLock(`billing:${uid}`, async () => {
      let current = this.store.get("billing", uid);
      if (current?.subscriptionId) this.syncSubscription(await this.stripe.subscriptions.retrieve(current.subscriptionId), uid);
      this.assertNoSubscription(uid);
      await this.recoverCheckout(uid);
      for (const saved of this.store.list("checkout_session", { ownerUid: uid, limit: null }).filter(item => item.status !== "closed")) {
        const session = await this.stripe.checkout.sessions.retrieve(saved.id);
        if (session.status === "complete" && session.subscription) {
          this.syncSubscription(await this.stripe.subscriptions.retrieve(stripeId(session.subscription)), uid);
          this.assertNoSubscription(uid);
        }
        if (session.status === "open") {
          if (saved.priceId === price && session.url) return { url: session.url };
          // A changed selection replaces the old unpaid Checkout, so two tabs
          // cannot independently buy different subscriptions for one account.
          await this.stripe.checkout.sessions.expire(session.id);
        }
        this.store.put("checkout_session", { ...saved, status: "closed" });
      }
      current = this.store.get("billing", uid);
      const metadata = { meadowUserId: uid, meadowPlanId: planId, meadowBillingCycle: cycle };
      const visitorId = this.trybe.visitorId(cookieHeader);
      if (visitorId) metadata.trybeVisitorId = visitorId;
      const params = {
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        client_reference_id: uid,
        ...(current?.customerId ? { customer: current.customerId } : email ? { customer_email: email } : {}),
        allow_promotion_codes: true,
        billing_address_collection: "auto",
        success_url: `${this.appUrl}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.appUrl}/pricing?checkout=cancelled`,
        expires_at: Math.floor(this.clock() / 1000) + 3600,
        metadata,
        subscription_data: { metadata },
      };
      this.store.put("billing", { ...current, id: uid, ownerUid: uid, status: current?.status || "free", createdAt: current?.createdAt || this.clock(), checkoutAttempt: { key: randomUUID(), createdAt: this.clock(), planId, cycle, priceId: price, params } });
      // Save the retry key before sending the request, including across restarts.
      await this.store.flush();
      const session = await this.recoverCheckout(uid);
      return { url: session.url };
    });
  }

  async confirmCheckout(uid, sessionId) {
    invariant(this.stripe, "Stripe billing is not configured.", { status: 503, code: "billing_not_configured" });
    invariant(typeof sessionId === "string" && /^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(sessionId) && sessionId.length <= 255, "Invalid checkout session.", { status: 400, code: "invalid_checkout" });
    return this.locks.withLock(`billing:${uid}`, async () => {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      invariant(session.mode === "subscription" && session.client_reference_id === uid && session.metadata?.meadowUserId === uid, "Checkout session not found.", { status: 404, code: "checkout_not_found" });
      if (session.status === "complete" && session.subscription) {
        const subscription = await this.stripe.subscriptions.retrieve(stripeId(session.subscription));
        invariant(subscription.metadata?.meadowUserId === uid, "Checkout session not found.", { status: 404, code: "checkout_not_found" });
        this.syncSubscription(subscription, uid);
      }
      return { billing: this.publicRecord(uid), checkoutStatus: session.status, paymentStatus: session.payment_status };
    });
  }

  async cancelForDeletion(uid) {
    await this.recoverCheckout(uid);
    const record = this.store.get("billing", uid);
    const sessions = this.store.list("checkout_session", { ownerUid: uid, limit: null });
    if (!record && !sessions.length) return;
    invariant(this.stripe || !(record?.subscriptionId || sessions.length), "Billing cancellation needs server configuration.", { code: "billing_not_configured" });
    for (const saved of sessions) {
      const session = await this.stripe.checkout.sessions.retrieve(saved.id);
      if (session.status === "open") await this.stripe.checkout.sessions.expire(session.id);
      if (session.subscription) await this.cancelSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
      this.store.remove("checkout_session", saved.id);
    }
    if (record?.subscriptionId) await this.cancelSubscription(record.subscriptionId);
  }

  async cancelSubscription(id) {
    const subscription = await this.stripe.subscriptions.retrieve(id);
    if (ACTIVE_STATUSES.has(subscription.status)) await this.stripe.subscriptions.cancel(id);
  }

  async portal(uid) {
    invariant(this.stripe, "Stripe billing is not configured.", { status: 503, code: "billing_not_configured" });
    const record = this.store.get("billing", uid);
    invariant(record?.customerId, "No Stripe billing account is connected yet.", { status: 404, code: "billing_account_missing" });
    const session = await this.stripe.billingPortal.sessions.create({ customer: record.customerId, return_url: `${this.appUrl}/dashboard/billing?portal_return=1` });
    return { url: session.url };
  }

  identifyPlan(priceId) {
    for (const [planId, cycles] of Object.entries(PLAN_PRICE_ENV)) {
      for (const [cycle, envName] of Object.entries(cycles)) if (this.env[envName] === priceId) return { planId, cycle };
    }
    return {};
  }

  userForCustomer(customerId) {
    return this.store.list("billing", { limit: null }).find(item => item.customerId === customerId)?.ownerUid || null;
  }

  syncSubscription(subscription, fallbackUid = null) {
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    const uid = subscription.metadata?.meadowUserId || fallbackUid || this.userForCustomer(customerId);
    if (!uid || this.store.get("privacyBlock", deletionMarker(uid))) return null;
    const priceId = subscription.items?.data?.[0]?.price?.id || null;
    const mapped = this.identifyPlan(priceId);
    if (!mapped.planId) return null;
    const current = this.store.get("billing", uid);
    // A delayed cancellation for an old subscription must not replace the
    // replacement subscription. Updates for one subscription use a live read.
    if (current?.subscriptionId && current.subscriptionId !== subscription.id && ACTIVE_STATUSES.has(current.status)) return null;
    const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
    return this.store.put("billing", {
      ...current,
      id: uid,
      ownerUid: uid,
      customerId,
      subscriptionId: subscription.id,
      planId: mapped.planId,
      cycle: mapped.cycle,
      priceId,
      status: subscription.status,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: (itemPeriodEnd || subscription.current_period_end) ? (itemPeriodEnd || subscription.current_period_end) * 1000 : null,
      createdAt: current?.createdAt || this.clock(),
      updatedAt: this.clock(),
    });
  }

  async syncLatest(subscriptionId, uid) {
    if (!uid) return;
    return this.locks.withLock(`billing:${uid}`, async () => {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      if (this.store.get("privacyBlock", deletionMarker(uid))) {
        if (ACTIVE_STATUSES.has(subscription.status)) await this.cancelSubscription(subscription.id);
        return null;
      }
      return this.syncSubscription(subscription, uid);
    });
  }

  async webhook(rawBody, signature) {
    invariant(this.stripe && this.env.STRIPE_WEBHOOK_SECRET, "Stripe webhooks are not configured.", { status: 503, code: "billing_not_configured" });
    invariant(signature, "Missing Stripe webhook signature.", { status: 400, code: "invalid_webhook" });
    let event;
    try { event = this.stripe.webhooks.constructEvent(rawBody, signature, this.env.STRIPE_WEBHOOK_SECRET); }
    catch { invariant(false, "Invalid Stripe webhook signature.", { status: 400, code: "invalid_webhook" }); }

    const object = event.data.object;
    if (event.type === "checkout.session.completed" && object.mode === "subscription") {
      const uid = object.client_reference_id || object.metadata?.meadowUserId;
      if (uid && object.subscription) {
        await this.syncLatest(stripeId(object.subscription), uid);
      }
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(event.type)) {
      await this.syncLatest(object.id, object.metadata?.meadowUserId || this.userForCustomer(stripeId(object.customer)));
    } else if (["invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
      const details = object.parent?.subscription_details || object.subscription_details;
      const subscriptionId = stripeId(details?.subscription || object.subscription);
      const uid = details?.metadata?.meadowUserId || this.userForCustomer(stripeId(object.customer));
      if (subscriptionId) await this.syncLatest(subscriptionId, uid);
    } else if (event.type === "invoice.payment_succeeded") {
      // Covers the first payment and renewals, without counting Checkout twice.
      await this.trybe.invoicePaid(object, this.stripe);
    }
    return { received: true };
  }
}
