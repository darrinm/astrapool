import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PoolArcade } from './arcade.js';
import { newArcade } from './arcade-score.js';
import { newMatch, resolveShot } from './eight-ball.js';

test('attract play never records a personal best', () => {
  const arcade = Object.create(PoolArcade.prototype);
  let recorded = 0;
  Object.assign(arcade, { context: () => ({ attract: true }), hud: { record() { recorded++; } } });
  arcade.recordBest();
  assert.equal(recorded, 0);
  arcade.context = () => ({ mode: 'computer' });
  arcade.recordBest();
  assert.equal(recorded, 1);
});

// Exercise event orchestration with presentation sinks, independently of WebGL.
function controller(match) {
  const reactions = [], pockets = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, y: 0 }));
  const arcade = Object.create(PoolArcade.prototype);
  Object.assign(arcade, {
    time: 0, state: newArcade(), active: null, pending: null,
    context: () => ({ mode: 'local', match, calledPocket: 2, input: 'cue', pockets }),
    update() {}, hud: { record() {} },
    effects: { voidPending() {}, confirmPending() {}, launch() {}, ring() {}, burst() {},
      pocket(at, main) { reactions.push({ at, main }); } },
  });
  arcade.state.totals[0] = 250; arcade.state.streaks[0] = 2;
  arcade.begin('cue', 0, { x: 0, y: 0 });
  arcade.hit(0, 8, { x: 0, y: 0, vx: 10, vy: 0 }, { x: 2, y: 0, vx: 0, vy: 0 });
  return { arcade, reactions, pockets };
}

for (const [name, match, order, copy] of [
  ['scratch before an early 8', { ...newMatch(), breaking: false }, [0, 8], ['SCRATCH', 'TOO SOON!']],
  ['early 8 before a scratch', { ...newMatch(), breaking: false }, [8, 0], ['TOO SOON!', 'SCRATCH']],
  ['scratch before a called 8', { ...newMatch(), breaking: false, groups: ['solids', 'stripes'], down: [1, 2, 3, 4, 5, 6, 7] }, [0, 8], ['SCRATCH', 'RACK LOST']],
  ['scratch before the break 8', newMatch(), [0, 8], ['SCRATCH', 'BACK YOU GO!']],
]) {
  test(`${name} reacts at both pockets and commits one failed shot`, () => {
    const { arcade, reactions, pockets } = controller(match);
    for (const number of order) arcade.pocket(number, number === 0 ? 0 : 2, pockets[number === 0 ? 0 : 2]);
    assert.deepEqual(reactions.map(r => r.main), copy);
    assert.deepEqual(reactions.map(r => r.at), order.map(n => pockets[n === 0 ? 0 : 2]));
    const report = arcade.active.report;
    arcade.finish(report, resolveShot(match, report));
    assert.equal(reactions.length, 2, 'settlement does not replay a pocket reaction');
    assert.deepEqual(arcade.state.totals, [250, 0]);
    assert.equal(arcade.state.streaks[0], 0);
    assert.equal(arcade.state.lastPlay, 1);
    assert.equal(arcade.state.last.fault, 'scratch');
  });
}

test('online rack identity animates fresh racks once, including older stored rooms', () => {
  const previous = { ...newMatch(), shots: 8, breaking: false };
  const arcade = Object.create(PoolArcade.prototype);
  Object.assign(arcade, { state: null, onlineRack: null, active: null, pending: null,
    context: () => ({ mode: 'online', match: previous, seat: 0 }),
    effects: { clear() {} }, hud: { record() {} } });
  const snapshot = { match: newMatch(), arcade: newArcade(1), balls: [] };
  assert.equal(arcade.syncOnline(snapshot), true, 'a legacy room receives its first fresh rack');
  assert.equal(arcade.syncOnline(snapshot), false, 'a repeated snapshot does not replay the rack');
  assert.equal(arcade.syncOnline({ ...snapshot, arcade: newArcade(2) }), true);
  assert.equal(arcade.syncOnline({ ...snapshot, arcade: newArcade(2) }), false);
});
