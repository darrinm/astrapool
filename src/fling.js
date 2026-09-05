// Pointer samples use event timestamps, so a busy frame cannot compress a flick to zero duration.
const HISTORY_MS = 400, VELOCITY_WINDOW_MS = 80, RELEASE_GRACE_MS = 140, STOP_MS = 300;

// Record a pointer position, keeping only the history a throw can still depend on.
export function pushSample(samples, sample) {
  samples.push(sample);
  while (samples.length > 2 && samples[1].t < sample.t - HISTORY_MS) samples.shift();
}

// The throw is the fastest recent window of movement, not the motion at the instant the button came up.
// A hand slows or stops for a few dozen milliseconds before the finger lifts, and a trackpad keeps
// reporting sub-pixel jitter while it rests; measuring only the release tail turns most throws into
// a gentle drop. A longer pause fades the throw out, and a deliberate hold places the ball.
// The last sample is the release.
export function flingVelocity(samples) {
  const releasedAt = samples.at(-1).t;
  let best = { x: 0, y: 0 }, bestSpeed = 0;
  for (let end = samples.length - 1; end > 0; end--) {
    const idle = releasedAt - samples[end].t;
    if (idle >= STOP_MS) break;
    // Resting samples must not restart the decay clock for earlier movement.
    const last = samples[end], previous = samples[end - 1];
    if (last.x === previous.x && last.y === previous.y) continue;
    const decay = Math.min(1, (STOP_MS - idle) / (STOP_MS - RELEASE_GRACE_MS));
    const v = windowVelocity(samples, end), speed = Math.hypot(v.x, v.y) * decay;
    if (speed > bestSpeed) { bestSpeed = speed; best = { x: v.x * decay, y: v.y * decay }; }
  }
  return best;
}

// Mean velocity over the window ending at samples[end].
function windowVelocity(samples, end) {
  const last = samples[end], cutoff = last.t - VELOCITY_WINDOW_MS;
  let start = end - 1;
  while (start > 0 && samples[start].t > cutoff) start--;
  let first = samples[start];
  // Keep the sample before the window and interpolate it instead of discarding sparse mouse input.
  if (first.t < cutoff) {
    const next = samples[start + 1], fraction = (cutoff - first.t) / (next.t - first.t);
    first = { x: first.x + (next.x - first.x) * fraction, y: first.y + (next.y - first.y) * fraction, t: cutoff };
  }
  const dt = Math.max(8, last.t - first.t) / 1000;
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}
