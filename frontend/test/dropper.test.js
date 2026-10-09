import assert from "node:assert/strict";
import test from "node:test";
import { dropperDestinationAccounts, dropperSourceAccounts, selectableDropperCards, currentDropperItem, intervalMinutes, intervalInput, intervalLabel, dropperQueueStatus, dropKeyframes } from "../src/bridge/dropper.js";

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

test("each drop copy has a continuous finite path that lands in its own account bucket", () => {
  const common = { startX: 200, startY: 20, pegTop: 50, pegHeight: 240 };
  const left = dropKeyframes({ ...common, endX: 70, endY: 330, copyIndex: 0 });
  const wrapped = dropKeyframes({ ...common, endX: 300, endY: 450, copyIndex: 1 });
  assert.equal(left.at(-1).transform, "translate(70px, 330px) scale(.45)");
  assert.equal(wrapped.at(-1).transform, "translate(300px, 450px) scale(.45)");
  assert.notDeepEqual(left[1], wrapped[1]);
  for (const path of [left, wrapped]) {
    assert.equal(path[0].offset, 0);
    assert.equal(path.at(-1).offset, 1);
    assert.ok(path.every((frame, index) => !index || frame.offset > path[index - 1].offset));
    assert.ok(path.every(frame => !frame.transform.includes("NaN")));
  }
});
