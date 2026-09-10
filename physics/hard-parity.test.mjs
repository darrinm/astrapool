import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { stepPhysics } from '../src/physics-step.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
import { newMatch } from '../src/eight-ball.js';
import { P, feltExtras, strike } from './poolphysics.js';

await RAPIER.init();
const state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'], down: [4, 5, 6, 7, 12, 13, 14, 15] };
// The old live loop advanced this "resting" table during the search. The worker
// predicted both 1 and 2, but the same shot after that idle interval only potted 1.
const balls = [
  { number: 0, x: -22.164001086261123, y: 12.588281325995922 },
  { number: 1, x: -10.409009438473731, y: 6.4251136388629675 },
  { number: 2, x: 2.0969888200052083, y: 12.68319622054696 },
  { number: 3, x: 18.383143042679876, y: 13.895467909052968 },
  { number: 8, x: -27.504982297774404, y: 13.96660502254963 },
  { number: 9, x: 32.611219129990786, y: -9.713949160650373 },
  { number: 10, x: -1.453716758172959, y: 10.900310214608908 },
  { number: 11, x: 31.75041995337233, y: 6.513552302494645 },
];
const shot = { dir: { x: 0.9362037226151466, y: -0.3514578065167164 }, speed: 76.21867123817378,
  pocket: 4, target: 1, spin: { x: 0, y: 0.35 } };

test('planning and cue windup preserve the exact physics snapshot and predicted pots', () => {
  const table = practiceTable(balls), world = RAPIER.World.restoreSnapshot(table.snapshot), queue = new RAPIER.EventQueue(true);
  try {
    const before = world.takeSnapshot();
    let updates = 0;
    const scene = { step() { updates++; return false; } };
    for (let i = 0; i < 480 * 3; i++) assert.equal(stepPhysics(scene, world, queue), false);
    assert.equal(updates, 1440, 'the scene can keep polling the plan and advancing cue presentation');
    assert.deepEqual(world.takeSnapshot(), before, 'contact caches, sleeping state and poses must all stay unchanged');
    const expected = simulateShot(table, state, shot);
    const delayed = simulateShot({ ...table, snapshot: world.takeSnapshot() }, state, shot);
    assert.deepEqual(expected.report.pocketed, [{ number: 1, pocket: 4 }, { number: 2, pocket: 2 }]);
    assert.deepEqual(delayed, expected, 'waiting for a worker must not change the shot or its leave');
  } finally { queue.free(); world.free(); }
});

test('the strike resumes physics with the same impulse/friction order as the worker', () => {
  const table = practiceTable(balls), world = RAPIER.World.restoreSnapshot(table.snapshot), reference = RAPIER.World.restoreSnapshot(table.snapshot);
  const queue = new RAPIER.EventQueue(true), referenceQueue = new RAPIER.EventQueue(true);
  try {
    const liveBodies = table.handles.map(b => world.getRigidBody(b.handle));
    const referenceBodies = table.handles.map(b => reference.getRigidBody(b.handle));
    const cueHandle = table.handles.find(b => b.number === 0).handle;
    const sideSpin = { ...shot, spin: { x: 0.3, y: 0.35 } };
    let waiting = true, fired = false;
    const scene = { step() {
      if (waiting) return false;
      if (!fired) { strike(world.getRigidBody(cueHandle), sideSpin.dir, sideSpin.speed, sideSpin.spin); fired = true; }
      feltExtras(liveBodies, world.timestep, table.feltZ + P.R);
    } };
    for (let i = 0; i < 100; i++) stepPhysics(scene, world, queue);
    waiting = false;
    strike(reference.getRigidBody(cueHandle), sideSpin.dir, sideSpin.speed, sideSpin.spin);
    for (let i = 0; i < 120; i++) {
      assert.equal(stepPhysics(scene, world, queue), true);
      feltExtras(referenceBodies, reference.timestep, table.feltZ + P.R); reference.step(referenceQueue);
      queue.drainCollisionEvents(() => {}); referenceQueue.drainCollisionEvents(() => {});
    }
    assert.deepEqual(world.takeSnapshot(), reference.takeSnapshot());
    assert.ok(Math.hypot(liveBodies[0].linvel().x, liveBodies[0].linvel().y) > 1, 'physics resumes rather than leaving the table paused');
  } finally { queue.free(); referenceQueue.free(); world.free(); reference.free(); }
});

test('simulated ball-in-hand uses the same pose as a live cue-ball placement', () => {
  const table = practiceTable(balls), world = RAPIER.World.restoreSnapshot(table.snapshot);
  const position = { x: 0, y: -8 }, placedShot = { ...shot, position };
  try {
    const cue = world.getRigidBody(table.handles.find(b => b.number === 0).handle);
    cue.setTranslation({ ...position, z: table.feltZ + P.R }, true);
    cue.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    cue.setLinvel({ x: 0, y: 0, z: 0 }, true); cue.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const live = simulateShot({ ...table, snapshot: world.takeSnapshot() }, state, shot);
    assert.deepEqual(simulateShot(table, state, placedShot), live);
  } finally { world.free(); }
});
