import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcadeEvents, EVENT as E, readArcadeEvidence } from './arcade-events.js';
import { newArcade, scoreArcade } from './arcade-score.js';
import { newMatch, shotRecord, resolveShot } from './eight-ball.js';
import { P } from '../physics/constants.js';

function play(events, extra = {}) {
  const tracker = new ArcadeEvents(); tracker.add(E.launch, 0, 0);
  for (const e of events) tracker.add(...e);
  const shot = { ...shotRecord(0), first: tracker.first, pocketed: [...tracker.pots].map(([number, p]) => ({ number, pocket: p.pocket })), ...extra };
  const before = { ...newMatch(), breaking: false }, state = newArcade();
  const receipt = scoreArcade({ state, before, shot, evidence: tracker.evidence(), result: resolveShot(before, shot) });
  assert.deepEqual(readArcadeEvidence(tracker.report(), shot, new Set(Array.from({ length: 16 }, (_, i) => i))), tracker.evidence());
  return receipt;
}
test('kick and combination tiers pay their highest tier once, and stack', () => {
  const r = play([[E.rail, 10, 0, 0], [E.rail, 20, 0, 1], [E.rail, 30, 0, 2], [E.hit, 40, 0, 1],
    [E.hit, 50, 1, 2], [E.hit, 60, 2, 3], [E.pot, 80, 3, 0]]);
  assert.equal(r.total, 850);
  assert.deepEqual(r.awards.map(a => [a.kind, a.base]), [['pot', 100], ['combo', 350], ['kick', 400]]);
  assert.equal(play([[E.rail, 10, 0, 0], [E.rail, 20, 0, 1], [E.hit, 40, 0, 1], [E.pot, 80, 1, 0]]).total, 400);
});
test('long thin bank scores 425 and rejects measurements below either threshold', () => {
  const long = Math.ceil(Math.hypot(P.HW, P.HH) * 100);
  assert.equal(play([[E.hit, 10, 0, 1], [E.cut, 10, 1, 6000], [E.rail, 30, 1, 0], [E.travel, 80, 1, long], [E.pot, 80, 1, 0]]).total, 425);
  assert.equal(play([[E.hit, 10, 0, 1], [E.cut, 10, 1, 5999], [E.travel, 80, 1, long - 1], [E.pot, 80, 1, 0]]).total, 100);
});
test('carom requires measured deflection and discards earlier banks and thin cuts', () => {
  const prefix = [[E.hit, 10, 0, 1], [E.cut, 10, 1, 6000], [E.rail, 30, 1, 0], [E.hit, 50, 1, 2]];
  assert.equal(play([...prefix, [E.pot, 80, 1, 0]]).total, 100);
  assert.equal(play([...prefix, [E.deflect, 50, 1, 2], [E.pot, 80, 1, 0]]).total, 300);
  assert.equal(play([...prefix, [E.deflect, 50, 1, 2], [E.rail, 65, 1, 1], [E.pot, 80, 1, 0]]).total, 450);
});
test('double kisses require separated repeat contacts and replace the carom bonus', () => {
  const prefix = [[E.hit, 10, 0, 1], [E.hit, 30, 1, 2], [E.deflect, 30, 1, 2]];
  assert.equal(play([...prefix, [E.ambiguous, 60, 1, 2], [E.deflect, 60, 1, 2], [E.pot, 80, 1, 0]]).total, 400);
  assert.equal(play([...prefix, [E.ambiguous, 31, 1, 2], [E.deflect, 31, 1, 2], [E.pot, 80, 1, 0]]).total, 300);
  assert.equal(play([...prefix, [E.ambiguous, 60, 1, 3], [E.pot, 80, 1, 0]]).total, 100);
});
test('a cue/object double kiss can redirect the scoring object without inventing a combination', () => {
  const r = play([[E.hit, 10, 0, 1], [E.ambiguous, 60, 0, 1], [E.deflect, 60, 1, 0], [E.pot, 80, 1, 0]]);
  assert.deepEqual(r.awards.map(a => a.kind), ['pot', 'double']); assert.equal(r.total, 400);
});
test('all new bonuses are voided by a late scratch', () => {
  const r = play([[E.hit, 10, 0, 1], [E.cut, 10, 1, 6000], [E.travel, 80, 1, 8000], [E.pot, 80, 1, 0], [E.pot, 100, 0, 1]]);
  assert.equal(r.total, 0); assert.equal(r.fault, 'scratch');
});
test('measured contacts reject incidental direction changes and replay the same evidence', () => {
  const t = new ArcadeEvents(); t.add(E.launch, 0, 0);
  t.hit(10, 0, 1, { x: 0, y: 0, vx: 5, vy: 10 }, { x: 2.2, y: 0, vx: 0, vy: 0 }, { x: 0, y: 10 }, { x: 5, y: 0 });
  t.sample(1, { x: 2.2, y: 0 }); t.sample(1, { x: 60, y: 0 }); t.pot(80, 1, 0);
  assert.equal(t.evidence().get(1).thin, true); assert.equal(t.evidence().get(1).long, true);
  const shot = { ...shotRecord(), first: 1, pocketed: [{ number: 1, pocket: 0 }] };
  assert.deepEqual(readArcadeEvidence(t.report(), shot, new Set([0, 1])), t.evidence());
});
test('old traces still replay, and new metrics must belong to their contact', () => {
  const t = new ArcadeEvents(); t.add(E.launch, 0, 0); t.add(E.hit, 10, 0, 1); t.add(E.pot, 80, 1, 0);
  const shot = { ...shotRecord(), first: 1, pocketed: [{ number: 1, pocket: 0 }] }, present = new Set([0, 1]);
  assert.deepEqual(readArcadeEvidence({ ...t.report(), version: 1 }, shot, present), t.evidence());
  for (const metric of [[E.cut, 11, 1, 6000], [E.cut, 10, 1, 9001], [E.deflect, 10, 1, 2], [E.travel, 10, 1, -1]]) {
    const report = t.report(); report.events = [...report.events.slice(0, 2), metric, report.events[2]];
    assert.throws(() => readArcadeEvidence(report, shot, present), /Invalid arcade/);
  }
});
