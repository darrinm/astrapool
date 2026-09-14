import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { P, feltExtras, strike } from './poolphysics.js';
import { blackHoleGravity } from './black-hole-gravity.js';
import { practiceTable, simulateShot, simulateShotSteps } from '../src/shot-simulation.js';
import { rackPositions } from '../src/table-state.js';
import { newMatch } from '../src/eight-ball.js';
import { stepPhysics } from '../src/physics-step.js';
await RAPIER.init();

// Drive a separate world through the live frame/physics interface, with no
// trajectory calculations. Compare its completed shot with the displayed rings.
function play(table, shot) {
  const world = RAPIER.World.restoreSnapshot(table.snapshot), queue = new RAPIER.EventQueue(true);
  try {
    const bodies = table.handles.map(b => world.getRigidBody(b.handle));
    const cue = bodies[table.handles.findIndex(b => b.number === 0)];
    const eight = bodies[table.handles.findIndex(b => b.number === 8)];
    let still = 0, done = false;
    const scene = { step() {
      feltExtras(bodies, world.timestep, table.feltZ + P.R);
      if (table.blackHoleGravity) blackHoleGravity(bodies, eight, world.timestep, table.feltZ + P.R);
      still = bodies.every(b => { const v = b.linvel(); return Math.hypot(v.x, v.y, v.z) < 0.3; }) ? still + 1 : 0;
      if (still >= 120) { done = true; return false; }
    } };
    strike(cue, shot.dir, shot.speed, shot.spin);
    for (let i = 0; i < 480 * 24 && !done; i++) stepPhysics(scene, world, queue);
    assert.ok(done, 'live test shot must settle');
    return bodies.map((b, i) => ({ number: table.handles[i].number, ...b.translation() }));
  } finally { queue.free(); world.free(); }
}

for (const [name, balls, shot, gravity] of [
  ['soft shot stops short', [{ number: 0, x: -18, y: 0 }, { number: 1, x: 0, y: 0 }], { dir: { x: 1, y: 0 }, speed: 12 }, false],
  ['rolling cut into a full rack', rackPositions(), { dir: { x: Math.cos(.015), y: Math.sin(.015) }, speed: 38 }, false],
  ['draw after a cut', [{ number: 0, x: -18, y: 0 }, { number: 1, x: 0, y: .8 }], { dir: { x: 1, y: 0 }, speed: 35, spin: { x: .2, y: -.5 } }, false],
  ['follow and cushion rebound', [{ number: 0, x: -10, y: 4 }], { dir: { x: 1, y: 0 }, speed: 30, spin: { x: .25, y: .6 } }, false],
  ['black hole curves a soft shot', [{ number: 0, x: -18, y: 0 }, { number: 1, x: 5, y: 10 }, { number: 8, x: -5, y: 5 }], { dir: { x: 1, y: 0 }, speed: 18 }, true],
]) test(`aim endpoint matches completed live shot: ${name}`, () => {
  const table = practiceTable(balls, { blackHoleGravity: gravity });
  const before = new Uint8Array(table.snapshot);
  const preview = simulateShot(table, newMatch(), shot, true, { aimPreview: true });
  const actual = play(table, shot);
  assert.deepEqual(table.snapshot, before, 'preview must not mutate the live snapshot');
  assert.ok(preview.settled);
  for (const path of preview.paths.filter(p => p.number === 0 || p.number === preview.report.first)) {
    assert.ok(path.stopped, 'these test shots leave the tracked balls on the cloth');
    const end = path.points.at(-1), ball = actual.find(b => b.number === path.number);
    assert.ok(Math.hypot(end.x - ball.x, end.y - ball.y) < 0.01, `ball ${path.number}: ring ${JSON.stringify(end)}, actual ${JSON.stringify(ball)}`);
  }
  if (name === 'soft shot stops short') assert.equal(preview.report.first, null);
});

test('pocketed balls do not get a stopping circle on the cloth', () => {
  const table = practiceTable([{ number: 0, x: 0, y: 12 }]);
  const preview = simulateShot(table, newMatch(), { dir: { x: 0, y: 1 }, speed: 18 }, true, { aimPreview: true });
  assert.equal(preview.paths[0].stopped, false);
  assert.ok(preview.report.pocketed.some(p => p.number === 0));
});


test('yielding between physics batches preserves the exact prediction', () => {
  const table = practiceTable(rackPositions());
  const shot = { dir: { x: Math.cos(.015), y: Math.sin(.015) }, speed: 38 };
  const expected = simulateShot(table, newMatch(), shot, true, { aimPreview: true });
  const simulation = simulateShotSteps(table, newMatch(), shot, true, { aimPreview: true, yieldEvery: 64 });
  let next, batches = 0;
  do { next = simulation.next(); batches++; } while (!next.done);
  assert.ok(batches > 2);
  assert.deepEqual(next.value, expected);
});

test('shorter look ahead performs fewer exact physics steps and omits false stopping markers', () => {
  const table = practiceTable([{ number: 0, x: -20, y: 4 }]);
  const shot = { dir: { x: 1, y: 0 }, speed: 100 };
  function preview(maxCueBounces) {
    const run = simulateShotSteps(table, newMatch(), shot, true, { aimPreview: true, yieldEvery: 1, maxCueBounces });
    let next, steps = 0;
    do { next = run.next(); steps++; } while (!next.done);
    return { result: next.value, steps };
  }
  const zero = preview(0), one = preview(1), all = preview(Infinity);
  assert.ok(zero.steps < one.steps && one.steps < all.steps);
  assert.equal(zero.result.paths[0].bounces.length, 1);
  assert.equal(one.result.paths[0].bounces.length, 2);
  for (const value of [zero, one]) {
    assert.equal(value.result.settled, false);
    assert.ok(value.result.paths.every(path => !path.stopped));
    const points = value.result.paths[0].points;
    assert.deepEqual(points, all.result.paths[0].points.slice(0, points.length), 'short preview is an exact prefix of the full trajectory');
  }
});

test('look-ahead counts ball contacts as well as cushions and retains early stopping predictions', () => {
  const table = practiceTable([{ number: 0, x: -18, y: 0 }, { number: 1, x: 0, y: 0 }]);
  const hit = simulateShot(table, newMatch(), { dir: { x: 1, y: 0 }, speed: 24 }, true, { aimPreview: true, maxCueBounces: 0 });
  assert.equal(hit.report.first, 1);
  assert.equal(hit.paths[0].bounces.length, 1);
  assert.equal(hit.settled, false);
  const soft = simulateShot(table, newMatch(), { dir: { x: 1, y: 0 }, speed: 12 }, true, { aimPreview: true, maxCueBounces: 0 });
  assert.equal(soft.report.first, null);
  assert.equal(soft.settled, true);
  assert.equal(soft.paths[0].stopped, true);
});

test('Clairvoyant follows secondary collisions and matches every moved ball’s live endpoint', () => {
  const table = practiceTable([
    { number: 0, x: -18, y: 0 }, { number: 5, x: -2, y: 0 },
    { number: 2, x: 3, y: 0 }, { number: 14, x: 8, y: 0 }, { number: 1, x: -20, y: 12 },
  ]);
  const shot = { dir: { x: 1, y: 0 }, speed: 36 };
  const normal = simulateShot(table, newMatch(), shot, true, { aimPreview: true });
  const all = simulateShot(table, newMatch(), shot, true, { aimPreview: true, allBallPaths: true });
  assert.deepEqual(normal.paths.map(p => p.number), [0, 5]);
  assert.deepEqual(all.paths.map(p => p.number).sort((a,b) => a-b), [0, 2, 5, 14]);
  assert.deepEqual(all.balls, normal.balls, 'recording more paths must not change physics');
  assert.deepEqual(all.report, normal.report);
  const actual = play(table, shot);
  for (const path of all.paths) {
    assert.ok(path.stopped);
    const end = path.points.at(-1), ball = actual.find(b => b.number === path.number);
    assert.ok(Math.hypot(end.x - ball.x, end.y - ball.y) < 0.01);
  }
});

test('Clairvoyant includes the whole break and still honors shorter look ahead', () => {
  const table = practiceTable(rackPositions());
  const shot = { dir: { x: 1, y: 0 }, speed: 100 };
  const full = simulateShot(table, newMatch(), shot, true, { aimPreview: true, allBallPaths: true });
  assert.equal(full.paths.length, 16);
  const short = simulateShot(table, newMatch(), shot, true, { aimPreview: true, allBallPaths: true, maxCueBounces: 0 });
  assert.equal(short.settled, false);
  assert.equal(short.paths[0].bounces.length, 1);
  assert.ok(short.paths.every(path => !path.stopped));
  for (const path of short.paths) {
    assert.deepEqual(path.points, full.paths.find(p => p.number === path.number).points.slice(0, path.points.length));
  }
});
