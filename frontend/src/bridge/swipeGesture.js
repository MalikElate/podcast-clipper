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

export function createSwipeDetector({ minDistance = 0.22, windowMs = 500, cooldownMs = 900, maxVerticalRatio = 0.7, lostMs = 300, stillDistance = 0.05, stillMs = 250 } = {}) {
  let samples = [], lastSeen = -Infinity, coolUntil = 0, armed = true;
  const span = (since, now) => {
    const recent = samples.filter(sample => now - sample.t <= since);
    if (recent.length < 2) return Infinity;
    const xs = recent.map(sample => sample.x);
    return Math.max(...xs) - Math.min(...xs);
  };
  return {
    /** Feed one frame. `point` is null when no hand is visible. */
    update(now, point) {
      if (!point) {
        if (now - lastSeen > lostMs) { samples = []; if (now >= coolUntil) armed = true; }
        return { gesture: null, offset: 0 };
      }
      lastSeen = now;
      samples.push({ t: now, x: point.x, y: point.y });
      samples = samples.filter(sample => now - sample.t <= windowMs);
      // After a swipe the hand swings back. Wait until it rests or leaves the
      // frame so the return stroke is not read as the opposite swipe.
      if (!armed) {
        if (now >= coolUntil && span(stillMs, now) <= stillDistance) armed = true;
        return { gesture: null, offset: 0 };
      }
      const latest = samples.at(-1);
      let best = { dx: 0, dy: 0 };
      for (const sample of samples) {
        const dx = latest.x - sample.x, dy = latest.y - sample.y;
        if (Math.abs(dx) > Math.abs(best.dx)) best = { dx, dy };
      }
      if (Math.abs(best.dx) >= minDistance && Math.abs(best.dy) <= Math.abs(best.dx) * maxVerticalRatio) {
        samples = []; armed = false; coolUntil = now + cooldownMs;
        return { gesture: best.dx > 0 ? "right" : "left", offset: best.dx };
      }
      return { gesture: null, offset: best.dx };
    },
    reset() { samples = []; armed = true; coolUntil = 0; lastSeen = -Infinity; },
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

/** Keep following the same hand when two are visible, so switching between
 * them never looks like a swipe. Otherwise follow the largest (nearest) hand. */
export function pickTrackedHand(hands, previous, maxJump = 0.25) {
  if (!hands.length) return -1;
  if (previous) {
    let best = -1, bestDistance = Infinity;
    hands.forEach((hand, index) => {
      const distance = Math.hypot(hand.palm.x - previous.x, hand.palm.y - previous.y);
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    });
    if (bestDistance <= maxJump) return best;
  }
  const area = box => (box.x1 - box.x0) * (box.y1 - box.y0);
  return hands.reduce((best, hand, index) => area(hand.box) > area(hands[best].box) ? index : best, 0);
}

/** Green (push) or red (skip) for a hand box: the tracked hand's movement
 * decides once it is clearly moving, otherwise the side of the frame it is on. */
export function handTone({ box, tracked, offset, minDistance }) {
  const moving = tracked && Math.abs(offset) >= minDistance * 0.2;
  const push = moving ? offset > 0 : (box.x0 + box.x1) / 2 >= 0.5;
  return { push, strength: tracked ? Math.min(1, Math.abs(offset) / minDistance) : 0 };
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** A closed fist: each of the four fingertips is nearer the wrist than its
 * middle knuckle. The thumb is ignored because it tucks in many ways. */
export function isFist(landmarks) {
  const wrist = landmarks?.[0];
  if (!wrist) return false;
  return [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, knuckle]) => landmarks[tip] && landmarks[knuckle] && distance(landmarks[tip], wrist) < distance(landmarks[knuckle], wrist));
}

/** Reports one toggle per held fist: the fist must last `holdMs`, and the hand
 * must open (or leave the frame) for `releaseMs` before the next toggle. */
export function createFistToggle({ holdMs = 450, releaseMs = 300 } = {}) {
  let fistSince = null, openSince = null, armed = true;
  return {
    update(now, fist) {
      if (fist) {
        openSince = null;
        fistSince ??= now;
        if (armed && now - fistSince >= holdMs) { armed = false; return true; }
        return false;
      }
      fistSince = null;
      openSince ??= now;
      if (!armed && now - openSince >= releaseMs) armed = true;
      return false;
    },
    reset() { fistSince = null; openSince = null; armed = true; },
  };
}
