// Record actual poses, never rerun physics. Keep the last completed shot plus one
// in progress; long Free Play sessions reduce their sample rate to bound memory.
export const REPLAY_INTERVAL = 1 / 120, MAX_REPLAY_FRAMES = 3601;

export function acceptedOnlineReplay(before, data) {
  if (!before || data.pending || data.seq !== before.seq + 1) return false;
  const { arcade, match } = data.snapshot;
  if (arcade && before.rack !== null) return arcade.rack > before.rack ||
    arcade.rack === before.rack && arcade.lastPlay === before.play + 1;
  return match.shots > before.shots || !!match.breaking && match.breaker !== before.breaker;
}

export class ShotReplay {
  constructor() { this.reset(); }
  reset() { this.last = null; this.discard(); }
  discard() { this.recording = null; this.pending = null; }
  begin(time, numbers, read, metadata = {}) {
    if (this.recording) return; // Additional flings belong to the same play.
    this.pending = null;
    this.recording = { start: time, interval: REPLAY_INTERVAL, numbers: [...numbers], metadata, frames: [] };
    this.capture(time, read, true);
  }
  capture(time, read, force = false) {
    const clip = this.recording;
    if (!clip) return;
    const elapsed = Math.max(0, time - clip.start), previous = clip.frames.at(-1);
    if (!force && previous && elapsed - previous.time < clip.interval - 1e-7) return;
    const frame = { time: elapsed, poses: new Float32Array(read()) };
    if (previous?.time === elapsed) { clip.frames[clip.frames.length - 1] = frame; return; }
    if (clip.frames.length >= MAX_REPLAY_FRAMES) {
      clip.frames = clip.frames.filter((_, i) => i % 2 === 0);
      clip.interval *= 2;
    }
    clip.frames.push(frame);
  }
  finish(time, read, pending = false) {
    if (!this.recording) return;
    this.capture(time, read, true);
    const clip = this.recording;
    clip.duration = clip.frames.at(-1).time;
    this.recording = null;
    if (pending) this.pending = clip;
    else this.last = clip;
    return clip;
  }
  resolveOnline(data) {
    const accepted = this.pending && acceptedOnlineReplay(this.pending.metadata.online, data);
    if (accepted) this.last = this.pending;
    this.discard();
    return !!accepted;
  }
}

export function replayFrame(clip, time) {
  const frames = clip.frames;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].time <= time) lo = mid;
    else hi = mid - 1;
  }
  const from = frames[lo], to = frames[Math.min(lo + 1, frames.length - 1)];
  const mix = to.time === from.time ? 0 : Math.max(0, Math.min(1, (time - from.time) / (to.time - from.time)));
  return { from: from.poses, to: to.poses, mix };
}
