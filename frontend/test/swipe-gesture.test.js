import assert from "node:assert/strict";
import test from "node:test";
import { createFistToggle, createHandSwipeTracker, createSwipeDetector, handBox, handKeys, handTone, isFist, palmCenter } from "../src/bridge/swipeGesture.js";

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
  assert.deepEqual(move(createSwipeDetector(), { from: 0.3, to: 0.42, ms: 3000 }).gestures, []);
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

// Malik's wave from the clip: the hand rests by the face, drifts to the
// shoulder over about a second (push), and swings back.
function rest(detector, x, start, ms = 300) {
  let t = start;
  for (let i = 0; i < ms / 33; i++) detector.update(t += 33, { x, y: 0.5 });
  return t;
}

test("a slow, gentle wave counts, and the swing back to the start does not", () => {
  const detector = createSwipeDetector(), gestures = [];
  let t = rest(detector, 0.5, 0);
  for (const step of [[0.5, 0.68, 1100], [0.68, 0.5, 700], "rest", [0.5, 0.68, 1100], [0.68, 0.5, 700], "rest", [0.5, 0.3, 800]]) {
    if (step === "rest") { t = rest(detector, 0.5, t); continue; }
    const [from, to, ms] = step;
    const stroke = move(detector, { from, to, ms, start: t + 33 });
    gestures.push(...stroke.gestures);
    t = stroke.end;
  }
  assert.deepEqual(gestures, ["right", "right", "left"]);
});

test("resting on the far side and then coming back is not a swipe", () => {
  const detector = createSwipeDetector();
  const swipe = move(detector, { from: 0.5, to: 0.68, ms: 1100 });
  const t = rest(detector, 0.68, swipe.end, 3000);
  const back = move(detector, { from: 0.68, to: 0.5, ms: 700, start: t + 33 });
  rest(detector, 0.5, back.end);
  assert.deepEqual([...swipe.gestures, ...back.gestures], ["right"]);
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

test("boxes are green on the push side or moving right, red otherwise", () => {
  const left = { x0: 0.1, y0: 0, x1: 0.3, y1: 0.2 }, right = { x0: 0.6, y0: 0, x1: 0.8, y1: 0.2 };
  assert.equal(handTone({ box: left, active: false, offset: 0, minDistance: 0.22 }).push, false);
  assert.equal(handTone({ box: right, active: false, offset: 0, minDistance: 0.22 }).push, true);
  assert.deepEqual(handTone({ box: left, active: true, offset: 0.11, minDistance: 0.22 }), { push: true, strength: 0.5 });
  assert.equal(handTone({ box: right, active: true, offset: -0.2, minDistance: 0.22 }).push, false);
});

// Twenty-one landmarks for an upright hand (wrist at the bottom), with each
// finger extended, half-curled as in a relaxed wave, or folded into a fist.
function hand(fingers = ["fist", "fist", "fist", "fist"]) {
  const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[0] = { x: 0.5, y: 0.9, z: 0 };
  const tipY = { open: 0.3, half: 0.52, fist: 0.72 };
  [[8, 6, 5, 0.42], [12, 10, 9, 0.48], [16, 14, 13, 0.54], [20, 18, 17, 0.6]].forEach(([tip, pip, knuckle, x], index) => {
    points[knuckle] = { x, y: 0.6, z: 0 };
    points[pip] = { x, y: 0.48, z: 0 };
    points[tip] = { x, y: tipY[fingers[index]], z: 0 };
  });
  return points;
}

test("only a tightly closed fist counts, not a half-curled wave", () => {
  assert.equal(isFist(hand()), true);
  assert.equal(isFist(hand(["open", "open", "open", "open"])), false);
  assert.equal(isFist(hand(["half", "half", "half", "half"])), false);
  assert.equal(isFist(hand(["fist", "fist", "fist", "half"])), false);
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

test("a fist must be held still to pause", () => {
  const toggle = createFistToggle({ holdMs: 900 });
  let toggles = 0;
  // Sweeping sideways for two seconds never pauses...
  for (let t = 0; t <= 2000; t += 33) if (toggle.update(t, true, { x: 0.3 + t / 5000, y: 0.4 })) toggles++;
  assert.equal(toggles, 0);
  // ...but stopping and holding it does.
  for (let t = 2033; t <= 3200; t += 33) if (toggle.update(t, true, { x: 0.7, y: 0.4 })) toggles++;
  assert.equal(toggles, 1);
});

// Frames at 30 a second of a phone held low and still (left hand) while the
// right hand moves as given.
function frames(tracker, { from, to, y = 0.4, ms = 330, start = 0, phone = { x: 0.45, y: 0.82 }, fist = false, phoneFist = false }) {
  const count = Math.round(ms / 33), gestures = [];
  for (let i = 0; i <= count; i++) {
    const x = from + (to - from) * (i / count);
    const { gesture } = tracker.update(start + i * 33, [
      { key: "Left", palm: phone, fist: phoneFist },
      { key: "Right", palm: { x, y }, fist },
    ]);
    if (gesture) gestures.push(gesture);
  }
  return { gestures, end: start + count * 33 };
}

test("a raised hand swipes even while the other hand holds a phone still", () => {
  assert.deepEqual(frames(createHandSwipeTracker(), { from: 0.5, to: 0.68 }).gestures, ["right"]);
  assert.deepEqual(frames(createHandSwipeTracker(), { from: 0.66, to: 0.48 }).gestures, ["left"]);
});

test("a hand resting low cannot swipe or pause", () => {
  assert.deepEqual(frames(createHandSwipeTracker(), { from: 0.3, to: 0.7, y: 0.85 }).gestures, []);
  // Gripping a phone low can look like a fist; it must not pause.
  assert.deepEqual(frames(createHandSwipeTracker(), { from: 0.5, to: 0.5, ms: 1500, phoneFist: true }).gestures, []);
});

test("a raised fist pauses once", () => {
  assert.deepEqual(frames(createHandSwipeTracker(), { from: 0.5, to: 0.5, ms: 1500, fist: true }).gestures, ["fist"]);
});

test("a fist sweeping sideways swipes instead of pausing", () => {
  assert.deepEqual(frames(createHandSwipeTracker(), { from: 0.5, to: 0.68, fist: true }).gestures, ["right"]);
});

test("hand keys stay distinct when both hands get the same label", () => {
  assert.deepEqual(handKeys(["Left", "Right"]), ["Left", "Right"]);
  assert.deepEqual(handKeys(["Left", "Left", undefined]), ["Left", "Left-2", "hand-2"]);
});
