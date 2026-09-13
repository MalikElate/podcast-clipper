import { BridgeError } from "../core/errors.js";
import { deletionMarker } from "./PrivacyService.js";

const ORDERS_URL = "https://jointrybe.com/attribution/v1/orders";
// Stripe represents ISK and UGX with two decimal places despite ISO's exponent.
const ZERO_DECIMAL = new Set("BIF CLP DJF GNF JPY KMF KRW MGA PYG RWF VND VUV XAF XOF XPF".split(" "));
const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);
const validVisitor = value => typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

export function stripeAmount(amount, currency) {
  const code = currency.toUpperCase();
  return amount / (ZERO_DECIMAL.has(code) ? 1 : THREE_DECIMAL.has(code) ? 1000 : 100);
}

/** Orders come exclusively from verified Stripe payment webhooks. */
export class TrybeService {
  constructor({ store, env = process.env, fetchImpl = fetch }) {
    this.store = store;
    this.env = env;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.env.TRYBE_ORDERS_API_KEY?.startsWith("sk_") && this.env.TRYBE_STORE_ID);
  }

  visitorId(cookieHeader = "") {
    if (!this.env.TRYBE_STORE_ID) return null;
    const cookies = new Map(cookieHeader.split(";").map(cookie => {
      const at = cookie.indexOf("=");
      return [cookie.slice(0, at).trim(), cookie.slice(at + 1).trim()];
    }));
    const raw = cookies.get(`ugc_vid_${this.env.TRYBE_STORE_ID}`) || cookies.get("ugc_vid");
    try {
      const value = decodeURIComponent(raw || "");
      return validVisitor(value) ? value : null;
    } catch { return null; }
  }

  async invoicePaid(invoice, stripe) {
    if (!this.configured || invoice.livemode !== true || invoice.status !== "paid" || !(invoice.amount_paid > 0)) return;
    if (this.store.get("trybe_order", invoice.id)) return;

    const details = invoice.parent?.subscription_details || invoice.subscription_details;
    const subscriptionId = details?.subscription || invoice.subscription;
    if (!subscriptionId) return;
    let metadata = details?.metadata;
    if (!metadata?.meadowUserId || !metadata?.trybeVisitorId) {
      const subscription = typeof subscriptionId === "object" && subscriptionId.metadata
        ? subscriptionId
        : await stripe.subscriptions.retrieve(typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id);
      metadata = { ...subscription.metadata, ...metadata };
    }
    // This Stripe account can also contain products that do not belong to Meadow.
    if (!metadata?.meadowUserId || !metadata?.meadowPlanId) return;
    if (this.store.get("privacyBlock", deletionMarker(metadata.meadowUserId))) return;
    if (!validVisitor(metadata.trybeVisitorId)) {
      console.warn("Trybe purchase skipped: missing visitor ID.");
      return;
    }

    const payload = {
      apiKey: this.env.TRYBE_ORDERS_API_KEY,
      orderId: invoice.id,
      value: stripeAmount(invoice.amount_paid, invoice.currency),
      currency: invoice.currency.toUpperCase(),
      vid: metadata.trybeVisitorId,
      ...(invoice.customer_email ? { email: invoice.customer_email } : {}),
      orderTime: new Date((invoice.status_transitions?.paid_at || invoice.created) * 1000).toISOString(),
    };
    let response, result;
    try {
      response = await this.fetch(ORDERS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      result = await response.json();
    } catch {
      throw new BridgeError("Purchase tracking is temporarily unavailable. Retry the webhook.", { status: 503, code: "trybe_unavailable" });
    }
    const duplicate = response.status === 409 && result?.error === "Duplicate order";
    if (!(response.ok && result?.success === true) && !duplicate) {
      // Do not log provider bodies, which can contain customer details or API keys.
      console.error("Trybe order submission failed:", response.status);
      throw new BridgeError("Purchase tracking has not accepted this order. Retry the webhook.", { status: 503, code: "trybe_order_failed" });
    }
    this.store.put("trybe_order", { id: invoice.id, status: "sent", createdAt: Date.now() });
  }
}
