import assert from "node:assert/strict";
import test from "node:test";
import { PLATFORM_PRIVACY } from "../src/components/platformPrivacy.js";

test("the public privacy page covers every supported social platform", () => {
  assert.deepEqual(PLATFORM_PRIVACY.map(platform => platform.id), [
    "instagram",
    "tiktok",
    "youtube",
    "facebook",
    "x",
    "linkedin",
    "pinterest",
    "threads",
    "bluesky",
    "google-business-profile",
  ]);
  assert.equal(new Set(PLATFORM_PRIVACY.map(platform => platform.id)).size, PLATFORM_PRIVACY.length);
  assert.ok(PLATFORM_PRIVACY.every(platform => platform.details.length === 3));
  assert.ok(PLATFORM_PRIVACY.every(platform => platform.links.length > 0 && platform.links.every(link => new URL(link.url).protocol === "https:")));
});
