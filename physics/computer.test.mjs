import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computerShot, computerPlacement, clearPath } from '../src/computer.js';
import { newMatch } from '../src/eight-ball.js';
const state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'] };
test('computer aims at a legal pot and produces finite bounded power', () => {
  const shot = computerShot([{ number: 0, x: 0, y: -8 }, { number: 1, x: 0, y: 5 }, { number: 9, x: 25, y: 0 }], state, 'hard', () => 0.5);
  assert.equal(shot.target, 1); assert.equal(shot.pocket, 1); assert.ok(shot.dir.y > 0.99);
  assert.ok(shot.speed >= 22 && shot.speed <= 125);
});
test('blocked paths are rejected, balls beyond the segment do not block', () => {
  assert.equal(clearPath({ x: 0, y: 0 }, { x: 10, y: 0 }, [{ number: 9, x: 5, y: 0 }]), false);
  assert.equal(clearPath({ x: 0, y: 0 }, { x: 10, y: 0 }, [{ number: 9, x: 15, y: 0 }]), true);
});
test('computer calls a pocket when on the 8, never targets opponent balls', () => {
  const eightState = { ...state, down: [1, 2, 3, 4, 5, 6, 7] };
  const shot = computerShot([{ number: 0, x: 0, y: -8 }, { number: 8, x: 0, y: 5 }, { number: 9, x: 20, y: 0 }], eightState);
  assert.equal(shot.target, 8); assert.ok(Number.isInteger(shot.pocket));
});
test('ball-in-hand placement only returns a validated position', () => {
  const balls = [{ number: 0, x: -20, y: 0 }, { number: 1, x: 0, y: 5 }];
  assert.equal(computerPlacement(balls, state, () => false), null);
  const p = computerPlacement(balls, state, p => Math.abs(p.x) < 30 && Math.abs(p.y) < 15);
  assert.ok(p && Math.abs(p.x) < 30 && Math.abs(p.y) < 15);
});
test('break is a strong forward shot', () => {
  const shot = computerShot([{ number: 0, x: -19.5, y: 0 }], newMatch(1));
  assert.deepEqual(shot.dir, { x: 1, y: 0 }); assert.equal(shot.speed, 300);
});
test('difficulty changes aiming error without changing game rules', () => {
  const balls = [{ number: 0, x: 0, y: -8 }, { number: 1, x: 0, y: 5 }];
  const easy = computerShot(balls, state, 'easy', () => 0.9), hard = computerShot(balls, state, 'hard', () => 0.9);
  assert.ok(Math.abs(easy.dir.x) > Math.abs(hard.dir.x)); assert.equal(easy.target, hard.target);
});
test('chosen power actually pockets an unobstructed side-pocket shot', async () => {
  const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
  const { P, ballBody, feltCollider, cushionColliders, pocketWellColliders, backstopColliders, feltExtras, strike } = await import('./poolphysics.js');
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: 0, z: -P.G }); world.timestep = 1 / 480;
  try {
    feltCollider(world, 0); cushionColliders(world, 0); pocketWellColliders(world, 0); backstopColliders(world, 0);
    const cue = ballBody(world, 0, -8, P.R), ball = ballBody(world, 0, 5, P.R), bodies = [cue, ball];
    const shot = computerShot([{ number: 0, x: 0, y: -8 }, { number: 1, x: 0, y: 5 }], state, 'hard', () => 0.5);
    for (let i = 0; i < 120; i++) world.step();
    strike(cue, shot.dir, shot.speed);
    for (let i = 0; i < 4800; i++) { feltExtras(bodies, world.timestep, P.R); world.step(); }
    assert.ok(ball.translation().z < -1.5, `Object stopped at ${JSON.stringify(ball.translation())}; speed=${shot.speed}`);
  } finally { world.free(); }
});
