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
  assert.ok(PLATFORM_PRIVACY.every(platform => platform.details.length >= 3));
  assert.ok(PLATFORM_PRIVACY.every(platform => platform.links.length > 0 && platform.links.every(link => new URL(link.url).protocol === "https:")));
});

test("the YouTube notice explains protection, deletion, and Google access controls", () => {
  const youtube = PLATFORM_PRIVACY.find(platform => platform.id === "youtube");
  assert.ok(youtube.details.some(detail => detail.label === "How Meadow protects the data"));
  assert.match(youtube.details.find(detail => detail.label === "How long Meadow keeps the data").text, /deletes the related information within 30 days of that change/);
  assert.ok(youtube.links.some(link => link.url === "https://developers.google.com/terms/api-services-user-data-policy"));
  assert.ok(youtube.links.some(link => link.url === "https://security.google.com/settings/security/permissions"));
});

test("every Google access link uses the required security permissions page", () => {
  const googleLinks = PLATFORM_PRIVACY.flatMap(platform => platform.links).filter(link => link.label === "Manage Google access");
  assert.ok(googleLinks.length >= 2);
  assert.ok(googleLinks.every(link => link.url === "https://security.google.com/settings/security/permissions"));
});
