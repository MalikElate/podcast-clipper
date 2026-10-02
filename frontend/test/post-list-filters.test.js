import assert from "node:assert/strict";
import test from "node:test";
import { availableCardPlatforms, cardPostDate, matchesPostCardFilters, postContentType, postDatePresetRange } from "../src/bridge/postListFilters.js";

const at = value => Date.parse(value);
const post = (deliveries = [], extra = {}) => ({
  id: "post", status: deliveries.length ? "scheduled" : "draft", createdAt: at("2026-09-30T12:00:00Z"),
  updatedAt: at("2026-10-01T12:00:00Z"), accountIds: deliveries.map(item => item.accountId),
  format: "auto", mediaIds: [], media: [], deliveries, ...extra,
});
const delivery = (accountId, platform, status, eventTime) => ({
  id: `${accountId}-${status}`, accountId, platform, status,
  ...(status === "published" ? { publishedAt: at(eventTime) } : status === "queued" ? { requestedAt: at(eventTime), dueAt: at(eventTime) + 60_000 } : { updatedAt: at(eventTime) }),
});

test("date presets include today and the preceding project-local calendar days", () => {
  const now = at("2026-10-01T23:30:00Z"); // October 2 in Douala; October 1 in Los Angeles.
  assert.deepEqual(postDatePresetRange("last_7_days", "Africa/Douala", now), { fromDate: "2026-09-26", toDate: "2026-10-02" });
  assert.deepEqual(postDatePresetRange("last_30_days", "Africa/Douala", now), { fromDate: "2026-09-03", toDate: "2026-10-02" });
  assert.deepEqual(postDatePresetRange("last_90_days", "Africa/Douala", now), { fromDate: "2026-07-05", toDate: "2026-10-02" });
  assert.deepEqual(postDatePresetRange("last_7_days", "America/Los_Angeles", now), { fromDate: "2026-09-25", toDate: "2026-10-01" });
  assert.deepEqual(postDatePresetRange("all", "Africa/Douala", now), { fromDate: "", toDate: "" });
  assert.throws(() => postDatePresetRange("unknown", "UTC", now), RangeError);
});

test("date presets cross leap days and daylight-saving changes by calendar day", () => {
  assert.deepEqual(postDatePresetRange("last_30_days", "UTC", at("2024-03-01T12:00:00Z")), { fromDate: "2024-02-01", toDate: "2024-03-01" });
  assert.deepEqual(postDatePresetRange("last_7_days", "America/New_York", at("2026-03-09T03:30:00Z")), { fromDate: "2026-03-02", toDate: "2026-03-08" });
});

test("platform, account, and date must describe a delivery in the current section", () => {
  const item = post([
    delivery("x-account", "x", "published", "2026-10-01T10:00:00Z"),
    delivery("ig-account", "instagram", "published", "2026-10-02T10:00:00Z"),
    delivery("fb-account", "facebook", "failed", "2026-10-01T11:00:00Z"),
  ], { status: "needs_attention", media: [{ id: "video", kind: "video" }], mediaIds: ["video"] });

  assert.equal(matchesPostCardFilters(item, { section: "posted", platform: "x", contentType: "video", fromDate: "2026-10-01", toDate: "2026-10-01" }), true);
  assert.equal(matchesPostCardFilters(item, { section: "posted", platform: "instagram", contentType: "video", fromDate: "2026-10-01", toDate: "2026-10-01" }), false);
  assert.equal(matchesPostCardFilters(item, { section: "posted", platform: "facebook" }), false);
  assert.equal(matchesPostCardFilters(item, { section: "failed", platform: "facebook" }), true);
  assert.equal(matchesPostCardFilters(item, { section: "failed", platform: "x" }), false);
  assert.equal(matchesPostCardFilters(item, { section: "posted", accountId: "x-account", platform: "instagram" }), false);
  assert.equal(matchesPostCardFilters(item, { section: "posted", accountId: "x-account", platform: "x" }), true);
  assert.deepEqual(cardPostDate(item, "posted", "", "x"), { label: "Published", time: at("2026-10-01T10:00:00Z") });
  assert.deepEqual(cardPostDate(item, "posted", "", "instagram"), { label: "Published", time: at("2026-10-02T10:00:00Z") });
});

test("inclusive date filtering uses the project's calendar day, not UTC or browser time", () => {
  const item = post([delivery("a", "x", "queued", "2026-10-01T23:30:00Z")]);
  const local = { section: "scheduled", platform: "x", timeZone: "Africa/Douala" };
  assert.equal(matchesPostCardFilters(item, { ...local, fromDate: "2026-10-02", toDate: "2026-10-02" }), true);
  assert.equal(matchesPostCardFilters(item, { ...local, toDate: "2026-10-01" }), false);
  assert.equal(matchesPostCardFilters(item, { ...local, fromDate: "2026-10-03" }), false);
  assert.equal(matchesPostCardFilters(item, { ...local, fromDate: "2026-10-01" }), true);
  assert.deepEqual(cardPostDate(item, "scheduled", "", "x"), { label: "Scheduled", time: at("2026-10-01T23:30:00Z") });
});

test("drafts use last-saved date and selected account platforms without deliveries", () => {
  const accounts = [{ id: "ig", platform: "instagram" }, { id: "x", platform: "x" }];
  const draft = post([], { accountIds: ["ig"], media: [{ id: "image", kind: "image" }], mediaIds: ["image"] });
  const noDestination = post([], { accountIds: [] });
  assert.deepEqual(cardPostDate(draft, "drafts", "", "instagram"), { label: "Last saved", time: draft.updatedAt });
  assert.equal(matchesPostCardFilters(draft, { section: "drafts", accounts, platform: "instagram", contentType: "image", fromDate: "2026-10-01" }), true);
  assert.equal(matchesPostCardFilters(draft, { section: "drafts", accounts, platform: "x" }), false);
  assert.equal(matchesPostCardFilters(draft, { section: "drafts", accounts, accountId: "ig", platform: "x" }), false);
  assert.equal(matchesPostCardFilters(noDestination, { section: "drafts", accounts }), true);
  assert.equal(matchesPostCardFilters(noDestination, { section: "drafts", accounts, platform: "instagram" }), false);
  assert.deepEqual(availableCardPlatforms([draft, noDestination], "drafts", accounts), ["instagram"]);
});

test("content type resolves automatic media and broad Reel or Story variants", () => {
  const mediaPost = (format, media, mediaIds = media.map(item => item.id)) => post([], { format, media, mediaIds });
  assert.equal(postContentType(mediaPost("auto", [])), "text");
  assert.equal(postContentType(mediaPost("auto", [{ id: "i", kind: "image" }])), "image");
  assert.equal(postContentType(mediaPost("auto", [{ id: "v", kind: "video" }])), "video");
  assert.equal(postContentType(mediaPost("auto", [{ id: "d", kind: "document" }])), "document");
  assert.equal(postContentType(mediaPost("auto", [{ id: "a", kind: "image" }, { id: "b", kind: "image" }])), "carousel");
  assert.equal(postContentType(mediaPost("carousel", [{ id: "a", kind: "image" }])), "carousel");
  assert.equal(postContentType(mediaPost("reel", [{ id: "v", kind: "video" }])), "video");
  assert.equal(postContentType(mediaPost("story", [{ id: "v", kind: "video" }])), "video");
  assert.equal(postContentType(mediaPost("story", [{ id: "i", kind: "image" }])), "image");
  assert.equal(postContentType(mediaPost("auto", [], ["missing"])), "");
  assert.equal(matchesPostCardFilters(mediaPost("auto", [], ["missing"]), { section: "drafts", contentType: "text" }), false);
});

test("platform choices only include section-relevant deliveries and remain available after disconnect", () => {
  const mixed = post([
    delivery("removed", "x", "published", "2026-10-01T10:00:00Z"),
    delivery("ig", "instagram", "queued", "2026-10-03T10:00:00Z"),
    delivery("fb", "facebook", "failed", "2026-10-01T11:00:00Z"),
  ], { status: "needs_attention" });
  const accounts = [{ id: "ig", platform: "instagram" }, { id: "fb", platform: "facebook" }];
  assert.deepEqual(availableCardPlatforms([mixed], "posted", accounts), ["x"]);
  assert.deepEqual(availableCardPlatforms([mixed], "scheduled", accounts), ["instagram"]);
  assert.deepEqual(availableCardPlatforms([mixed], "failed", accounts), ["facebook"]);
  assert.deepEqual(availableCardPlatforms([mixed], "drafts", accounts), []);
});

test("All posts combines filters while retaining its existing created and saved dates", () => {
  const accounts = [{ id: "ig", platform: "instagram" }, { id: "x", platform: "x" }];
  const published = post([delivery("ig", "instagram", "published", "2026-10-03T10:00:00Z")], {
    status: "published", media: [{ id: "image", kind: "image" }], mediaIds: ["image"],
  });
  const draft = post([], { id: "draft", accountIds: ["x"], updatedAt: at("2026-10-02T10:00:00Z") });
  assert.equal(matchesPostCardFilters(published, { section: "posts", accounts, accountId: "ig", platform: "instagram", contentType: "image", toDate: "2026-09-30" }), true);
  assert.equal(matchesPostCardFilters(published, { section: "posts", accounts, accountId: "x", platform: "instagram" }), false);
  assert.equal(matchesPostCardFilters(published, { section: "posts", accounts, platform: "instagram", fromDate: "2026-10-01" }), false);
  assert.equal(matchesPostCardFilters(draft, { section: "posts", accounts, platform: "x", contentType: "text", fromDate: "2026-10-02" }), true);
  assert.deepEqual(availableCardPlatforms([published, draft], "posts", accounts), ["x", "instagram"]);
});
