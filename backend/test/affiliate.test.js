import test from "node:test";
import assert from "node:assert/strict";
import { SqliteStore } from "../src/bridge/storage/SqliteStore.js";
import { AffiliateService } from "../src/bridge/services/AffiliateService.js";

function setup(t) {
  const store = new SqliteStore();
  const clock = { now: Date.UTC(2026, 8, 11) };
  const service = new AffiliateService({ store, appUrl: "https://findmeadow.com", internalSecret: "affiliate-secret", clock: () => clock.now });
  t.after(() => store.close());
  return { service, clock };
}

test("affiliate enrollment, first-touch attribution, and self-referral protection", t => {
  const { service, clock } = setup(t);
  const joined = service.enroll("seller", { displayName: "Meadow Partner", email: "partner@example.com", code: "meadow-partner", acceptedTerms: true });
  assert.equal(joined.affiliate.referralLink, "https://findmeadow.com/?ref=meadow-partner");
  assert.equal(joined.program.commissionPercent, 20);
  const click = service.track("MEADOW-PARTNER");
  assert.equal(click.expiresAt, clock.now + 30 * 86400000);
  assert.deepEqual(service.claim("seller", click), { attributed: false, reason: "self_referral" });
  assert.deepEqual(service.claim("customer", click), { attributed: true, existing: false });
  assert.deepEqual(service.claim("customer", click), { attributed: true, existing: true });
  const dashboard = service.dashboard("seller");
  assert.equal(dashboard.stats.clicks, 1);
  assert.equal(dashboard.stats.referrals, 1);
});

test("commission events are idempotent, include refunds, and move through settlement states", t => {
  const { service } = setup(t);
  service.enroll("seller", { displayName: "Meadow Partner", email: "partner@example.com", code: "meadow-partner", acceptedTerms: true });
  const click = service.track("meadow-partner");
  service.claim("customer", click);
  assert.throws(() => service.recordConversion("wrong", { customerUid: "customer", externalId: "invoice-1", amountCents: 5900 }), /Invalid affiliate integration secret/);
  const purchase = service.recordConversion("affiliate-secret", { customerUid: "customer", externalId: "invoice-1", amountCents: 5900 });
  assert.equal(purchase.conversion.commissionCents, 1180);
  assert.equal(service.recordConversion("affiliate-secret", { customerUid: "customer", externalId: "invoice-1", amountCents: 5900 }).idempotent, true);
  assert.throws(() => service.recordConversion("affiliate-secret", { customerUid: "customer", externalId: "invoice-1", amountCents: 6000 }), /different conversion data/);
  const refund = service.recordConversion("affiliate-secret", { customerUid: "customer", externalId: "refund-1", relatedExternalId: "invoice-1", amountCents: 900, type: "refund" });
  assert.equal(refund.conversion.commissionCents, -180);
  service.updateConversionStatus("affiliate-secret", purchase.conversion.id, "paid");
  const dashboard = service.dashboard("seller");
  assert.equal(dashboard.stats.customers, 1);
  assert.equal(dashboard.stats.conversions, 1);
  assert.equal(dashboard.stats.pendingCents, -180);
  assert.equal(dashboard.stats.paidCents, 1180);
});
