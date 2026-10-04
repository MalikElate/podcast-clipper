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

test("video limits read as one sentence whichever caps a platform sets", () => {
  const video = id => specRows(id, id).find(row => row.label === "Video")?.value;
  // Length and size.
  assert.equal(video("instagram"), "Up to 15 minutes and 1,000 MB");
  // Size only, with the length explicitly uncapped.
  assert.equal(video("tiktok"), "No length limit through Meadow, up to 4 GB");
  // Size only, with no length stated at all.
  assert.equal(video("telegram"), "Up to 50 MB");
  // Neither: a chat platform takes no video.
  assert.equal(video("twitch"), undefined);
});

test("no specification reads as an unfinished sentence", () => {
  for (const id of Object.keys(PLATFORM_SPECS)) {
    for (const row of specRows(id, id)) {
      assert.doesNotMatch(row.value, /(^|\s)(Up to|and|,)\s*$/, `${id} ${row.label} ends mid-phrase: "${row.value}"`);
      assert.doesNotMatch(row.value, /,\s*up to.*,\s*up to/, `${id} ${row.label} repeats itself: "${row.value}"`);
      assert.doesNotMatch(row.value, /Up to,/, `${id} ${row.label} is missing a value: "${row.value}"`);
    }
  }
});

test("a chat-only platform does not claim it can publish media", () => {
  const rows = specRows("twitch", "Twitch");
  assert.equal(rows.find(row => row.label === "Post types").value, "Text");
  assert.ok(!rows.some(row => ["Video", "Photo size", "Carousel"].includes(row.label)), "Twitch must not list media limits");
});
