import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSnapshot, validateShot, placeCue, finishShot, MAX_SPEED } from './protocol.js';
import { shotRecord } from '../src/eight-ball.js';
const action = { dir: { x: 1, y: 0 }, speed: 100, spin: { x: 0, y: 0 }, calledPocket: null };
test('server validates finite shot parameters and the physical limits', () => {
  const snapshot = initialSnapshot(); assert.deepEqual(validateShot(snapshot, action), action);
  for (const bad of [{ speed: NaN }, { speed: MAX_SPEED + 1 }, { dir: { x: 2, y: 0 } }, { spin: { x: 1, y: 0 } }, { calledPocket: 9 }]) assert.throws(() => validateShot(snapshot, { ...action, ...bad }));
});
test('ball-in-hand requires a clear position and cannot be bypassed by shooting', () => {
  const snapshot = initialSnapshot(); snapshot.match.ballInHand = true;
  assert.throws(() => validateShot(snapshot, action));
  assert.throws(() => placeCue(snapshot, { x: 19.5, y: 0 }));
  assert.throws(() => placeCue(snapshot, { x: 40, y: 0 }));
  const placed = placeCue(snapshot, { x: -10, y: 4 });
  assert.equal(placed.match.ballInHand, false); assert.equal(placed.balls.find(b => b.number === 0).x, -10);
});
test('server computes turns from the report and rejects missing or duplicate balls', () => {
  const snapshot = initialSnapshot(), report = { ...shotRecord(), first: 1, rails: [1, 2, 3, 4] };
  const result = finishShot(snapshot, { action }, report, snapshot.balls);
  assert.equal(result.match.turn, 1); assert.equal(result.match.breaking, false);
  assert.throws(() => finishShot(snapshot, { action }, report, snapshot.balls.slice(1)));
  assert.throws(() => finishShot(snapshot, { action }, report, snapshot.balls.map(() => snapshot.balls[0])));
  assert.throws(() => finishShot(snapshot, { action }, { ...report, pocketed: [{ number: 2, pocket: 1 }], offTable: [2] }, snapshot.balls));
});
test('server uses the pocket called before the shot, not an altered result report', () => {
  const snapshot = initialSnapshot(); snapshot.match = { ...snapshot.match, breaking: false, groups: ['solids', 'stripes'], down: [1, 2, 3, 4, 5, 6, 7] };
  snapshot.balls = snapshot.balls.filter(b => !snapshot.match.down.includes(b.number));
  const report = { ...shotRecord(2), first: 8, pocketed: [{ number: 8, pocket: 2 }] };
  const result = finishShot(snapshot, { action: { ...action, calledPocket: 0 } }, report, snapshot.balls.filter(b => b.number !== 8));
  assert.equal(result.match.winner, 1);
});
test('illegal break returns a fresh rack without trusting reported positions', () => {
  const snapshot = initialSnapshot();
  const result = finishShot(snapshot, { action }, shotRecord(), []);
  assert.equal(result.match.breaker, 1); assert.equal(result.balls.length, 16);
});

for (const malformed of [undefined, null, false, 1, 'shot', []]) test(`malformed shot ${JSON.stringify(malformed)} has a validation error`, () => {
  assert.throws(() => validateShot(initialSnapshot(), malformed), { name: 'Error', message: 'Invalid shot.' });
});
for (const malformed of [null, false, 1, 'ball', []]) test(`malformed ball ${JSON.stringify(malformed)} has a validation error`, () => {
  const snapshot = initialSnapshot(), report = { ...shotRecord(), first: 1, rails: [1, 2, 3, 4] };
  assert.throws(() => finishShot(snapshot, { action }, { ...report, pocketed: [malformed] }, snapshot.balls), { name: 'Error', message: 'Invalid pocket report.' });
  assert.throws(() => finishShot(snapshot, { action }, report, [malformed, ...snapshot.balls.slice(1)]), { name: 'Error', message: 'Invalid final table.' });
});
