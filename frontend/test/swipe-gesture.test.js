import assert from "node:assert/strict";
import test from "node:test";
import { createFistToggle, createSwipeDetector, handBox, handTone, isFist, palmCenter, pickTrackedHand } from "../src/bridge/swipeGesture.js";

// Feed a straight hand movement at 30 frames a second and collect gestures.
function move(detector, { from, to, start = 0, ms = 300, y = 0.5, yTo = y }) {
  const frames = Math.round(ms / 33), gestures = [];
  for (let i = 0; i <= frames; i++) {
    const progress = i / frames;
    const { gesture } = detector.update(start + i * 33, { x: from + (to - from) * progress, y: y + (yTo - y) * progress });
    if (gesture) gestures.push(gesture);
  }
  return { gestures, end: start + frames * 33 };
}

test("the palm centre is mirrored so moving toward your right increases x", () => {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.4 }));
  assert.deepEqual(palmCenter(landmarks), { x: 0.8, y: 0.4 });
});

test("a quick horizontal sweep is a swipe in that direction", () => {
  assert.deepEqual(move(createSwipeDetector(), { from: 0.3, to: 0.7 }).gestures, ["right"]);
  assert.deepEqual(move(createSwipeDetector(), { from: 0.7, to: 0.3 }).gestures, ["left"]);
});

test("small, slow or vertical movements are ignored", () => {
  assert.deepEqual(move(createSwipeDetector(), { from: 0.45, to: 0.55 }).gestures, []);
  assert.deepEqual(move(createSwipeDetector(), { from: 0.3, to: 0.7, ms: 2000 }).gestures, []);
  assert.deepEqual(move(createSwipeDetector(), { from: 0.4, to: 0.65, y: 0.2, yTo: 0.8 }).gestures, []);
});

test("the hand swinging back after a swipe is not read as the opposite swipe", () => {
  const detector = createSwipeDetector();
  const swipe = move(detector, { from: 0.3, to: 0.75 });
  const back = move(detector, { from: 0.75, to: 0.35, start: swipe.end + 33, ms: 250 });
  assert.deepEqual([...swipe.gestures, ...back.gestures], ["right"]);
  // Once the hand rests, the next swipe counts.
  let t = back.end;
  for (let i = 0; i < 40; i++) detector.update(t += 33, { x: 0.35, y: 0.5 });
  assert.deepEqual(move(detector, { from: 0.35, to: 0.75, start: t + 33 }).gestures, ["right"]);
});

test("a hand that leaves the frame re-arms the detector", () => {
  const detector = createSwipeDetector();
  const swipe = move(detector, { from: 0.7, to: 0.3 });
  let t = swipe.end;
  for (let i = 0; i < 40; i++) detector.update(t += 33, null);
  assert.deepEqual(move(detector, { from: 0.7, to: 0.3, start: t + 33 }).gestures, ["left"]);
});

test("hand boxes are mirrored, padded, and kept inside the frame", () => {
  const landmarks = [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.6 }];
  const box = handBox(landmarks, 0.1);
  assert.deepEqual(Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100])), { x0: 0.58, y0: 0.27, x1: 0.82, y1: 0.63 });
  assert.deepEqual(handBox([{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }]), { x0: 0.885, y0: 0, x1: 1, y1: 0.115 });
});

test("the tracked hand stays the same when a second hand appears", () => {
  const hand = (x, size = 0.2) => ({ palm: { x, y: 0.5 }, box: { x0: x - size / 2, y0: 0.4, x1: x + size / 2, y1: 0.6 } });
  assert.equal(pickTrackedHand([], null), -1);
  assert.equal(pickTrackedHand([hand(0.2), hand(0.7, 0.4)], null), 1);
  assert.equal(pickTrackedHand([hand(0.7, 0.4), hand(0.25)], { x: 0.22, y: 0.5 }), 1);
  assert.equal(pickTrackedHand([hand(0.8)], { x: 0.2, y: 0.5 }), 0);
});

test("boxes are green on the push side or moving right, red otherwise", () => {
  const left = { x0: 0.1, y0: 0, x1: 0.3, y1: 0.2 }, right = { x0: 0.6, y0: 0, x1: 0.8, y1: 0.2 };
  assert.equal(handTone({ box: left, tracked: false, offset: 0, minDistance: 0.22 }).push, false);
  assert.equal(handTone({ box: right, tracked: false, offset: 0, minDistance: 0.22 }).push, true);
  assert.deepEqual(handTone({ box: left, tracked: true, offset: 0.11, minDistance: 0.22 }), { push: true, strength: 0.5 });
  assert.equal(handTone({ box: right, tracked: true, offset: -0.2, minDistance: 0.22 }).push, false);
});

// Twenty-one landmarks with the fingertips either extended past or curled
// inside their middle knuckles (wrist at the bottom of the frame).
function hand({ curled = [true, true, true, true] } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  points[0] = { x: 0.5, y: 0.9 };
  [[8, 6, 0.42], [12, 10, 0.48], [16, 14, 0.54], [20, 18, 0.6]].forEach(([tip, knuckle, x], index) => {
    points[knuckle] = { x, y: 0.55 };
    points[tip] = curled[index] ? { x, y: 0.7 } : { x, y: 0.35 };
  });
  return points;
}

test("a fist needs all four fingers curled", () => {
  assert.equal(isFist(hand()), true);
  assert.equal(isFist(hand({ curled: [false, false, false, false] })), false);
  assert.equal(isFist(hand({ curled: [false, true, true, true] })), false);
  assert.equal(isFist([]), false);
});

test("a held fist toggles once and must open before toggling again", () => {
  const toggle = createFistToggle({ holdMs: 400, releaseMs: 300 });
  const run = (from, to, fist) => { let count = 0; for (let t = from; t <= to; t += 33) if (toggle.update(t, fist)) count++; return count; };
  assert.equal(run(0, 300, true), 0);
  assert.equal(run(333, 2000, true), 1);
  assert.equal(run(2033, 2200, false), 0);
  assert.equal(run(2233, 3000, true), 0);
  assert.equal(run(3033, 3500, false), 0);
  assert.equal(run(3533, 4200, true), 1);
});
