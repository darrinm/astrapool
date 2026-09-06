import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, resolveShot, shotRecord, targets } from '../src/eight-ball.js';
const play = (state, values) => resolveShot(state, { ...shotRecord(), first: 1, rails: [1], ...values });
const open = () => ({ ...newMatch(), breaking: false });
const assigned = () => ({ ...open(), groups: ['solids', 'stripes'] });
const pot = (number, pocket = 0) => ({ number, pocket });
test('legal dry break passes the turn and leaves the table open', () => {
  const { state } = play(newMatch(), { rails: [1, 2, 3, 4] });
  assert.equal(state.turn, 1); assert.deepEqual(state.groups, [null, null]); assert.equal(state.ballInHand, false);
});
test('break pot keeps turn without assigning groups', () => {
  const { state } = play(newMatch(), { pocketed: [pot(2)] });
  assert.equal(state.turn, 0); assert.deepEqual(state.groups, [null, null]);
});
test('illegal break gives the opponent a fresh rack; duplicate rails do not count', () => {
  const result = play(newMatch(), { rails: [1, 1, 2, 0] });
  assert.equal(result.rerack, true); assert.equal(result.state.turn, 1); assert.equal(result.state.breaking, true);
});
test('eight on break is spotted, including with a scratch', () => {
  const result = play(newMatch(), { pocketed: [pot(8), pot(0)] });
  assert.deepEqual(result.respot, [8]); assert.equal(result.state.winner, null);
  assert.equal(result.state.ballInHand, true); assert.equal(result.state.turn, 1); assert.deepEqual(result.state.down, []);
});
test('first legal single-group pot assigns groups', () => {
  const { state } = play(open(), { first: 12, pocketed: [pot(3)] });
  assert.deepEqual(state.groups, ['solids', 'stripes']); assert.equal(state.turn, 0);
});
test('mixed pots leave the table open', () => {
  assert.deepEqual(play(open(), { pocketed: [pot(3), pot(12)] }).state.groups, [null, null]);
});
test('a foul never assigns a group; potted balls stay down', () => {
  const { state } = play(open(), { pocketed: [pot(3), pot(0)] });
  assert.deepEqual(state.groups, [null, null]); assert.deepEqual(state.down, [3]); assert.equal(state.ballInHand, true);
});
for (const [name, values] of Object.entries({
  'no contact': { first: null }, 'wrong group': { first: 9 }, '8 first': { first: 8 },
  'no rail after contact': { rails: [] }, 'scratch': { pocketed: [pot(0)] }, 'off table': { offTable: [2] },
})) test(`${name} is a foul with ball in hand`, () => {
  const { state } = play(assigned(), values);
  assert.equal(state.turn, 1); assert.equal(state.ballInHand, true); assert.equal(state.winner, null);
});
test('own pot continues, opponent-only pot passes without a foul', () => {
  assert.equal(play(assigned(), { pocketed: [pot(3)] }).state.turn, 0);
  const { state } = play(assigned(), { pocketed: [pot(12)] });
  assert.equal(state.turn, 1); assert.equal(state.ballInHand, false);
});
test('8 cannot be struck first on an open table', () => {
  assert.equal(play(open(), { first: 8 }).state.ballInHand, true);
});
test('early 8 loses even when last group ball goes down on the same shot', () => {
  const state = { ...assigned(), down: [1, 2, 3, 4, 5, 6] };
  assert.equal(play(state, { first: 7, pocketed: [pot(7), pot(8)], calledPocket: 0 }).state.winner, 1);
});
test('legal called 8 wins and increments the score exactly once', () => {
  const state = { ...assigned(), down: [1, 2, 3, 4, 5, 6, 7] };
  assert.deepEqual(targets(state), [8]);
  const result = play(state, { first: 8, pocketed: [pot(8, 2)], calledPocket: 2 }).state;
  assert.equal(result.winner, 0); assert.deepEqual(result.wins, [1, 0]);
  assert.deepEqual(play(result, {}).state.wins, [1, 0]);
});
for (const [name, values] of Object.entries({
  'scratch on 8': { pocketed: [pot(8), pot(0)], calledPocket: 0 },
  'wrong pocket': { pocketed: [pot(8, 2)], calledPocket: 0 },
  'no call': { pocketed: [pot(8)] }, '8 off table': { offTable: [8] },
})) test(`${name} loses the rack`, () => {
  const state = { ...assigned(), down: [1, 2, 3, 4, 5, 6, 7] };
  assert.equal(play(state, { first: 8, ...values }).state.winner, 1);
});
test('rematch preserves match score and alternates the breaker', () => {
  const state = newMatch(1, [2, 3]);
  assert.equal(state.turn, 1); assert.deepEqual(state.wins, [2, 3]); assert.deepEqual(state.down, []);
});
