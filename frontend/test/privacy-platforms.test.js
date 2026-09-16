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

test("the YouTube notice answers every topic Google's review requires", () => {
  const youtube = PLATFORM_PRIVACY.find(platform => platform.id === "youtube");
  assert.deepEqual(youtube.details.map(detail => detail.label), [
    "What data Meadow receives",
    "How Meadow uses the data",
    "How Meadow protects the data",
    "Who receives the data",
    "How long Meadow keeps the data",
    "Removing access",
  ]);
  const text = youtube.details.flatMap(detail => [detail.text, detail.footer, ...(detail.items || [])]).filter(Boolean).join(" ");
  assert.match(text, /never receives your Google or YouTube password/);
  assert.match(text, /does not request access to Gmail, Google Drive or Google Calendar/);
  assert.match(text, /do not sell Google or YouTube data/);
  assert.match(text, /Limited Use requirements/);
  assert.match(text, /within 30 days/);
  assert.match(text, /within seven days/);
  for (const url of [
    "https://developers.google.com/terms/api-services-user-data-policy",
    "https://policies.google.com/privacy",
    "https://www.youtube.com/t/terms",
    "https://security.google.com/settings/security/permissions",
  ]) assert.ok(youtube.links.some(link => link.url === url), `YouTube notice must link ${url}`);
});
