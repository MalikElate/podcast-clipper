import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { invariant } from "../core/errors.js";

const reservedCodes = new Set(["admin", "affiliate", "api", "app", "bridge", "meadow", "help", "login", "pricing", "signup", "support"]);
const statuses = new Set(["pending", "approved", "paid", "reversed"]);

export class AffiliateService {
  constructor({ store, appUrl, internalSecret = "", clock = () => Date.now(), commissionRateBps = 2000, attributionDays = 30 }) {
    this.store = store;
    this.appUrl = appUrl.replace(/\/$/, "");
    this.internalSecret = internalSecret;
    this.clock = clock;
    this.commissionRateBps = this.validRate(commissionRateBps);
    this.attributionDays = Math.min(Math.max(Number(attributionDays) || 30, 1), 365);
  }

  program() {
    return {
      commissionRateBps: this.commissionRateBps,
      commissionPercent: this.commissionRateBps / 100,
      attributionDays: this.attributionDays,
      recurring: true,
    };
  }

  dashboard(ownerUid) {
    const affiliate = this.store.list("affiliate", { ownerUid, limit: 1 })[0];
    if (!affiliate) return { affiliate: null, program: this.program() };
    const clicks = this.store.list("affiliate_click", { limit: null }).filter(item => item.affiliateId === affiliate.id);
    const referrals = this.store.list("affiliate_referral", { limit: null }).filter(item => item.affiliateId === affiliate.id);
    const conversions = this.store.list("affiliate_conversion", { ownerUid, limit: null });
    const total = status => conversions.filter(item => item.status === status).reduce((sum, item) => sum + item.commissionCents, 0);
    const customers = new Set(conversions.filter(item => item.type === "purchase").map(item => item.customerUid));
    return {
      affiliate: this.toPublic(affiliate),
      program: this.program(),
      stats: {
        clicks: clicks.length,
        referrals: referrals.length,
        customers: customers.size,
        conversions: conversions.filter(item => item.type === "purchase").length,
        pendingCents: total("pending"),
        approvedCents: total("approved"),
        paidCents: total("paid"),
      },
      transactions: conversions.slice(0, 50).map(item => this.publicConversion(item)),
    };
  }

  enroll(ownerUid, { displayName, email, code, acceptedTerms } = {}) {
    const existing = this.store.list("affiliate", { ownerUid, limit: 1 })[0];
    if (existing) return this.dashboard(ownerUid);
    const name = typeof displayName === "string" ? displayName.trim() : "";
    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    invariant(name.length >= 2 && name.length <= 80, "Enter a name between 2 and 80 characters.");
    invariant(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) && cleanEmail.length <= 254, "Enter a valid email address.");
    invariant(acceptedTerms === true, "Accept the affiliate program terms to continue.");
    const cleanCode = code ? this.normalizeCode(code) : this.availableCode(name);
    invariant(!this.findByCode(cleanCode), "That referral code is already in use.", { status: 409, code: "code_taken" });
    const now = this.clock();
    this.store.put("affiliate", {
      id: randomUUID(), ownerUid, displayName: name, email: cleanEmail, code: cleanCode, status: "active",
      commissionRateBps: this.commissionRateBps, termsVersion: "v1", acceptedTermsAt: now, createdAt: now, updatedAt: now,
    });
    return this.dashboard(ownerUid);
  }

  track(code) {
    const affiliate = this.requireCode(code);
    const now = this.clock(), expiresAt = now + this.attributionDays * 86400000;
    const click = this.store.put("affiliate_click", {
      id: randomUUID(), affiliateId: affiliate.id, code: affiliate.code, status: "tracked", createdAt: now, expiresAt,
    });
    return { clickId: click.id, code: affiliate.code, expiresAt };
  }

  claim(customerUid, { code, clickId } = {}) {
    const existing = this.store.list("affiliate_referral", { ownerUid: customerUid, limit: 1 })[0];
    if (existing) return { attributed: true, existing: true };
    const affiliate = this.requireCode(code);
    if (affiliate.ownerUid === customerUid) return { attributed: false, reason: "self_referral" };
    let click = null;
    if (clickId) {
      click = this.store.get("affiliate_click", clickId);
      invariant(click && click.affiliateId === affiliate.id && click.expiresAt >= this.clock(), "This referral has expired.", { status: 410, code: "referral_expired" });
    }
    const now = this.clock();
    this.store.put("affiliate_referral", {
      id: randomUUID(), ownerUid: customerUid, affiliateId: affiliate.id, clickId: click?.id || null,
      status: "referred", createdAt: now,
    });
    return { attributed: true, existing: false };
  }

  recordConversion(secret, { customerUid, externalId, relatedExternalId, amountCents, currency = "USD", type = "purchase", occurredAt } = {}) {
    this.authorizeInternal(secret);
    invariant(typeof customerUid === "string" && customerUid.length >= 1 && customerUid.length <= 256, "A customer UID is required.");
    invariant(typeof externalId === "string" && externalId.length >= 1 && externalId.length <= 256, "An external transaction ID is required.");
    invariant(Number.isSafeInteger(amountCents) && amountCents > 0 && amountCents <= 100000000, "amountCents must be a positive integer no greater than 100000000.");
    const normalizedCurrency = String(currency).toUpperCase();
    invariant(/^[A-Z]{3}$/.test(normalizedCurrency), "Use a three-letter currency code.");
    invariant(type === "purchase" || type === "refund", "type must be purchase or refund.");
    const signedAmount = type === "refund" ? -amountCents : amountCents;
    const id = createHash("sha256").update(externalId).digest("hex");
    const existing = this.store.get("affiliate_conversion", id);
    if (existing) {
      invariant(existing.customerUid === customerUid && existing.type === type && existing.amountCents === signedAmount && existing.currency === normalizedCurrency,
        "This external transaction ID was already used with different conversion data.", { status: 409, code: "idempotency_conflict" });
      return { attributed: true, idempotent: true, conversion: this.publicConversion(existing) };
    }
    const referral = this.store.list("affiliate_referral", { ownerUid: customerUid, limit: 1 })[0];
    if (!referral) return { attributed: false, idempotent: false };
    const affiliate = this.store.get("affiliate", referral.affiliateId);
    if (!affiliate) return { attributed: false, idempotent: false };
    let commissionRateBps = affiliate.commissionRateBps;
    if (type === "refund" && relatedExternalId) {
      const related = this.store.get("affiliate_conversion", createHash("sha256").update(String(relatedExternalId)).digest("hex"));
      invariant(related && related.customerUid === customerUid && related.type === "purchase", "The related purchase was not found.", { status: 404, code: "not_found" });
      commissionRateBps = related.commissionRateBps;
    }
    const commissionCents = Math.trunc(signedAmount * commissionRateBps / 10000);
    const createdAt = Number.isFinite(occurredAt) ? occurredAt : this.clock();
    const conversion = this.store.put("affiliate_conversion", {
      id, ownerUid: affiliate.ownerUid, affiliateId: affiliate.id, customerUid, referralId: referral.id,
      externalId, relatedExternalId: relatedExternalId || null, type, amountCents: signedAmount, currency: normalizedCurrency, commissionRateBps,
      commissionCents, status: "pending", createdAt, updatedAt: this.clock(),
    });
    return { attributed: true, idempotent: false, conversion: this.publicConversion(conversion) };
  }

  updateConversionStatus(secret, id, status) {
    this.authorizeInternal(secret);
    invariant(statuses.has(status), "status must be pending, approved, paid, or reversed.");
    const conversion = this.store.get("affiliate_conversion", id);
    invariant(conversion, "Affiliate conversion not found.", { status: 404, code: "not_found" });
    const updated = this.store.put("affiliate_conversion", { ...conversion, status, updatedAt: this.clock() });
    return { conversion: this.publicConversion(updated) };
  }

  authorizeInternal(secret) {
    invariant(this.internalSecret, "Affiliate conversion tracking is not configured.", { status: 503, code: "affiliate_not_configured" });
    const actual = Buffer.from(String(secret || "")), expected = Buffer.from(this.internalSecret);
    invariant(actual.length === expected.length && timingSafeEqual(actual, expected), "Invalid affiliate integration secret.", { status: 401, code: "invalid_affiliate_secret" });
  }

  requireCode(code) {
    const affiliate = this.findByCode(this.normalizeCode(code));
    invariant(affiliate && affiliate.status === "active", "Referral code not found.", { status: 404, code: "not_found" });
    return affiliate;
  }

  findByCode(code) { return this.store.list("affiliate", { limit: null }).find(item => item.code === code); }

  normalizeCode(value) {
    const code = String(value || "").trim().toLowerCase();
    invariant(code.length >= 4 && code.length <= 32 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(code), "Use 4–32 lowercase letters, numbers, or single hyphens for the referral code.");
    invariant(!reservedCodes.has(code), "Choose a different referral code.");
    return code;
  }

  availableCode(name) {
    let base = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
    if (base.length < 4 || reservedCodes.has(base)) base = `partner-${base || "meadow"}`.slice(0, 24);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = `${base}-${randomBytes(2).toString("hex")}`;
      if (!this.findByCode(candidate)) return candidate;
    }
    throw new Error("Could not create a unique referral code.");
  }

  validRate(value) {
    const rate = Number(value);
    invariant(Number.isInteger(rate) && rate >= 1 && rate <= 10000, "Affiliate commission rate must be between 1 and 10000 basis points.");
    return rate;
  }

  toPublic({ id, displayName, email, code, status, commissionRateBps, createdAt }) {
    return { id, displayName, email, code, status, commissionRateBps, referralLink: `${this.appUrl}/?ref=${encodeURIComponent(code)}`, createdAt };
  }

  publicConversion({ id, type, amountCents, currency, commissionRateBps, commissionCents, status, createdAt }) {
    return { id, type, amountCents, currency, commissionRateBps, commissionCents, status, createdAt };
  }
}
