import assert from "node:assert/strict";
import test from "node:test";
import { dropperDestinationAccounts, dropperSourceAccounts, selectableDropperCards, currentDropperItem, intervalMinutes, intervalInput, intervalLabel, dropperQueueStatus, funnelFeed, funnelDuration, funnelProgress, wrongFormatLabel, FUNNEL_STEP_MS, FUNNEL_TIMING } from "../src/bridge/dropper.js";

test("dropper keeps distinct connected accounts on the same platform and excludes its source and chat destinations", () => {
  const accounts = [
    { id: "source", platform: "youtube", status: "connected" },
    { id: "second-youtube", platform: "youtube", status: "connected" },
    { id: "third-youtube", platform: "youtube", status: "connected" },
    { id: "old", platform: "instagram", status: "reconnect_required" },
    { id: "chat", platform: "twitch", status: "connected" },
  ];
  const catalog = [{ id: "youtube", formats: ["video"] }, { id: "twitch", formats: ["video"] }];
  assert.deepEqual(dropperSourceAccounts(accounts).map(account => account.id), ["source", "second-youtube", "third-youtube"]);
  assert.deepEqual(dropperDestinationAccounts(accounts, catalog, "source").map(account => account.id), ["second-youtube", "third-youtube"]);
});

test("review cannot requeue a submitted video while failed and stopped videos remain retryable", () => {
  const cards = ["queued", "preparing", "submitting", "sent", "failed", "stopped", "new", "unsupported"].map(id => ({ id, pushable: id !== "unsupported" }));
  const queue = [
    { cardId: "queued", status: "queued" }, { cardId: "preparing", status: "downloading" }, { cardId: "submitting", status: "submitting" },
    { cardId: "sent", status: "scheduled" }, { cardId: "failed", status: "failed" }, { cardId: "stopped", status: "cancelled" },
  ];
  assert.deepEqual(selectableDropperCards(cards, queue).map(card => card.id), ["failed", "stopped", "new"]);
});

test("custom intervals allow one minute through seven days without rounding or fractional values", () => {
  assert.equal(intervalMinutes("1", "minutes"), 1);
  assert.equal(intervalMinutes("8", "hours"), 480);
  assert.equal(intervalMinutes("7", "days"), 10080);
  for (const value of ["0", "-1", "1.5", "", "1e2", "10081"]) assert.equal(intervalMinutes(value, "minutes"), null);
  assert.equal(intervalMinutes("8", "days"), null);
  assert.equal(intervalMinutes("2", "unknown"), null);
  assert.deepEqual(intervalInput(90), { value: "90", unit: "minutes" });
  assert.equal(intervalLabel(1440), "1 day");
  assert.equal(intervalLabel(120), "2 hours");
});

test("fast completed drops still animate between polls while old history and cancelled posts do not replay", () => {
  const recent = { cardId: "recent", status: "scheduled", dispatchedAt: 95000 };
  const older = { cardId: "old", status: "scheduled", dispatchedAt: 30000 };
  const preparing = { cardId: "preparing", status: "downloading" };
  assert.equal(currentDropperItem([older, recent], { now: 100000 }), recent);
  assert.equal(currentDropperItem([recent, preparing], { running: true, now: 100000 }), preparing);
  assert.equal(currentDropperItem([older], { now: 100000 }), null);
  assert.equal(currentDropperItem([{ ...recent, postStatus: "cancelled" }], { now: 100000 }), null);
  assert.equal(currentDropperItem([{ ...recent, dispatchedAt: 110000 }], { now: 100000 }), null);
});

test("preparation and handoff never imply publication or that Stop can retract an existing post", () => {
  const format = at => `time ${at}`;
  assert.equal(dropperQueueStatus({ status: "queued", slotAt: 200 }, format, 100), "Waiting until time 200");
  assert.equal(dropperQueueStatus({ status: "downloading" }, format), "Preparing the video");
  assert.equal(dropperQueueStatus({ status: "submitting" }, format), "Adding to Posts");
  assert.equal(dropperQueueStatus({ status: "scheduled", slotAt: 50 }, format, 100), "In Posts · check posting status");
  assert.equal(dropperQueueStatus({ status: "scheduled", slotAt: 200 }, format, 100), "In Posts · due time 200");
  assert.equal(dropperQueueStatus({ status: "scheduled", postStatus: "published", slotAt: 50 }, format, 100), "Published");
  assert.equal(dropperQueueStatus({ status: "scheduled", postStatus: "awaiting_publish" }, format), "Finish publishing in TikTok");
  assert.equal(dropperQueueStatus({ status: "scheduled", postStatus: "needs_attention" }, format), "Needs attention in Posts");
  assert.equal(dropperQueueStatus({ status: "cancelled" }, format), "Cancelled before being added to Posts");
});

test("the funnel drops videos through and turns away every other format, newest landing last", () => {
  const cards = [{ id: "v-old", publishedAt: 1 }, { id: "v-new", publishedAt: 5 }];
  const wrong = [{ id: "photo", publishedAt: 3, format: "photo" }, { id: "text", publishedAt: 4, format: "text" }];
  const feed = funnelFeed(cards, wrong);
  assert.deepEqual(feed.map(item => [item.id, item.fits]), [["v-old", true], ["photo", false], ["text", false], ["v-new", true]]);
  assert.deepEqual(funnelFeed(cards, wrong, 2).map(item => item.id), ["text", "v-new"]);
  assert.equal(wrongFormatLabel("carousel"), "carousel");
  assert.equal(wrongFormatLabel("story"), "not a video");

  const start = funnelProgress(feed, 0);
  assert.deepEqual(start.active.map(({ item }) => item.id), ["v-old"]);
  assert.equal(start.wrong, 0);
  assert.equal(start.landed.length, 0);
  // A rejected post counts once it has been checked on the rim.
  assert.equal(funnelProgress(feed, FUNNEL_STEP_MS + FUNNEL_TIMING.reject.check - 1).wrong, 0);
  assert.equal(funnelProgress(feed, FUNNEL_STEP_MS + FUNNEL_TIMING.reject.check).wrong, 1);
  const end = funnelProgress(feed, funnelDuration(feed));
  assert.equal(end.done, true);
  assert.equal(end.wrong, 2);
  assert.deepEqual(end.landed.map(item => item.id), ["v-new", "v-old"]);
  assert.equal(end.active.length, 0);
  assert.equal(funnelDuration([]), 0);
  assert.equal(funnelProgress([], 0).done, true);
});
