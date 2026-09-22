import assert from "node:assert/strict";
import test from "node:test";
import { nextWalkthroughStep, postVerdict, runningSlopScore } from "./tiktokWalkthrough.js";

test("post verdicts follow the analyzed bucket and leave missing posts unscored", () => {
  assert.deepEqual(postVerdict({ bucket: "strong" }), { label: "NOT SLOP", tone: "fresh" });
  assert.deepEqual(postVerdict({ bucket: "thin" }), { label: "MID", tone: "mid" });
  assert.deepEqual(postVerdict({ bucket: "filler" }), { label: "SLOP", tone: "slop" });
  for (const post of [undefined, null, {}, { bucket: "unscored" }, { bucket: "unknown" }, { bucket: "toString" }]) {
    assert.deepEqual(postVerdict(post), { label: "UNSCORED", tone: "unscored" });
  }
});

test("the meter uses only revealed posts and changes with their cumulative score", () => {
  const posts = ["filler", "thin", "strong", "filler"].map(bucket => Object.freeze({ bucket }));
  Object.freeze(posts);
  assert.deepEqual([0, 1, 2, 3, 4].map(count => runningSlopScore(posts, count)), [null, 100, 75, 50, 63]);
});

test("missing, unscored, and unknown posts do not dilute the running score", () => {
  const posts = [null, { bucket: "unscored" }, { bucket: "strong" }, {}, { bucket: "filler" }, { bucket: "unknown" }];
  assert.equal(runningSlopScore(posts, 2), null);
  assert.equal(runningSlopScore(posts, 4), 0);
  assert.equal(runningSlopScore(posts, 6), 50);
  assert.equal(runningSlopScore([null, {}, { bucket: "unscored" }], 3), null);
});

test("the score clamps revealed counts and handles an empty or invalid sample", () => {
  const posts = [{ bucket: "filler" }, { bucket: "strong" }];
  assert.equal(runningSlopScore(posts, 1.9), 100);
  assert.equal(runningSlopScore(posts, 99), 50);
  assert.equal(runningSlopScore(posts, Infinity), 50);
  for (const count of [-1, -Infinity, NaN, undefined]) assert.equal(runningSlopScore(posts, count), null);
  assert.equal(runningSlopScore([], 10), null);
  assert.equal(runningSlopScore(null, 10), null);
});

test("the walkthrough reads and reveals every post before completing", () => {
  let step = Object.freeze({ index: 0, phase: "reading" });
  const visited = [step];
  for (let tick = 0; tick < 6; tick += 1) {
    step = Object.freeze(nextWalkthroughStep(step, 3));
    visited.push(step);
  }
  assert.deepEqual(visited, [
    { index: 0, phase: "reading" },
    { index: 0, phase: "verdict" },
    { index: 1, phase: "reading" },
    { index: 1, phase: "verdict" },
    { index: 2, phase: "reading" },
    { index: 2, phase: "verdict" },
    { index: 2, phase: "complete" },
  ]);
  assert.deepEqual(nextWalkthroughStep(step, 3), step);
});

test("a single post completes after its verdict and zero posts complete immediately", () => {
  assert.deepEqual(nextWalkthroughStep({ index: 0, phase: "verdict" }, 1), { index: 0, phase: "complete" });
  for (const count of [0, -4, undefined, NaN, Infinity]) {
    assert.deepEqual(nextWalkthroughStep({ index: 8, phase: "reading" }, count), { index: 0, phase: "complete" });
  }
});

test("invalid steps start reading and out-of-range indices stay inside the sample", () => {
  assert.deepEqual(nextWalkthroughStep(undefined, 3), { index: 0, phase: "reading" });
  assert.deepEqual(nextWalkthroughStep({ index: 1, phase: "unknown" }, 3), { index: 1, phase: "reading" });
  assert.deepEqual(nextWalkthroughStep({ index: -4, phase: "reading" }, 3), { index: 0, phase: "verdict" });
  assert.deepEqual(nextWalkthroughStep({ index: 99, phase: "reading" }, 3), { index: 2, phase: "verdict" });
  assert.deepEqual(nextWalkthroughStep({ index: Infinity, phase: "verdict" }, 3), { index: 2, phase: "complete" });
  assert.deepEqual(nextWalkthroughStep({ index: NaN, phase: "reading" }, 3), { index: 0, phase: "verdict" });
  assert.deepEqual(nextWalkthroughStep({ index: 1.9, phase: "reading" }, 3.9), { index: 1, phase: "verdict" });
});
