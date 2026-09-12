import test from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, resolveSoloShot, shotRecord, targets } from './eight-ball.js';

test('solo keeps both groups available and continues after pots, misses, and scratches', () => {
  let state = { ...newMatch(), breaking: false };
  for (const number of [1, 9]) {
    state = resolveSoloShot(state, { ...shotRecord(), first: number, pocketed: [{ number, pocket: 0 }] }).state;
    assert.equal(state.turn, 0);
    assert.deepEqual(state.groups, [null, null]);
    assert.ok(targets(state).includes(number === 1 ? 9 : 2));
  }
  state = resolveSoloShot(state, { ...shotRecord(), first: 2, rails: [2] }).state;
  assert.equal(state.turn, 0);
  assert.equal(state.ballInHand, false);
  state = resolveSoloShot(state, { ...shotRecord(), first: 2, pocketed: [{ number: 0, pocket: 1 }] }).state;
  assert.equal(state.turn, 0);
  assert.equal(state.ballInHand, true);
  assert.deepEqual(state.down, [1, 9]);
});

test('solo spots a break 8 and retries an illegal break with the same player', () => {
  const spotted = resolveSoloShot(newMatch(), { ...shotRecord(), first: 1, pocketed: [{ number: 8, pocket: 0 }] });
  assert.deepEqual(spotted.respot, [8]);
  assert.equal(spotted.state.winner, null);
  const retry = resolveSoloShot(newMatch(), shotRecord());
  assert.equal(retry.rerack, true);
  assert.equal(retry.state.turn, 0);
  assert.equal(retry.state.breaker, 0);
});

test('solo finishes on the called 8 after both groups, or ends on an early 8', () => {
  const state = { ...newMatch(), breaking: false, down: [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15] };
  assert.deepEqual(targets(state), [8]);
  const shot = { ...shotRecord(2), first: 8, pocketed: [{ number: 8, pocket: 2 }] };
  assert.equal(resolveSoloShot(state, shot).state.winner, 0);
  assert.notEqual(resolveSoloShot({ ...newMatch(), breaking: false }, shot).state.winner, null);
});
