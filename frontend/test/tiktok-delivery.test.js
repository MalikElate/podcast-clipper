import assert from "node:assert/strict";
import test from "node:test";
import { canCancelRemaining, deliveryMix, isDeliveryComplete, isTikTokInbox, retryConfirmation, submissionLabel } from "../src/bridge/deliveryPresentation.js";

const inbox = { platform: "tiktok", deliveryMode: "inbox" };
const direct = { platform: "tiktok", deliveryMode: "direct" };

test("TikTok transfer actions never promise automatic publication", () => {
  assert.equal(isTikTokInbox({ platform: "tiktok", settings: { deliveryMode: "inbox" } }), true);
  assert.equal(isTikTokInbox({ platform: "tiktok" }), false);
  assert.equal(isTikTokInbox({ platform: "youtube", deliveryMode: "inbox" }), false);
  assert.deepEqual(deliveryMix([inbox]), { hasInbox: true, onlyInbox: true });
  assert.equal(submissionLabel([inbox]), "Send to TikTok");
  assert.equal(submissionLabel([inbox], { scheduled: true }), "Schedule TikTok transfer");
  assert.equal(submissionLabel([inbox, direct]), "Publish & send to TikTok");
  assert.equal(submissionLabel([inbox, direct], { scheduled: true }), "Schedule publishing & transfer");
  assert.equal(submissionLabel([direct]), "Publish now");
  assert.equal(submissionLabel([{ platform: "youtube" }], { youtube: true }), "Upload & publish now");
});

test("sent inbox transfers are frozen while unsent destinations can still be cancelled", () => {
  const sent = { ...inbox, status: "awaiting_publish" };
  assert.equal(isDeliveryComplete(sent), true);
  assert.equal(canCancelRemaining({ deletable: false, deliveries: [sent] }), false);
  assert.equal(canCancelRemaining({ deletable: false, deliveries: [sent, { status: "queued" }] }), true);
  assert.equal(canCancelRemaining({ deliveries: [sent, { status: "processing" }, { status: "queued" }] }), false);
  assert.equal(canCancelRemaining({ deliveries: [{ status: "published" }, { status: "cancelled" }] }), false);
});

test("uncertain TikTok transfer retries require checking receipt, not publication", () => {
  assert.match(retryConfirmation(inbox), /inbox.*not received.*duplicate/);
  assert.doesNotMatch(retryConfirmation(inbox), /not published/);
  assert.match(retryConfirmation(direct), /not published/);
});
