import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { blackHoleGravity, BLACK_HOLE_GRAVITY } from './black-hole-gravity.js';
import { P, ballBody, feltExtras, strike } from './poolphysics.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
import { computerShot } from '../src/computer.js';
import { gravityComputerShot, hardComputerShot } from '../src/hard-computer.js';
import { trickyComputerShot } from '../src/tricky-computer.js';
import { newMatch } from '../src/eight-ball.js';
import { rackPositions } from '../src/table-state.js';
import { stepPhysics } from '../src/physics-step.js';

await RAPIER.init();
const balls = [{ number: 0, x: 0, y: -8 }, { number: 1, x: 0, y: 12 }, { number: 8, x: 4, y: 5 }];
const state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'], down: [2, 3, 4, 5, 6, 7] };

test('gravity attracts locally, follows the 8, and leaves sleeping/pocketed balls and vertical motion alone', () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  try {
    const eight = ballBody(world, 0, 0, P.R);
    const near = ballBody(world, 5, 0, P.R), far = ballBody(world, BLACK_HOLE_GRAVITY.radius + 1, 0, P.R);
    const sleeping = ballBody(world, 0, 5, P.R), down = ballBody(world, 0, -5, P.R - 1);
    for (const body of [near, far, down]) body.setLinvel({ x: 0, y: 20, z: 2 }, true);
    sleeping.sleep();
    blackHoleGravity([eight, near, far, sleeping, down], eight, 1 / 480, P.R);
    assert.ok(near.linvel().x < 0);
    assert.equal(near.linvel().y, 20);
    assert.equal(near.linvel().z, 2);
    assert.equal(far.linvel().x, 0);
    assert.equal(down.linvel().x, 0);
    assert.ok(sleeping.isSleeping());
    assert.deepEqual({ ...eight.linvel() }, { x: 0, y: 0, z: 0 });
    near.setLinvel({ x: 0, y: 20, z: 0 }, true);
    eight.setTranslation({ x: 10, y: 0, z: P.R }, true);
    blackHoleGravity([near], eight, 1 / 480, P.R);
    assert.ok(near.linvel().x > 0, 'pull follows the moving source');
    for (const source of [undefined, eight]) {
      eight.setTranslation({ x: 10, y: 0, z: P.R - 1 }, true);
      const before = near.linvel();
      blackHoleGravity([near], source, 1 / 480, P.R);
      assert.deepEqual(near.linvel(), before);
    }
    eight.setTranslation({ x: 10, y: 0, z: P.R }, true); eight.setEnabled(false);
    const before = near.linvel(); blackHoleGravity([near], eight, 1 / 480, P.R);
    assert.deepEqual(near.linvel(), before);
  } finally { world.free(); }
});

test('gravity is off by default, bends a shot when enabled, and permits settlement', () => {
  const table = practiceTable(balls), shot = computerShot(balls, state, 'medium', () => 0.5);
  assert.equal(table.blackHoleGravity, false);
  const standard = simulateShot(table, state, shot);
  assert.deepEqual(simulateShot({ ...table, blackHoleGravity: false }, state, shot), standard);
  const curved = simulateShot({ ...table, blackHoleGravity: true }, state, shot);
  assert.ok(standard.report.pocketed.some(p => p.number === 1));
  assert.ok(!curved.report.pocketed.some(p => p.number === 1), 'the nearby 8 bends this formerly straight pot away');
  assert.ok(curved.settled);
  const next = practiceTable(curved.balls, { blackHoleGravity: true });
  assert.equal(next.blackHoleGravity, true, 'continuation tables retain gravity');
});

test('gravity bends a moving object ball near the 8 as well as the cue ball', () => {
  const layout = [{ number: 0, x: -30, y: -10 }, { number: 1, x: 0, y: -8 }, { number: 8, x: 4, y: 5 }];
  const table = practiceTable(layout), world = RAPIER.World.restoreSnapshot(table.snapshot);
  try {
    const object = world.getRigidBody(table.handles.find(b => b.number === 1).handle);
    strike(object, { x: 0, y: 1 }, 25);
    table.snapshot = world.takeSnapshot();
    const shot = { dir: { x: 1, y: 0 }, speed: 0, target: 1, pocket: null };
    const standard = simulateShot(table, state, shot, true);
    const gravity = simulateShot({ ...table, blackHoleGravity: true }, state, shot, true);
    assert.ok(standard.paths.find(p => p.number === 1).points.length > 10, 'object ball actually travels');
    assert.notDeepEqual(gravity.paths.find(p => p.number === 1).points, standard.paths.find(p => p.number === 1).points, 'object balls must feel the pull too');
    assert.ok(gravity.settled);
  } finally { world.free(); }
});

for (const difficulty of ['easy', 'medium', 'hard', 'tricky']) test(`${difficulty} compensates for gravity without a foul or early-8 loss`, () => {
  const table = practiceTable(balls, { blackHoleGravity: true });
  const shot = difficulty === 'tricky' ? trickyComputerShot(balls, state, table, undefined, undefined, { maxMs: Infinity })
    : difficulty === 'hard' ? hardComputerShot(balls, state, table)
      : gravityComputerShot(balls, state, table, difficulty, undefined, () => 0.5);
  const result = simulateShot(table, state, shot);
  assert.ok(result.settled);
  assert.equal(result.report.first, 1, 'compensation must preserve legal first contact');
  assert.ok(result.state.winner === null || result.state.winner === state.turn, 'reject pots that also drag in the 8 early');
  if (['hard', 'tricky'].includes(difficulty)) assert.ok(result.report.pocketed.some(p => p.number === 1));
  assert.equal(result.state.ballInHand, false);
});

test('a full gravity break settles instead of leaving the turn running', () => {
  const table = practiceTable(rackPositions(), { blackHoleGravity: true });
  const result = simulateShot(table, newMatch(), { dir: { x: 1, y: 0 }, speed: 300, target: 1, pocket: null });
  assert.ok(result.settled);
  assert.ok(result.balls.every(b => Number.isFinite(b.x) && Number.isFinite(b.y)));
});

test('live and practice stepping preserve identical gravity trajectories after a planner wait', () => {
  const table = practiceTable(balls, { blackHoleGravity: true });
  const live = RAPIER.World.restoreSnapshot(table.snapshot), practice = RAPIER.World.restoreSnapshot(table.snapshot);
  const q1 = new RAPIER.EventQueue(true), q2 = new RAPIER.EventQueue(true);
  try {
    const bodies = w => table.handles.map(b => w.getRigidBody(b.handle));
    const liveBodies = bodies(live), practiceBodies = bodies(practice);
    const shot = computerShot(balls, state, 'medium', () => 0.5);
    for (let i = 0; i < 100; i++) stepPhysics({ step: () => false }, live, q1);
    for (const list of [liveBodies, practiceBodies]) strike(list[0], shot.dir, shot.speed);
    const scene = { step() {
      feltExtras(liveBodies, live.timestep, P.R);
      blackHoleGravity(liveBodies, liveBodies[2], live.timestep, P.R);
    } };
    for (let i = 0; i < 480; i++) {
      stepPhysics(scene, live, q1);
      feltExtras(practiceBodies, practice.timestep, P.R);
      blackHoleGravity(practiceBodies, practiceBodies[2], practice.timestep, P.R);
      practice.step(q2);
      q1.drainCollisionEvents(() => {}); q2.drainCollisionEvents(() => {});
    }
    assert.deepEqual(live.takeSnapshot(), practice.takeSnapshot());
  } finally { q1.free(); q2.free(); live.free(); practice.free(); }
});
