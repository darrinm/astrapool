import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { newMatch } from '../src/eight-ball.js';
import { newArcade, scoreArcade } from '../src/arcade-score.js';
import { readArcadeEvidence } from '../src/arcade-events.js';
import { trickyComputerShot, trickyValue } from '../src/tricky-computer.js';
import { trickShotFamilies } from '../src/trick-shots.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
import { endgameLayouts } from './computer-benchmark.js';
import { canPlace } from '../src/table-state.js';

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
