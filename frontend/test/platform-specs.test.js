import test from "node:test";
import assert from "node:assert/strict";
import { platformCatalog } from "../../backend/src/bridge/platforms/catalog.js";
import { PLATFORM_SPECS, formatBytes, formatDuration, specRows } from "../src/platformSpecs.js";
import { faqsFor } from "../src/platformFaqs.js";
import { PLATFORM_USE_CASES } from "../src/platformUseCases.js";

test("the published specifications match what the adapters actually enforce", () => {
  for (const [id, spec] of Object.entries(PLATFORM_SPECS)) {
    const capability = platformCatalog[id];
    assert.ok(capability, `${id} must exist in the backend catalog`);
    for (const [field, value] of Object.entries(spec)) {
      assert.deepEqual(value, capability[field], `${id}.${field} must match the backend catalog`);
    }
  }
});

test("every platform page can show its specifications", () => {
  for (const platform of PLATFORM_USE_CASES) {
    assert.ok(PLATFORM_SPECS[platform.id], `${platform.slug} must have published specifications`);
    const rows = specRows(platform.id, platform.name);
    assert.ok(rows.length >= 3, `${platform.slug} must list more than a heading`);
    for (const row of rows) assert.ok(row.value, `${platform.slug} must not show an empty ${row.label}`);
  }
});

// Twitch and Kick accept exactly the same posts, so their pages can only be told
// apart by what their answers say. Search engines drop a page they read as a copy.
test("no two platform pages read as copies of each other", () => {
  const fingerprints = PLATFORM_USE_CASES.map(platform => [
    ...specRows(platform.id, platform.name).map(row => `${row.label}:${row.value}`),
    ...faqsFor(platform.id).map(item => `${item.q} ${item.a}`),
  ].join("|"));
  const duplicates = PLATFORM_USE_CASES.filter((platform, index) => fingerprints.indexOf(fingerprints[index]) !== index).map(platform => platform.slug);
  assert.deepEqual(duplicates, [], `These pages carry content identical to another platform: ${duplicates.join(", ")}`);
});

test("sizes and durations read the way a person would write them", () => {
  assert.equal(formatBytes(8 * 1024 ** 2), "8 MB");
  assert.equal(formatBytes(4 * 1024 ** 3), "4 GB");
  assert.equal(formatBytes(1000 * 1024 ** 2), "1,000 MB");
  assert.equal(formatBytes(null), null);
  assert.equal(formatDuration(900), "15 minutes");
  assert.equal(formatDuration(140), "2 minutes 20 seconds");
  assert.equal(formatDuration(43200), "12 hours");
  assert.equal(formatDuration(null), null);
});

test("video limits read as one sentence, including the platform with no length cap", () => {
  const instagram = specRows("instagram", "Instagram").find(row => row.label === "Video");
  assert.equal(instagram.value, "Up to 15 minutes and 1,000 MB");
  const tiktok = specRows("tiktok", "TikTok").find(row => row.label === "Video");
  assert.equal(tiktok.value, "No length limit through Meadow, up to 4 GB");
});

test("a chat-only platform does not claim it can publish media", () => {
  const rows = specRows("twitch", "Twitch");
  assert.equal(rows.find(row => row.label === "Post types").value, "Text");
  assert.ok(!rows.some(row => ["Video", "Photo size", "Carousel"].includes(row.label)), "Twitch must not list media limits");
});
