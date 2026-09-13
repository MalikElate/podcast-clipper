import Stripe from "stripe";
import { invariant } from "../core/errors.js";
import { deletionMarker } from "./PrivacyService.js";
import { TrybeService } from "./TrybeService.js";

const PLAN_PRICE_ENV = {
  starter: { monthly: "STRIPE_PRICE_STARTER_MONTHLY", yearly: "STRIPE_PRICE_STARTER_YEARLY" },
  creator: { monthly: "STRIPE_PRICE_CREATOR_MONTHLY", yearly: "STRIPE_PRICE_CREATOR_YEARLY" },
  growth: { monthly: "STRIPE_PRICE_GROWTH_MONTHLY", yearly: "STRIPE_PRICE_GROWTH_YEARLY" },
  pro: { monthly: "STRIPE_PRICE_PRO_MONTHLY", yearly: "STRIPE_PRICE_PRO_YEARLY" },
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);

export class BillingService {
  constructor({ store, env = process.env, appUrl, stripe, trybe }) {
    this.store = store;
    this.env = env;
    this.appUrl = appUrl;
    this.stripe = stripe || (env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null);
    this.trybe = trybe || new TrybeService({ store, env });
  }

  get configured() {
    const priceNames = Object.values(PLAN_PRICE_ENV).flatMap(cycles => Object.values(cycles));
    return Boolean(this.stripe && this.env.STRIPE_WEBHOOK_SECRET && priceNames.every(name => this.env[name]));
  }

  priceId(planId, cycle) {
    const envName = PLAN_PRICE_ENV[planId]?.[cycle];
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

  async checkout(uid, email, { planId, cycle }, cookieHeader) {
    invariant(this.configured, "Stripe checkout is not configured.", { status: 503, code: "billing_not_configured" });
    const current = this.store.get("billing", uid);
    invariant(!(current?.subscriptionId && ACTIVE_STATUSES.has(current.status)), "You already have a subscription. Use Manage billing to change or cancel it.", { status: 409, code: "subscription_exists" });
    const price = this.priceId(planId, cycle);
    const metadata = { meadowUserId: uid, meadowPlanId: planId, meadowBillingCycle: cycle };
    const visitorId = this.trybe.visitorId(cookieHeader);
    if (visitorId) metadata.trybeVisitorId = visitorId;
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: uid,
      ...(current?.customerId ? { customer: current.customerId } : email ? { customer_email: email } : {}),
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${this.appUrl}/?view=billing&checkout=success`,
      cancel_url: `${this.appUrl}/pricing?checkout=cancelled`,
      metadata,
      subscription_data: { metadata },
    });
    if (session.id) this.store.put("checkout_session", { id: session.id, ownerUid: uid, createdAt: Date.now() });
    return { url: session.url };
  }

  async cancelForDeletion(uid) {
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
    if (ACTIVE_STATUSES.has(subscription.status) || subscription.status === "paused") await this.stripe.subscriptions.cancel(id);
  }

  async portal(uid) {
    invariant(this.stripe, "Stripe billing is not configured.", { status: 503, code: "billing_not_configured" });
    const record = this.store.get("billing", uid);
    invariant(record?.customerId, "No Stripe billing account is connected yet.", { status: 404, code: "billing_account_missing" });
    const session = await this.stripe.billingPortal.sessions.create({ customer: record.customerId, return_url: `${this.appUrl}/?view=billing` });
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
    const itemPeriodEnd = subscription.items?.data?.[0]?.current_period_end;
    return this.store.put("billing", {
      id: uid,
      ownerUid: uid,
      customerId,
      subscriptionId: subscription.id,
      planId: subscription.metadata?.meadowPlanId || mapped.planId || null,
      cycle: subscription.metadata?.meadowBillingCycle || mapped.cycle || null,
      priceId,
      status: subscription.status,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      currentPeriodEnd: (itemPeriodEnd || subscription.current_period_end) ? (itemPeriodEnd || subscription.current_period_end) * 1000 : null,
      createdAt: this.store.get("billing", uid)?.createdAt || Date.now(),
      updatedAt: Date.now(),
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
        const subscription = await this.stripe.subscriptions.retrieve(typeof object.subscription === "string" ? object.subscription : object.subscription.id);
        if (this.store.get("privacyBlock", deletionMarker(uid)) && (ACTIVE_STATUSES.has(subscription.status) || subscription.status === "paused")) await this.cancelSubscription(subscription.id);
        this.syncSubscription(subscription, uid);
      }
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      if (object.metadata?.meadowUserId && this.store.get("privacyBlock", deletionMarker(object.metadata.meadowUserId)) && (ACTIVE_STATUSES.has(object.status) || object.status === "paused")) await this.cancelSubscription(object.id);
      this.syncSubscription(object);
    } else if (event.type === "invoice.payment_succeeded") {
      // Covers the first payment and renewals, without counting Checkout twice.
      await this.trybe.invoicePaid(object, this.stripe);
    }
    return { received: true };
  }
}
