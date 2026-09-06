import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import layouts from './hard-layouts.json' with { type: 'json' };
import { hardComputerShot } from '../src/hard-computer.js';
import { computerShot } from '../src/computer.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
import { canPlace } from '../src/table-state.js';
import { newMatch } from '../src/eight-ball.js';
await RAPIER.init();
for (const [i, { balls, state }] of layouts.entries()) test(`Hard avoids the old player's ${i === 0 ? 'wrong first contact' : 'scratch'} on layout ${i + 1}`, () => {
  const table = practiceTable(balls), before = table.snapshot.slice();
  const old = simulateShot(table, state, computerShot(balls, state, 'hard', () => 0.5));
  assert.ok(old.state.ballInHand);
  const shot = hardComputerShot(balls, state, table), result = simulateShot(table, state, shot);
  assert.equal(result.settled, true); assert.equal(result.state.ballInHand, false); assert.equal(result.rerack, false);
  assert.equal(result.state.winner, null);
  assert.ok(shot.speed > 0 && shot.speed <= 24 * 0.44704 / 0.026);
  assert.ok(Math.abs(Math.hypot(shot.dir.x, shot.dir.y) - 1) < 1e-10);
  assert.ok(Math.hypot(shot.spin.x, shot.spin.y) <= 0.7);
  if (i > 0) { assert.ok(result.report.pocketed.some(p => p.number === shot.target)); assert.equal(result.state.turn, state.turn); }
  assert.deepEqual(table.snapshot, before, 'thinking must not mutate the real table snapshot');
});

test('Hard legally places ball-in-hand and calls/pots the winning 8', () => {
  const balls = [{ number: 0, x: 25, y: -10 }, { number: 8, x: 7, y: 4 }, { number: 9, x: -10, y: 0 }];
  const state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'], down: [1, 2, 3, 4, 5, 6, 7], ballInHand: true };
  const shot = hardComputerShot(balls, state);
  assert.ok(shot.position && canPlace(shot.position, balls));
  const result = simulateShot(practiceTable(balls), state, shot);
  assert.equal(result.state.winner, 1); assert.equal(result.report.pocketed.find(p => p.number === 8).pocket, shot.pocket);
});

test('Hard runs three balls and the called 8 without a foul', () => {
  let balls = [{ number: 0, x: 25, y: -10 }, { number: 1, x: -23, y: 8 }, { number: 2, x: 4, y: 6 }, { number: 3, x: -10, y: -7 }, { number: 8, x: 26, y: 10 }, { number: 9, x: -20, y: -11 }];
  let state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'], down: [4, 5, 6, 7] };
  for (let i = 0; i < 4 && state.winner === null; i++) {
    const shot = hardComputerShot(balls, state), result = simulateShot(practiceTable(balls), state, shot);
    assert.equal(result.state.ballInHand, false); assert.equal(result.state.turn, 1);
    balls = result.balls; state = result.state;
  }
  assert.equal(state.winner, 1);
});
