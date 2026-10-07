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

/** Left and right swipes from a stream of palm positions. A swipe is the palm
 * moving sideways by `handScale` palm lengths (wrist to middle knuckle, so it
 * works near or far from the camera) within `windowMs`; without a palm size it
 * is `minDistance` of the frame. After a swipe the hand swings back. That swing
 * is not the opposite swipe unless it carries on past where the swipe started,
 * and once it settles the detector is fully armed again. Nothing leaves it
 * stuck: another swipe the same way always counts. */
export function createSwipeDetector({ minDistance = 0.12, handScale = 0.75, minScaled = 0.06, maxScaled = 0.2, windowMs = 500, cooldownMs = 500, maxVerticalRatio = 0.8, lostMs = 500, stillDistance = 0.025, stillMs = 200, sizeMemoryMs = 1000 } = {}) {
  // `swing` follows the hand after a swipe ({ direction, origin, far }) until it has swung back and settled.
  let samples = [], sizes = [], lastSeen = -Infinity, coolUntil = 0, swing = null;
  const settled = now => {
    const recent = samples.filter(sample => now - sample.t <= stillMs);
    if (recent.length < 2 || now - recent[0].t < stillMs * 0.8) return false;
    const xs = recent.map(sample => sample.x);
    return Math.max(...xs) - Math.min(...xs) <= stillDistance;
  };
  // A palm looks shorter as it turns, so use the largest size seen lately.
  const distanceFor = (now, size) => {
    if (!size) return minDistance;
    sizes.push({ t: now, size });
    sizes = sizes.filter(entry => now - entry.t <= sizeMemoryMs);
    return Math.min(maxScaled, Math.max(minScaled, Math.max(...sizes.map(entry => entry.size)) * handScale));
  };
  return {
    /** Feed one frame. `point` ({ x, y, size? }) is null when no hand is
     * visible. `pull` is the sideways movement as a share of a swipe. */
    update(now, point) {
      if (!point) {
        if (now - lastSeen > lostMs) { samples = []; sizes = []; swing = null; }
        return { gesture: null, pull: 0 };
      }
      lastSeen = now;
      samples.push({ t: now, x: point.x, y: point.y });
      samples = samples.filter(sample => now - sample.t <= windowMs);
      const distance = distanceFor(now, point.size);
      const latest = samples.at(-1);
      if (swing) {
        swing.far = swing.direction > 0 ? Math.max(swing.far, latest.x) : Math.min(swing.far, latest.x);
        const back = (swing.far - latest.x) * swing.direction;
        // Once the swing back settles, count movement from here, not the swing itself.
        if (back >= Math.abs(swing.far - swing.origin) * 0.4 && settled(now)) { swing = null; samples = [latest]; }
      }
      let best = { dx: 0, dy: 0, from: latest.x };
      for (const sample of samples) {
        const dx = latest.x - sample.x, dy = latest.y - sample.y;
        if (Math.abs(dx) > Math.abs(best.dx)) best = { dx, dy, from: sample.x };
      }
      const direction = Math.sign(best.dx);
      const swingingBack = Boolean(swing) && direction === -swing.direction && (latest.x - swing.origin) * direction < distance;
      if (!swingingBack && now >= coolUntil && Math.abs(best.dx) >= distance && Math.abs(best.dy) <= Math.abs(best.dx) * maxVerticalRatio) {
        swing = { direction, origin: best.from, far: latest.x };
        samples = [latest]; coolUntil = now + cooldownMs;
        return { gesture: direction > 0 ? "right" : "left", pull: direction };
      }
      return { gesture: null, pull: swingingBack ? 0 : best.dx / distance };
    },
    reset() { samples = []; sizes = []; swing = null; coolUntil = 0; lastSeen = -Infinity; },
  };
}

/** A palm's on-screen length, wrist to middle knuckle, as a share of the
 * frame width. `aspect` is the frame's height over its width. */
export function palmSize(landmarks, aspect = 9 / 16) {
  const wrist = landmarks?.[0], knuckle = landmarks?.[9];
  if (!wrist || !knuckle) return 0;
  return Math.hypot(knuckle.x - wrist.x, (knuckle.y - wrist.y) * aspect);
}

/** A padded bounding box around one hand, mirrored like the camera preview. */
export function handBox(landmarks, pad = 0.15) {
  const xs = landmarks.map(point => 1 - point.x), ys = landmarks.map(point => point.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const padX = (x1 - x0) * pad, padY = (y1 - y0) * pad;
  return { x0: Math.max(0, x0 - padX), y0: Math.max(0, y0 - padY), x1: Math.min(1, x1 + padX), y1: Math.min(1, y1 + padY) };
}

/** Green (push) or red (skip) for a hand box: an active hand's movement
 * (`pull`, as a share of a swipe) decides once it is clearly moving,
 * otherwise the side of the frame it is on. */
export function handTone({ box, active, pull }) {
  const moving = active && Math.abs(pull) >= 0.2;
  const push = moving ? pull > 0 : (box.x0 + box.x1) / 2 >= 0.5;
  return { push, strength: active ? Math.min(1, Math.abs(pull)) : 0 };
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

/** Swipe and fist tracking across every hand in view. Each hand (keyed by
 * createHandMatcher) has its own detector, so a still hand, such as one
 * holding a phone, never masks the hand that is waving. Only a raised hand,
 * with its palm above `activeBelow` of the frame height, can swipe or pause;
 * a hand resting low (or gripping a phone) is ignored. */
export function createHandSwipeTracker({ activeBelow = 0.8, forgetMs = 5000, ...detectorOptions } = {}) {
  const detectors = new Map(), lastSeen = new Map();
  const fistToggle = createFistToggle();
  const detectorFor = key => {
    if (!detectors.has(key)) detectors.set(key, createSwipeDetector(detectorOptions));
    return detectors.get(key);
  };
  return {
    /** `hands` is [{ key, palm, size, fist }]. Returns the frame's gesture
     * ("left", "right", "fist" or null), the strongest pull, and each hand
     * marked active with its own pull. */
    update(now, hands) {
      let gesture = null, pull = 0, fistPalm = null;
      const annotated = hands.map(hand => {
        lastSeen.set(hand.key, now);
        const active = hand.palm.y <= activeBelow;
        const detector = detectorFor(hand.key);
        let handPull = 0;
        if (!active) detector.reset();
        else {
          // A fist still swipes if it sweeps sideways; only a still one pauses.
          if (hand.fist) fistPalm ||= hand.palm;
          const result = detector.update(now, { ...hand.palm, size: hand.size });
          handPull = result.pull;
          gesture ||= result.gesture;
        }
        if (Math.abs(handPull) > Math.abs(pull)) pull = handPull;
        return { ...hand, active, pull: handPull };
      });
      for (const [key, detector] of detectors) {
        if (lastSeen.get(key) === now) continue;
        if (now - lastSeen.get(key) > forgetMs) { detectors.delete(key); lastSeen.delete(key); }
        else detector.update(now, null);
      }
      if (fistToggle.update(now, Boolean(fistPalm), fistPalm)) gesture = "fist";
      return { gesture, pull, hands: annotated };
    },
    reset() { detectors.clear(); lastSeen.clear(); fistToggle.reset(); },
  };
}

/** Gives each hand a key that follows it from frame to frame by position:
 * each palm takes the key of the nearest recently seen palm (closest pairs
 * first). A hand that blurs out of tracking for a moment during a fast sweep
 * keeps its key if it reappears within `memoryMs`, a little further along; a
 * hand that appears elsewhere gets a new key. MediaPipe's left/right label is
 * not used because it flips between frames. */
export function createHandMatcher({ maxJump = 0.2, memoryMs = 500, jumpPerSecond = 0.8 } = {}) {
  let known = [], next = 0;
  return (palms, now = 0) => {
    known = known.filter(entry => now - entry.seen <= memoryMs);
    const pairs = [];
    palms.forEach((palm, index) => known.forEach(entry => {
      const gap = Math.hypot(palm.x - entry.palm.x, palm.y - entry.palm.y);
      if (gap <= maxJump + (now - entry.seen) / 1000 * jumpPerSecond) pairs.push({ index, key: entry.key, gap });
    }));
    pairs.sort((a, b) => a.gap - b.gap);
    const keys = palms.map(() => null), taken = new Set();
    for (const { index, key } of pairs) if (keys[index] === null && !taken.has(key)) { keys[index] = key; taken.add(key); }
    for (let index = 0; index < keys.length; index++) keys[index] ??= `hand-${next++}`;
    known = [...known.filter(entry => !keys.includes(entry.key)), ...palms.map((palm, index) => ({ key: keys[index], palm, seen: now }))];
    return keys;
  };
}
