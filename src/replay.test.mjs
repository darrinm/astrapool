import test from 'node:test';
import assert from 'node:assert/strict';
import { ShotReplay, replayFrame, acceptedOnlineReplay, REPLAY_INTERVAL, MAX_REPLAY_FRAMES } from './replay.js';

const pose = x => [1, x, 2, 3, 0, 0, 0, 1];
function record(replay, metadata = {}) {
  replay.begin(10, [0], () => pose(0), metadata);
  replay.capture(10.5, () => pose(5));
  return replay.finish(11, () => pose(10), !!metadata.online);
}

test('records copied poses with exact first/final samples and interpolates a seek', () => {
  const replay = new ShotReplay(), source = pose(0);
  replay.begin(10, [0], () => source, { label: 'Player 1' });
  source[1] = 99;
  let reads = 0;
  replay.capture(10.001, () => { reads++; return source; });
  assert.equal(reads, 0, 'physics ticks between samples do no pose allocation');
  const clip = replay.finish(11, () => pose(10));
  assert.equal(clip.frames[0].poses[1], 0); assert.equal(clip.duration, 1);
  const { from, to, mix } = replayFrame(clip, .25);
  assert.equal(from[1] + (to[1] - from[1]) * mix, 2.5);
  assert.equal(replayFrame(clip, 5).from[1], 10);
  assert.equal(replayFrame(clip, -1).mix, 0);
});

test('additional Free Play launches keep one recording; unfinished resets preserve the last shot', () => {
  const replay = new ShotReplay(), previous = record(replay);
  replay.begin(12, [0], () => pose(1), { label: 'Fling' });
  replay.begin(13, [0], () => pose(8), { label: 'Fling again' });
  assert.equal(replay.recording.start, 12);
  assert.equal(replay.recording.metadata.label, 'Fling');
  replay.discard(); assert.equal(replay.last, previous);
  replay.reset(); assert.equal(replay.last, null);
});

test('long Free Play recordings stay bounded while retaining the beginning and ending', () => {
  const replay = new ShotReplay();
  replay.begin(0, [0], () => pose(0));
  for (let i = 1; i <= MAX_REPLAY_FRAMES * 4; i++) replay.capture(i * REPLAY_INTERVAL, () => pose(i));
  const clip = replay.finish(200, () => pose(200));
  assert.ok(clip.frames.length <= MAX_REPLAY_FRAMES);
  assert.equal(clip.frames[0].time, 0); assert.equal(clip.frames.at(-1).time, 200);
  assert.ok(clip.frames.every((frame, i) => !i || frame.time > clip.frames[i - 1].time));
});

const online = { seq: 9, rack: 3, play: 4, shots: 4, breaker: 0 };
const accepted = { seq: 10, pending: null, snapshot: { arcade: { rack: 3, lastPlay: 5 }, match: { shots: 5 } } };
test('online replay waits for acceptance and survives duplicate state without repeating it', () => {
  const replay = new ShotReplay(), previous = record(replay);
  const next = record(replay, { online });
  assert.equal(replay.last, previous);
  assert.equal(replay.resolveOnline(accepted), true); assert.equal(replay.last, next);
  assert.equal(replay.resolveOnline(accepted), false); assert.equal(replay.last, next);
});
test('online rollback, stale states, and another pending shot cannot publish provisional replays', () => {
  for (const state of [
    { ...accepted, seq: 12 },
    { ...accepted, pending: { seat: 1 } },
    { ...accepted, snapshot: { ...accepted.snapshot, arcade: { rack: 3, lastPlay: 4 } } },
  ]) {
    const replay = new ShotReplay(), previous = record(replay);
    record(replay, { online }); assert.equal(replay.resolveOnline(state), false);
    assert.equal(replay.last, previous); assert.equal(replay.pending, null);
  }
});
test('accepted illegal breaks and legacy online racks are replayable', () => {
  assert.equal(acceptedOnlineReplay(online, { ...accepted, snapshot: { arcade: { rack: 4, lastPlay: 0 }, match: { breaking: true, shots: 0, breaker: 1 } } }), true);
  const legacy = { ...online, rack: null };
  assert.equal(acceptedOnlineReplay(legacy, { ...accepted, snapshot: { match: { shots: 5 } } }), true);
  assert.equal(acceptedOnlineReplay(legacy, { ...accepted, snapshot: { match: { shots: 4, breaker: 0 } } }), false);
  assert.equal(acceptedOnlineReplay(legacy, { ...accepted, snapshot: { match: { shots: 0, breaker: 1, breaking: true } } }), true);
});
