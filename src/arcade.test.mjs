import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArcadeEvents, EVENT as E, MAX_ARCADE_EVENTS, collisionDirection, readArcadeEvidence } from './arcade-events.js';
import { newArcade, scoreArcade, commitArcade, arcadeSummary } from './arcade-score.js';
import { newMatch, shotRecord, resolveShot } from './eight-ball.js';

const before = () => ({ ...newMatch(), breaking: false, groups: ['solids', 'stripes'] });
const shot = (pots = [], extra = {}) => ({ ...shotRecord(), first: 1, pocketed: pots.map(([number, pocket]) => ({ number, pocket })), ...extra });
function trace(entries, launched = 0) {
  const t = new ArcadeEvents(); t.add(E.launch, 0, launched);
  for (const event of entries) t.add(...event);
  return t;
}
const scored = (report, tracker, options = {}) => {
  const b = options.before || before();
  return scoreArcade({ state: newArcade(), before: b, shot: report, evidence: tracker?.evidence(), result: options.free ? null : resolveShot(b, report), ...options });
};

test('bank plus double pot at ×2 produces 1,100, with displayed parts summing exactly', () => {
  const t = trace([[E.hit, 1, 0, 1], [E.rail, 20, 1, 0], [E.pot, 40, 1, 0], [E.hit, 50, 0, 2], [E.pot, 70, 2, 3]]);
  const state = newArcade(); state.streaks[0] = 2;
  const r = scored(shot([[1, 0], [2, 3]]), t, { state });
  assert.equal(r.total, 1100); assert.equal(r.awards.reduce((n, a) => n + a.points, 0), r.total);
  assert.match(arcadeSummary(r), /Bank 150/);
});
test('only rails before the cue first hits an object earn a kick', () => {
  const kick = trace([[E.rail, 10, 0, 0], [E.hit, 20, 0, 1], [E.pot, 40, 1, 0]]);
  const after = trace([[E.hit, 10, 0, 1], [E.rail, 20, 0, 0], [E.pot, 40, 1, 0]]);
  assert.equal(scored(shot([[1, 0]]), kick).total, 300);
  assert.equal(scored(shot([[1, 0]]), after).total, 100);
});
test('a kick propagates down a combination chain and is awarded once', () => {
  const t = trace([[E.rail, 10, 0, 0], [E.hit, 20, 0, 1], [E.hit, 30, 1, 2], [E.pot, 50, 2, 0]]);
  const r = scored(shot([[2, 0]]), t);
  assert.equal(r.total, 500); assert.deepEqual(r.awards.map(a => a.kind), ['pot', 'combo', 'kick']);
});
test('unrelated collisions and rails do not turn an ordinary pot into a trick shot', () => {
  const t = trace([[E.hit, 1, 0, 1], [E.rail, 10, 7, 0], [E.hit, 20, 5, 6], [E.pot, 30, 1, 0]]);
  assert.equal(scored(shot([[1, 0]]), t).total, 100);
});
test('bank bonuses cap at three rails and reject contact chatter', () => {
  const t = trace([[E.hit, 1, 0, 1], [E.rail, 10, 1, 0], [E.rail, 11, 1, 1], [E.rail, 20, 1, 0],
    [E.rail, 30, 1, 1], [E.rail, 50, 1, 2], [E.rail, 70, 1, 3], [E.pot, 100, 1, 0]]);
  assert.equal(scored(shot([[1, 0]]), t).total, 400);
});
test('a later object deflection invalidates an earlier bank route', () => {
  const t = trace([[E.hit, 1, 0, 1], [E.rail, 10, 1, 0], [E.hit, 30, 1, 2], [E.pot, 50, 1, 0]]);
  assert.equal(scored(shot([[1, 0]]), t).total, 100);
});
test('incoming velocities distinguish a stationary target from an ambiguous moving contact', () => {
  const a = { x: 0, y: 0, vx: 10, vy: 0 }, b = { x: 2, y: 0, vx: 0, vy: 0 };
  assert.equal(collisionDirection(a, b), 1); assert.equal(collisionDirection(b, a), -1);
  assert.equal(collisionDirection(a, { ...b, vx: -4 }), 0);
  assert.equal(collisionDirection({ ...a, vx: -2 }, b), 0);
});
test('simultaneous moving-ball contacts do not invent combination ancestry', () => {
  const t = trace([[E.hit, 1, 0, 1], [E.ambiguous, 20, 1, 2], [E.pot, 40, 1, 0]]);
  assert.equal(scored(shot([[1, 0]]), t).total, 100);
});
test('a late scratch voids the entire provisional shot without reducing earlier totals', () => {
  const state = newArcade(); state.totals[0] = 900; state.streaks[0] = 3;
  const report = shot([[1, 0], [0, 3]]);
  const r = scored(report, null, { state }); const committed = commitArcade(state, r);
  assert.equal(r.total, 0); assert.equal(r.fault, 'scratch');
  assert.deepEqual(committed.totals, [900, 0]); assert.equal(committed.streaks[0], 0); assert.equal(state.streaks[0], 3);
});
test('wrong-group pots do not earn points or advance a streak', () => {
  const r = scored(shot([[9, 0]], { rails: [1] }));
  assert.equal(r.total, 0); assert.equal(r.count, 0); assert.equal(r.fault, null);
});
test('open table and break pots can score either group, but the break 8 is respotted without points', () => {
  const b = newMatch();
  assert.equal(scored(shot([[1, 0], [9, 3], [8, 1]]), null, { before: b }).total, 400);
  assert.equal(scored(shot([[8, 0]]), null, { before: b }).fault, null);
});
test('early 8, wrong pocket, and scratch with the 8 void points with the right reason', () => {
  assert.equal(scored(shot([[8, 0]])).fault, 'early');
  const b = { ...before(), down: [1, 2, 3, 4, 5, 6, 7] };
  assert.equal(scored(shot([[8, 0]], { first: 8, calledPocket: 1 }), null, { before: b }).fault, 'wrong');
  assert.equal(scored(shot([[8, 0], [0, 1]], { first: 8, calledPocket: 0 }), null, { before: b }).fault, 'scratch');
});
test('a legal winning 8 earns 600, while an awarded win earns no finish points', () => {
  const b = { ...before(), down: [1, 2, 3, 4, 5, 6, 7] };
  assert.equal(scored(shot([[8, 0]], { first: 8, calledPocket: 0 }), null, { before: b }).total, 600);
  const r = scored(shot([[8, 0]])); assert.equal(r.total, 0); assert.equal(commitArcade(newArcade(), r).totals[1], 0);
});
test('misses and no-rail fouls resolve at settlement rather than invalidating live previews', () => {
  const report = shot([]);
  assert.equal(scoreArcade({ state: newArcade(), before: before(), shot: report }).fault, null);
  assert.equal(scored(report).fault, 'foul');
  assert.equal(scored(shot([], { rails: [1] })).fault, null);
});
test('per-player streaks progress to ×3 and reset after a miss', () => {
  let state = newArcade(); const multipliers = [];
  for (let i = 0; i < 5; i++) { const r = scored(shot([[1, 0]]), null, { state }); multipliers.push(r.multiplier); state = commitArcade(state, r); }
  assert.deepEqual(multipliers, [1, 1.5, 2, 3, 3]); assert.equal(state.streaks[1], 0);
  state = commitArcade(state, scored(shot([], { rails: [1] }), null, { state })); assert.equal(state.streaks[0], 0);
});
test('duplicate pots and stale or duplicated receipts cannot add points', () => {
  const state = newArcade(), r = scored(shot([[1, 0], [1, 0]]));
  assert.equal(r.count, 1); const next = commitArcade(state, r);
  assert.strictEqual(commitArcade(next, r), next);
  assert.strictEqual(commitArcade(newArcade(2), r).last, null);
});
test('Fling launches can bank, while dragging, touching or placing cannot score', () => {
  const report = shot([[1, 0]], { first: null });
  const launched = trace([[E.rail, 10, 1, 0], [E.pot, 30, 1, 0]], 1);
  assert.equal(scored(report, launched, { free: true, input: 'fling' }).total, 250);
  const touched = trace([[E.touch, 10, 1, 0], [E.pot, 30, 1, 0]], 1);
  assert.equal(scored(report, touched, { free: true, input: 'fling' }).total, 0);
  const pushed = trace([[E.hit, 10, 2, 1], [E.pot, 30, 1, 0]], 1);
  assert.equal(scored(report, pushed, { free: true, input: 'fling' }).total, 0);
});
test('additional flings share one play, and a Free Play 8 is an ordinary pot', () => {
  const t = trace([[E.pot, 10, 1, 0], [E.launch, 20, 8, 0], [E.pot, 30, 8, 3]], 1);
  const r = scored(shot([[1, 0], [8, 3]]), t, { free: true, input: 'fling' });
  assert.equal(r.total, 400); assert.equal(r.fault, null);
});
test('a scratch in Free Play voids the play, and repeated well contacts cannot score twice', () => {
  const t = trace([[E.hit, 1, 0, 1], [E.pot, 10, 1, 0], [E.pot, 11, 1, 0], [E.pot, 20, 0, 1]]);
  assert.equal(t.pots.size, 2);
  assert.equal(scored(shot([[1, 0], [0, 1]]), t, { free: true }).total, 0);
});
test('online replay produces exactly the browser evidence, with bounded payloads', () => {
  const t = trace([[E.hit, 1, 0, 1]]);
  for (let i = 2; i < MAX_ARCADE_EVENTS - 1; i++) t.add(E.rail, i * 20, 1, i % 6);
  t.add(E.pot, 6000, 1, 0);
  const report = shot([[1, 0]]), replay = readArcadeEvidence(t.report(), report, new Set([0, 1]));
  assert.deepEqual(replay, t.evidence());
  assert.ok(JSON.stringify({ report: { ...report, arcade: t.report() }, balls: Array.from({ length: 16 }, (_, number) => ({ number, x: -38.123456789012345, y: 18.123456789012345 })) }).length < 12000);
});
test('overflow disables advanced bonuses on both peers instead of sending a partial route', () => {
  const t = trace([[E.hit, 1, 0, 1]]);
  for (let i = 0; i < MAX_ARCADE_EVENTS; i++) t.add(E.rail, 10 + i * 20, 1, i % 6);
  t.add(E.pot, 6000, 1, 0);
  assert.equal(t.report().events.length, 0); assert.equal(t.overflow, true);
  const report = shot([[1, 0]]);
  assert.equal(scored(report, t).total, 100);
  assert.equal(scoreArcade({ state: newArcade(), before: before(), shot: report, evidence: readArcadeEvidence(t.report(), report, new Set([0, 1])) }).total, 100);
});
test('online validation rejects impossible ordering, wrong pots, missing first contact and manual launches', () => {
  const t = trace([[E.hit, 10, 0, 1], [E.pot, 20, 1, 0]]), report = shot([[1, 0]]), present = new Set([0, 1, 2]);
  for (const change of [r => r.events[1][1] = -1, r => r.events[2][3] = 1, r => r.events[0][2] = 1,
    r => r.events[1][2] = 9, r => r.events[1][0] = E.touch, r => r.events[2][1] = 50000,
    r => r.events.push([E.hit, 30, 1, 2]), r => r.events[1][3] = 2]) {
    const copy = structuredClone(t.report()); change(copy); assert.throws(() => readArcadeEvidence(copy, report, present), /arcade evidence/);
  }
});
