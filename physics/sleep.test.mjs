import { test } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { P, ballBody, feltCollider, feltExtras, strike } from './poolphysics.js';

await RAPIER.init();

test('resting balls sleep through felt friction, then wake for shots and collisions', () => {
  const world = new RAPIER.World({ x: 0, y: 0, z: -P.G });
  try {
    world.timestep = 1 / 480;
    feltCollider(world, 0, false);
    const cue = ballBody(world, -10, 0, P.R), target = ballBody(world, 0, 0, P.R);
    const balls = [cue, target];
    const step = () => { feltExtras(balls, world.timestep, P.R); world.step(); };
    for (let i = 0; i < 480 * 5; i++) step();
    assert.ok(balls.every(ball => ball.isSleeping()), 'resting balls must be allowed to sleep');
    for (let i = 0; i < 480; i++) step();
    assert.ok(balls.every(ball => ball.isSleeping()), 'felt friction must not wake them');
    strike(cue, { x: 1, y: 0 }, 40);
    assert.equal(cue.isSleeping(), false, 'cue strike wakes the cue ball');
    let hit = false;
    for (let i = 0; i < 480; i++) {
      step();
      if (!target.isSleeping() && target.linvel().x > 1) { hit = true; break; }
    }
    assert.ok(hit, 'a collision wakes and moves the sleeping object ball');
  } finally { world.free(); }
});
