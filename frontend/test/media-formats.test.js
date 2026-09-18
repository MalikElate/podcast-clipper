import test from "node:test";
import assert from "node:assert/strict";
import { detectFormat, formatsForMedia, unsupportedReason } from "../src/bridge/platforms.js";

const image = { kind: "image" }, video = { kind: "video" }, doc = { kind: "document" };
const youtube = { name: "YouTube", formats: ["video"] };
const instagram = { name: "Instagram", formats: ["image", "video", "carousel", "story"], maxImages: 10, mixedCarousel: true };
const x = { name: "X", formats: ["text", "image", "video", "carousel"], maxImages: 4, mixedCarousel: false };
const linkedin = { name: "LinkedIn", formats: ["text", "image", "video", "carousel", "document"], maxImages: 20, mixedCarousel: false };

test("uploaded media decides whether a post is a picture, video, carousel, or document", () => {
  assert.equal(detectFormat([]), "text");
  assert.equal(detectFormat([image]), "image");
  assert.equal(detectFormat([video]), "video");
  assert.equal(detectFormat([image, video]), "carousel");
  assert.equal(detectFormat([doc]), "document");
  assert.deepEqual(formatsForMedia([video]), ["video", "reel", "story"]);
  assert.deepEqual(formatsForMedia([image, image]), ["carousel"]);
});

test("platforms that cannot publish the uploaded media are explained", () => {
  assert.equal(unsupportedReason(youtube, []), null);
  assert.match(unsupportedReason(youtube, [image]), /YouTube only accepts videos through Meadow/);
  assert.equal(unsupportedReason(youtube, [video]), null);
  assert.equal(unsupportedReason(instagram, [image, video]), null);
  assert.match(unsupportedReason(x, [image, video]), /only contain pictures/);
  assert.match(unsupportedReason(x, [image, image, image, image, image]), /up to 4 items/);
  assert.match(unsupportedReason(instagram, [doc]), /can't publish documents through Meadow/);
  assert.equal(unsupportedReason(linkedin, [doc]), null);
});
