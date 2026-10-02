import assert from "node:assert/strict";
import test from "node:test";
import { newestPostFirst, postSectionDate } from "../src/bridge/postListOrder.js";

const post = (id, createdAt, deliveries = [], updatedAt = createdAt) => ({ id, createdAt, updatedAt, deliveries });
const order = (section, posts) => [...posts].sort((a, b) => newestPostFirst(section, a, b)).map(item => item.id);

test("post history sorts by the event shown on each card, newest first", () => {
  const olderPublishedToday = post("older-published-today", 100, [{ status: "published", publishedAt: 900 }]);
  const newerPublishedYesterday = post("newer-published-yesterday", 800, [{ status: "published", publishedAt: 850 }]);
  assert.deepEqual(order("posted", [newerPublishedYesterday, olderPublishedToday]), ["older-published-today", "newer-published-yesterday"]);
  assert.deepEqual(postSectionDate(olderPublishedToday, "posted"), { label: "Published", time: 900 });

  const failedRecently = post("failed-recently", 100, [{ status: "failed", updatedAt: 1000 }]);
  const failedEarlier = post("failed-earlier", 900, [{ status: "needs_review", updatedAt: 950 }]);
  assert.deepEqual(order("failed", [failedEarlier, failedRecently]), ["failed-recently", "failed-earlier"]);

  const editedDraft = post("edited-draft", 100, [], 1100);
  editedDraft.status = "draft";
  const newerUneditedDraft = post("newer-unedited-draft", 1000);
  assert.deepEqual(order("drafts", [newerUneditedDraft, editedDraft]), ["edited-draft", "newer-unedited-draft"]);
  assert.deepEqual(postSectionDate(editedDraft, "drafts"), { label: "Last saved", time: 1100 });
  assert.deepEqual(postSectionDate(editedDraft, "posts"), { label: "Last saved", time: 1100 });
  assert.deepEqual(order("posts", [newerUneditedDraft, editedDraft]), ["newer-unedited-draft", "edited-draft"]);
});

test("scheduled cards use active requested times, not worker retry or completed delivery times", () => {
  const later = post("later", 100, [
    { status: "queued", requestedAt: 700, dueAt: 1200 },
    { status: "published", publishedAt: 3000, requestedAt: 3000 },
  ]);
  const earlier = post("earlier", 200, [{ status: "processing", requestedAt: 600, dueAt: 5000 }]);
  const missingSchedule = post("missing-schedule", 50, [{ status: "queued" }]);
  assert.deepEqual(order("scheduled", [earlier, missingSchedule, later]), ["later", "earlier", "missing-schedule"]);
  assert.deepEqual(postSectionDate(later, "scheduled"), { label: "Scheduled", time: 700 });
  assert.deepEqual(postSectionDate(missingSchedule, "scheduled"), { label: "Created", time: 50 });
});

test("an account filter orders cards by that account's visible delivery", () => {
  const first = post("first", 100, [
    { accountId: "a", status: "queued", requestedAt: 500 },
    { accountId: "b", status: "queued", requestedAt: 900 },
  ]);
  const second = post("second", 200, [{ accountId: "a", status: "queued", requestedAt: 700 }]);
  assert.deepEqual([first, second].sort((a, b) => newestPostFirst("scheduled", a, b, "a")).map(item => item.id), ["second", "first"]);
  assert.deepEqual(postSectionDate(first, "scheduled", "a"), { label: "Scheduled", time: 500 });
});
