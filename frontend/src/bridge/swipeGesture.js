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
