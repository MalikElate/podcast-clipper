import assert from "node:assert/strict";
import test from "node:test";
import { getAuthToken, installTokenProvider } from "../src/authToken.js";

test("token requests wait for readiness and forward fresh-token options to Clerk", async () => {
  const options = { skipCache: true };
  const pending = getAuthToken(options);
  const remove = installTokenProvider(async actual => { assert.deepEqual(actual, options); return "fresh-token"; });
  try { assert.equal(await pending, "fresh-token"); } finally { remove(); }
});

test("a remount does not return an anonymous token or clear a newer provider", async () => {
  const pending = getAuthToken();
  const removeOld = installTokenProvider(async () => "old-token");
  removeOld();
  const removeNew = installTokenProvider(async () => "new-token");
  removeOld();
  try { assert.equal(await pending, "new-token"); } finally { removeNew(); }
});
