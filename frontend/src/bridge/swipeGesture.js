// Turns a stream of hand positions into left and right swipe gestures.
// Positions are fractions of the camera frame, mirrored so x grows toward the
// user's right: moving the hand to your right is a "right" swipe.

/** Palm centre from MediaPipe hand landmarks: the wrist and the four knuckles. */
export function palmCenter(landmarks) {
  const points = [0, 5, 9, 13, 17].map(index => landmarks[index]).filter(Boolean);
  if (!points.length) return null;
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return { x: 1 - x, y };
}

/** Left and right swipes from a stream of palm positions. A swipe is the hand
 * travelling `minDistance` sideways within `windowMs`, so a slow, gentle wave
 * counts. After a swipe the hand swings back to where it started; that return
 * is ignored, and the detector re-arms once the hand settles back near the
 * swipe's start (or leaves the frame). Resting on the far side never re-arms
 * it, so coming back from there is not read as the opposite swipe. */
export function createSwipeDetector({ minDistance = 0.12, windowMs = 1200, cooldownMs = 600, maxVerticalRatio = 0.7, lostMs = 300, stillDistance = 0.04, stillMs = 200, returnShare = 0.45 } = {}) {
  // `stroke` is the last swipe ({ from, far, direction }) until the hand is back.
  let samples = [], lastSeen = -Infinity, coolUntil = 0, stroke = null;
  const settled = now => {
    const recent = samples.filter(sample => now - sample.t <= stillMs);
    if (recent.length < 2 || now - recent[0].t < stillMs * 0.8) return false;
    const xs = recent.map(sample => sample.x);
    return Math.max(...xs) - Math.min(...xs) <= stillDistance;
  };
  return {
    /** Feed one frame. `point` is null when no hand is visible. */
    update(now, point) {
      if (!point) {
        if (now - lastSeen > lostMs) { samples = []; if (now >= coolUntil) stroke = null; }
        return { gesture: null, offset: 0 };
      }
      lastSeen = now;
      samples.push({ t: now, x: point.x, y: point.y });
      samples = samples.filter(sample => now - sample.t <= windowMs);
      if (stroke) {
        stroke.far = stroke.direction > 0 ? Math.max(stroke.far, point.x) : Math.min(stroke.far, point.x);
        const back = Math.abs(point.x - stroke.from) <= Math.max(stillDistance, Math.abs(stroke.far - stroke.from) * returnShare);
        if (now >= coolUntil && back && settled(now)) { stroke = null; samples = [samples.at(-1)]; }
        return { gesture: null, offset: 0 };
      }
      const latest = samples.at(-1);
      let best = { dx: 0, dy: 0, from: latest.x };
      for (const sample of samples) {
        const dx = latest.x - sample.x, dy = latest.y - sample.y;
        if (Math.abs(dx) > Math.abs(best.dx)) best = { dx, dy, from: sample.x };
      }
      if (Math.abs(best.dx) >= minDistance && Math.abs(best.dy) <= Math.abs(best.dx) * maxVerticalRatio) {
        const direction = Math.sign(best.dx);
        stroke = { from: best.from, far: latest.x, direction };
        samples = [latest]; coolUntil = now + cooldownMs;
        return { gesture: direction > 0 ? "right" : "left", offset: best.dx };
      }
      return { gesture: null, offset: best.dx };
    },
    reset() { samples = []; stroke = null; coolUntil = 0; lastSeen = -Infinity; },
    minDistance,
  };
}

/** A padded bounding box around one hand, mirrored like the camera preview. */
export function handBox(landmarks, pad = 0.15) {
  const xs = landmarks.map(point => 1 - point.x), ys = landmarks.map(point => point.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padX = (x1 - x0) * pad, padY = (y1 - y0) * pad;
  return { x0: Math.max(0, x0 - padX), y0: Math.max(0, y0 - padY), x1: Math.min(1, x1 + padX), y1: Math.min(1, y1 + padY) };
}

/** Green (push) or red (skip) for a hand box: an active hand's movement
 * decides once it is clearly moving, otherwise the side of the frame it is on. */
export function handTone({ box, active, offset, minDistance }) {
  const moving = active && Math.abs(offset) >= minDistance * 0.2;
  const push = moving ? offset > 0 : (box.x0 + box.x1) / 2 >= 0.5;
  return { push, strength: active ? Math.min(1, Math.abs(offset) / minDistance) : 0 };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));

/** A tightly closed fist: every fingertip is folded back nearer the wrist than
 * the knuckle it grows from. A relaxed or half-curled hand, as in a wave,
 * keeps its fingertips beyond the knuckles. Best with MediaPipe's world
 * landmarks (3D, in metres), so the hand's angle to the camera does not
 * matter. The thumb is ignored because it tucks in many ways. */
export function isFist(landmarks) {
  const wrist = landmarks?.[0];
  if (!wrist) return false;
  return [[8, 5], [12, 9], [16, 13], [20, 17]].every(([tip, knuckle]) => landmarks[tip] && landmarks[knuckle] && distance(landmarks[tip], wrist) < distance(landmarks[knuckle], wrist));
}

/** Reports one toggle per held fist: the fist must stay still (within
 * `maxMove` of where it closed) for `holdMs`, and the hand must open (or leave
 * the frame) for `releaseMs` before the next toggle. */
export function createFistToggle({ holdMs = 900, releaseMs = 300, maxMove = 0.05 } = {}) {
  let fistSince = null, openSince = null, armed = true, anchor = null;
  return {
    update(now, fist, point = null) {
      if (fist) {
        openSince = null;
        // A fist that moves is part of a wave, not a pause.
        if (point && anchor && Math.hypot(point.x - anchor.x, point.y - anchor.y) > maxMove) fistSince = null;
        if (fistSince === null) { fistSince = now; anchor = point; }
        if (armed && now - fistSince >= holdMs) { armed = false; return true; }
        return false;
      }
      fistSince = null; anchor = null;
      openSince ??= now;
      if (!armed && now - openSince >= releaseMs) armed = true;
      return false;
    },
    reset() { fistSince = null; openSince = null; armed = true; anchor = null; },
  };
}

/** Swipe and fist tracking across every hand in view. Each hand (keyed by its
 * handedness) has its own detector, so a still hand, such as one holding a
 * phone, never masks the hand that is waving. Only a raised hand, with its
 * palm above `activeBelow` of the frame height, can swipe or pause; a hand
 * resting low (or gripping a phone) is ignored. */
export function createHandSwipeTracker({ activeBelow = 0.7, ...detectorOptions } = {}) {
  const detectors = new Map();
  const fistToggle = createFistToggle();
  const detectorFor = key => {
    if (!detectors.has(key)) detectors.set(key, createSwipeDetector(detectorOptions));
    return detectors.get(key);
  };
  return {
    minDistance: createSwipeDetector(detectorOptions).minDistance,
    /** `hands` is [{ key, palm, fist }]. Returns the frame's gesture
     * ("left", "right", "fist" or null), the strongest offset, and each hand
     * marked active with its own offset. */
    update(now, hands) {
      const seen = new Set();
      let gesture = null, offset = 0, fistPalm = null;
      const annotated = hands.map(hand => {
        seen.add(hand.key);
        const active = hand.palm.y <= activeBelow;
        const detector = detectorFor(hand.key);
        let handOffset = 0;
        if (!active) detector.reset();
        else {
          // A fist still swipes if it sweeps sideways; only a still one pauses.
          if (hand.fist) fistPalm ||= hand.palm;
          const result = detector.update(now, hand.palm);
          handOffset = result.offset;
          gesture ||= result.gesture;
        }
        if (Math.abs(handOffset) > Math.abs(offset)) offset = handOffset;
        return { ...hand, active, offset: handOffset };
      });
      for (const [key, detector] of detectors) if (!seen.has(key)) detector.update(now, null);
      if (fistToggle.update(now, Boolean(fistPalm), fistPalm)) gesture = "fist";
      return { gesture, offset, hands: annotated };
    },
    reset() { detectors.clear(); fistToggle.reset(); },
  };
}

/** Stable keys for this frame's hands: MediaPipe's handedness label, with a
 * suffix if both hands get the same label. */
export function handKeys(handedness) {
  const used = new Map();
  return handedness.map((label, index) => {
    const base = label || `hand-${index}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

/** Where things are moving between two small grayscale frames (one byte a
 * pixel): the centre of the changed pixels, mirrored like the preview, or null
 * when too little moved (still) or too much (the camera moved or the light
 * changed). Rows below `maxY` are ignored, like a lowered hand. This needs no
 * model, so swipes work while the hand tracker is still downloading. */
export function motionPoint(previous, current, width, height, { threshold = 24, maxY = 0.72, minShare = 0.006, maxShare = 0.3 } = {}) {
  const rows = Math.floor(height * maxY);
  let count = 0, weight = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < width; x++) {
      const change = Math.abs(current[y * width + x] - previous[y * width + x]);
      if (change <= threshold) continue;
      count++; weight += change; sumX += x * change; sumY += y * change;
    }
  }
  const share = count / (rows * width);
  if (share < minShare || share > maxShare) return null;
  return { x: 1 - sumX / weight / (width - 1), y: sumY / weight / (height - 1), share };
}
