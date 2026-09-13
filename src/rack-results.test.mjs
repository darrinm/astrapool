import test from 'node:test';
import assert from 'node:assert/strict';
import { RackResults, highlightName } from './rack-results.js';
import { newArcade, commitArcade } from './arcade-score.js';
import { ShotReplay } from './replay.js';

function fixture() {
  const results = new RackResults(); let state = newArcade(1);
  results.observe(state); results.begin('computer-tricky.standard');
  return { results, get state() { return state; },
    shot(player, total, fault = null) {
      const receipt = { rack: state.rack, play: state.lastPlay + 1, player, total, fault,
        count: total || fault ? 1 : 0, awards: [{ kind: 'pot' }, ...(total > 100 ? [{ kind: 'bank' }] : [])] };
      state = commitArcade(state, receipt); return state;
    } };
}
const storage = () => { const values = new Map(); return { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v) }; };
function clip(replay, state) {
  replay.begin(0, [0], () => [1, 0, 0, 0, 0, 0, 0, 1], { rack: state.rack, play: state.lastPlay });
  return replay.finish(1, () => [1, 1, 0, 0, 0, 0, 0, 1]);
}

test('retains the highest legal shot independently of the last replay and breaks ties with the first', () => {
  const f = fixture(), replay = new ShotReplay();
  f.shot(0, 500); const best = clip(replay, f.state); f.results.observe(f.state, best);
  f.shot(1, 100); f.results.observe(f.state, clip(replay, f.state));
  f.shot(0, 500); f.results.observe(f.state, clip(replay, f.state));
  f.shot(1, 0, 'early'); f.results.observe(f.state, clip(replay, f.state));
  assert.equal(f.results.best.play, 1); assert.equal(f.results.clip, best);
  assert.notEqual(replay.last, best); assert.equal(highlightName(f.results.best), 'Bank');
});

test('counts full scoring streaks beyond the multiplier cap and ignores duplicate receipts', () => {
  const f = fixture();
  for (let i = 0; i < 6; i++) { f.shot(0, 100); f.results.observe(f.state); f.results.observe(f.state); }
  assert.equal(f.state.streaks[0], 3); assert.equal(f.results.longest[0], 6);
  f.shot(1, 100); f.results.observe(f.state);
  f.shot(0, 0, 'scratch'); f.results.observe(f.state);
  f.shot(0, 100); f.results.observe(f.state);
  assert.deepEqual(f.results.runs, [1, 1]); assert.deepEqual(f.results.longest, [6, 1]);
});

test('confirmed online receipt can acquire its clip later, never a different or provisional shot', () => {
  const f = fixture(), replay = new ShotReplay();
  f.shot(0, 100); const first = clip(replay, f.state); f.results.observe(f.state, first);
  f.shot(1, 300); const accepted = clip(replay, f.state);
  f.results.observe(f.state, first); assert.equal(f.results.clip, null);
  f.results.observe(f.state, accepted); assert.equal(f.results.clip, accepted);
  f.results.observe(f.state, { metadata: { rack: 1, play: 3 } });
  assert.equal(f.results.clip, accepted); assert.equal(f.results.longest[1], 1);
});

test('joining late or missing receipts reports partial history and does not create personal records', () => {
  const f = fixture(); f.shot(0, 100); f.shot(0, 200); f.results.observe(f.state);
  assert.equal(f.results.complete, false); assert.equal(f.results.longest[0], 1);
  assert.deepEqual(f.results.finish(f.state, [0], storage()), []);
  f.results.observe(newArcade(2));
  assert.equal(f.results.complete, true); assert.equal(f.results.clip, null);
  assert.equal(f.results.best, null); assert.deepEqual(f.results.longest, [0, 0]);
});

test('personal records use the human player even when the computer owns the rack highlight', () => {
  const f = fixture(), saved = storage();
  f.shot(0, 100); f.results.observe(f.state); f.shot(1, 900); f.results.observe(f.state);
  const records = f.results.finish(f.state, [0], saved);
  assert.deepEqual(records, ['score', 'shot', 'streak'].map(field => ({ player: 0, field })));
  const second = fixture(); second.shot(0, 200); second.results.observe(second.state);
  assert.deepEqual(second.results.finish(second.state, [0], saved), [{ player: 0, field: 'score' }, { player: 0, field: 'shot' }]);
  assert.equal(f.results.finish(f.state, [0], saved), records, 'completion is idempotent');
});

test('mixed difficulty, input or gravity racks cannot claim a comparable personal record', () => {
  const f = fixture(); f.shot(0, 100); f.results.observe(f.state);
  f.results.begin('computer-tricky.gravity'); f.results.begin('computer-tricky.standard');
  assert.deepEqual(f.results.finish(f.state, [0], storage()), []);
});

test('storage failures do not prevent rack completion, and local records go to the higher result', () => {
  const f = fixture(); f.shot(0, 100); f.results.observe(f.state); f.shot(1, 200); f.results.observe(f.state);
  const records = f.results.finish(f.state, [0, 1], { getItem() { throw Error(); }, setItem() { throw Error(); } });
  assert.equal(records.some(r => r.player === 0 && r.field === 'score'), false);
  assert.equal(records.some(r => r.player === 1 && r.field === 'score'), true);
  assert.equal(highlightName(null), 'No scoring shots');
});
