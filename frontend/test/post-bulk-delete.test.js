import assert from "node:assert/strict";
import test from "node:test";
import { canDeletePost, deleteUnavailableReason, eligibleSelection } from "../src/bridge/postBulkDelete.js";

const post = (id, deliveries = [], extra = {}) => ({ id, deletable: true, deliveries, ...extra });
const delivery = (status, extra = {}) => ({ status, ...extra });

test("post deletion excludes content already sent or being published", () => {
  assert.equal(canDeletePost(post("draft")), true);
  assert.equal(canDeletePost(post("queued", [delivery("scheduled")])), true);
  assert.equal(canDeletePost(post("failed", [delivery("failed"), delivery("needs_review")])), true);
  assert.equal(canDeletePost(post("partial", [delivery("failed"), delivery("published")])), false);
  assert.equal(canDeletePost(post("inbox", [delivery("awaiting_publish")])), false);
  assert.equal(canDeletePost(post("chat", [delivery("failed", { chatMessagesSent: 1 })])), false);
  assert.equal(canDeletePost(post("chat-progress", [delivery("failed", { progress: { chat: { sent: ["one"] } } })])), false);
  assert.equal(canDeletePost(post("publishing", [delivery("publishing")])), false);
  assert.equal(canDeletePost(post("processing", [delivery("processing")])), false);
  assert.equal(canDeletePost(post("server-blocked", [delivery("queued")], { deletable: false })), false);
});

test("selection drops missing, newly ineligible, and duplicate posts", () => {
  const posts = [post("draft"), post("failed", [delivery("failed")]), post("changed", [delivery("published")]), post("draft")];
  assert.deepEqual(eligibleSelection(posts, new Set(["missing", "changed", "failed", "draft"])).map(item => item.id), ["draft", "failed"]);
  assert.deepEqual(eligibleSelection(posts, ["missing"]), []);
});

test("unavailable delete actions explain sent content and active delivery", () => {
  assert.match(deleteUnavailableReason(post("partial", [delivery("failed"), delivery("published")])), /sent to a platform.*stays in Meadow history/i);
  assert.match(deleteUnavailableReason(post("active", [delivery("publishing")])), /in progress.*finishes/i);
  assert.match(deleteUnavailableReason(post("unknown", [], { deletable: false })), /cannot be deleted right now/i);
});
