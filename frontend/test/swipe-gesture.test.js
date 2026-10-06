import assert from "node:assert/strict";
import test from "node:test";
import { createSwipeDetector, palmCenter } from "../src/bridge/swipeGesture.js";

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
