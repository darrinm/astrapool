import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { newMatch } from '../src/eight-ball.js';
import { newArcade, scoreArcade } from '../src/arcade-score.js';
import { readArcadeEvidence } from '../src/arcade-events.js';
import { trickyComputerShot, trickyValue, earnsTrick, trickyFinalists, chooseTrickyFinalist, trickyContinuations } from '../src/tricky-computer.js';
import { trickShotFamilies } from '../src/trick-shots.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
import { endgameLayouts } from './computer-benchmark.js';
import { canPlace } from '../src/table-state.js';
import { variation } from '../src/hard-computer.js';

await RAPIER.init();
const state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'], down: [4, 5, 6, 7, 12, 13, 14, 15] };
test('Tricky searches multiple families, earns tricks, and predicts the exact settled receipt without mutating inputs', () => {
  const balls = endgameLayouts(1234, 2)[1], table = practiceTable(balls), arcade = newArcade(); arcade.streaks[1] = 3;
  const previous = structuredClone({ balls, table, arcade, state }); let previews = 0;
  const shot = trickyComputerShot(balls, state, table, p => { previews++; assert.ok(p.paths.length > 2); }, arcade, { maxMs: Infinity, maxSimulations: 160 });
  const result = simulateShot(table, state, shot, false, { arcade: true });
  const receipt = scoreArcade({ state: arcade, before: state, shot: result.report, result, evidence: result.evidence });
  assert.ok(previews); assert.ok(shot.evaluated <= 160); assert.ok(shot.search.families.includes('Two-rail bank')); assert.ok(shot.search.families.includes('Kick'));
  assert.ok(receipt.total > 300); assert.equal(receipt.fault, null); assert.equal(receipt.total, shot.expected.points);
  assert.deepEqual(receipt.awards, shot.expected.awards); assert.deepEqual(result.report.pocketed, shot.expected.pocketed);
  assert.deepEqual(readArcadeEvidence(result.arcade, result.report, new Set(balls.map(b => b.number))), result.evidence);
  assert.deepEqual({ balls, table, arcade, state }, previous);
});
test('solo Tricky selects a trick that independently survives both aim and power margin checks', () => {
  const balls = endgameLayouts(2026, 3)[2], table = practiceTable(balls), arcade = newArcade();
  const before = { ...newMatch(), breaking: false,
    down: Array.from({ length: 15 }, (_, i) => i + 1).filter(n => !balls.some(b => b.number === n)) };
  const shot = trickyComputerShot(balls, before, table, undefined, arcade, { solo: true, maxMs: Infinity, maxSimulations: 160 });
  assert.equal(shot.search.selection, 'reliable-trick');
  assert.equal(shot.search.trickSamples, 3);
  assert.ok(shot.search.continuationFamilies.some(family => family !== 'Direct pot'));
  for (const [angle, power] of [[0, 1], [-0.0007, 0.985], [0.0007, 1.015]]) {
    const result = simulateShot(table, before, variation(shot, angle, power), false, { arcade: true, solo: true });
    const receipt = scoreArcade({ state: arcade, before, shot: result.report, result, evidence: result.evidence });
    assert.equal(earnsTrick(result, receipt), true);
  }
});
test('combination generators reserve two- and three-ball routes with intermediate preview targets', () => {
  const balls = [{ number: 0, x: -20, y: 0 }, { number: 1, x: 0, y: 0 }, { number: 2, x: 10, y: 5 }, { number: 3, x: 20, y: 10 }];
  const families = trickShotFamilies(balls, [1, 2, 3]);
  const combo = families.find(f => f.name === 'Combination').shots;
  const three = families.find(f => f.name === 'Three-ball combination').shots;
  assert.ok(combo.length); assert.ok(three.length); assert.equal(three[0].traceTargets.length, 3);
});
test('a depleted time budget still returns a legal ball-in-hand plan', () => {
  const balls = endgameLayouts(1234, 1)[0]; balls[0] = { number: 0, x: 0, y: 0 };
  const shot = trickyComputerShot(balls, { ...state, ballInHand: true }, undefined, undefined, newArcade(), { maxMs: 0, maxSimulations: 1 });
  assert.ok(canPlace(shot.position, balls)); assert.equal(shot.evaluated, 1); assert.ok(Number.isFinite(shot.speed));
});
test('arcade simulation preserves physics outcomes, resolves solo targets and replays the new evidence', () => {
  const balls = [{ number: 0, x: -10, y: 0 }, { number: 1, x: 0, y: 0 }, { number: 9, x: 25, y: 0 }];
  const table = practiceTable(balls), before = { ...newMatch(), breaking: false };
  const shot = { dir: { x: 0.94, y: 0.341174442 }, speed: 85, target: 1, pocket: 2 };
  const original = simulateShot(table, before, shot), scored = simulateShot(table, before, shot, false, { arcade: true, solo: true });
  assert.deepEqual(scored.report, original.report); assert.deepEqual(scored.balls, original.balls);
  assert.equal(scored.state.turn, 0); assert.deepEqual(scored.state.groups, [null, null]);
  assert.deepEqual(readArcadeEvidence(scored.arcade, scored.report, new Set([0, 1, 9])), scored.evidence);
});
test('the objective prefers earned points and rejects a foul even with rich provisional awards', () => {
  const arcade = newArcade(); arcade.streaks[0] = 3;
  const result = { settled: true, state: { winner: null } };
  assert.ok(trickyValue(result, { player: 0, total: 750, count: 1 }, arcade) > trickyValue(result, { player: 0, total: 300, count: 1 }, arcade));
  assert.ok(trickyValue(result, { player: 0, total: 0, count: 2, fault: 'scratch' }, arcade) < trickyValue(result, { player: 0, total: 0, count: 0 }, arcade));
});

function candidate(points, kinds = ['pot'], overrides = {}) {
  const entry = { score: points, result: { settled: true, state: { winner: null } },
    shot: { family: 'Direct pot' }, receipt: { player: 0, total: points, fault: null, awards: kinds.map(kind => ({ kind })) },
    samples: 3, successes: 3, safe: 3 };
  entry.tricks = earnsTrick(entry.result, entry.receipt) ? 3 : 0;
  return Object.assign(entry, overrides);
}
test('a reliable trick beats a higher-point direct shot, then points rank the reliable tricks', () => {
  const direct = candidate(1500, ['pot', 'thin', 'long', 'multi']), bank = candidate(250, ['pot', 'bank']), kick = candidate(300, ['pot', 'kick']);
  assert.equal(chooseTrickyFinalist([direct, bank]).best, bank);
  const selection = chooseTrickyFinalist([direct, bank, kick]);
  assert.equal(selection.best, kick); assert.equal(selection.selection, 'reliable-trick');
});
test('a reliable pot beats fragile or dangerous tricks, including high-point lookahead', () => {
  const direct = candidate(100), missed = candidate(4000, ['pot', 'bank'], { successes: 2, tricks: 2 });
  const scratch = candidate(5000, ['pot', 'combo'], { successes: 2, safe: 2, tricks: 2 });
  const selection = chooseTrickyFinalist([missed, scratch, direct]);
  assert.equal(selection.best, direct); assert.equal(selection.selection, 'reliable-pot');
});
test('a nominal trick must survive both margin checks to get the personality preference', () => {
  const direct = candidate(300), untested = candidate(250, ['pot', 'bank'], { samples: 1, successes: 1, safe: 1, tricks: 1 });
  const partial = candidate(250, ['pot', 'kick'], { samples: 2, successes: 2, safe: 2, tricks: 2 });
  const losesTrick = candidate(250, ['pot', 'combo'], { tricks: 2 });
  for (const entry of [untested, partial, losesTrick]) assert.equal(chooseTrickyFinalist([entry, direct]).best, direct);
});
test('shortlists retain a low-point trick and a direct fallback even under point-heavy competition', () => {
  const plain = [1000, 900, 800, 700].map(points => candidate(points));
  const trick = candidate(250, ['pot', 'bank']);
  let shortlist = trickyFinalists([...plain, trick]);
  assert.equal(shortlist.length, 4); assert.ok(shortlist.includes(trick)); assert.ok(shortlist.includes(plain[0]));
  shortlist = trickyFinalists([...plain, ...[1000, 900, 800, 700].map(points => candidate(points, ['pot', 'kick']))]);
  assert.equal(shortlist.length, 4); assert.ok(shortlist.includes(plain[0]));
});
test('tricks require settled, legal contact evidence, never a proposal label or straight-shot bonus', () => {
  for (const kind of ['bank', 'kick', 'combo', 'carom', 'double']) {
    const e = candidate(250, ['pot', kind]); assert.equal(earnsTrick(e.result, e.receipt), true);
    assert.equal(earnsTrick({ ...e.result, settled: false }, e.receipt), false);
    assert.equal(earnsTrick({ ...e.result, state: { winner: 1 } }, e.receipt), false);
    assert.equal(earnsTrick(e.result, { ...e.receipt, fault: 'scratch' }), false);
  }
  const e = candidate(1000, ['pot', 'long', 'thin', 'multi', 'finish']); e.shot.family = 'Bank';
  assert.equal(earnsTrick(e.result, e.receipt), false);
});
test('high-scoring variations of one trick cannot crowd different trick families out of margin checks', () => {
  const banks = [1000, 950, 900, 850].map(points => candidate(points, ['pot', 'bank']));
  const kick = candidate(300, ['pot', 'kick']), combo = candidate(350, ['pot', 'combo']), direct = candidate(100);
  const shortlist = trickyFinalists([...banks, kick, combo, direct]);
  assert.deepEqual(new Set(shortlist), new Set([banks[0], kick, combo, direct]));
});
test('lookahead contains several distinct trick proposals and a direct-pot fallback', () => {
  const balls = [{ number: 0, x: -20, y: 0 }, { number: 1, x: 0, y: 0 }, { number: 2, x: 10, y: 5 }, { number: 3, x: 20, y: 10 }];
  const options = trickyContinuations(balls, { ...newMatch(), breaking: false });
  assert.ok(options.length <= 4); assert.ok(options.some(s => s.family === 'Direct pot'));
  assert.ok(new Set(options.filter(s => s.family !== 'Direct pot').map(s => s.family)).size >= 2);
});
