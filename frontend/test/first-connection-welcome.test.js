import test from "node:test";
import assert from "node:assert/strict";
import { firstConnectionWelcomeKey, shouldShowFirstConnectionWelcome } from "../src/bridge/firstConnectionWelcome.js";

const firstVisit = { userId: "user_123", preview: false, dismissed: false, accounts: [], error: "", connectionId: "" };

test("the welcome appears after an empty signed-in account list loads", () => {
  assert.equal(shouldShowFirstConnectionWelcome(firstVisit), true);
  assert.equal(shouldShowFirstConnectionWelcome({ ...firstVisit, accounts: null }), false);
  assert.equal(shouldShowFirstConnectionWelcome({ ...firstVisit, accounts: [{ status: "disconnected" }] }), true);
  assert.equal(firstConnectionWelcomeKey("user_123"), "meadow:first-connection-welcome:user_123");
});

test("the welcome stays out of active, preview, dismissed, error, and OAuth-return flows", () => {
  for (const changes of [
    { userId: "" }, { preview: true }, { dismissed: true }, { error: "Request failed" },
    { connectionId: "pending_123" }, { accounts: [{ status: "connected" }] },
    { accounts: [{ status: "reconnect_required" }] },
  ]) assert.equal(shouldShowFirstConnectionWelcome({ ...firstVisit, ...changes }), false);
});
