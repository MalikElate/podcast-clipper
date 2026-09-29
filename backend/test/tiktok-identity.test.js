import test from "node:test";
import assert from "node:assert/strict";
import { TikTokProvider } from "../src/bridge/platforms/TikTokProvider.js";

test("TikTok uses the verified union ID across Meadow apps while retaining the app-specific publishing ID", async () => {
  const provider = new TikTokProvider({ transport: { request: async (url, options) => {
    assert.ok(new URL(url).searchParams.get("fields").split(",").includes("union_id"));
    return { data: { user: { open_id: options.token, union_id: "same-person", display_name: "Creator" } } };
  } } });
  const [sandbox] = await provider.accounts({ accessToken: "sandbox" });
  const [production] = await provider.accounts({ accessToken: "production" });
  assert.notEqual(sandbox.remoteId, production.remoteId);
  assert.equal(sandbox.identityKey, production.identityKey);
});

test("TikTok refuses an unverified identity instead of matching display names", async () => {
  const provider = new TikTokProvider({ transport: { request: async () => ({ data: { user: { open_id: "id", display_name: "Shared name" } } }) } });
  await assert.rejects(provider.accounts({ accessToken: "access" }), /verified creator identity/);
});
