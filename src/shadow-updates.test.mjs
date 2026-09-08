import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object3D, Mesh, SphereGeometry } from 'three';
import { trackShadowChanges } from './shadow-updates.js';

test('stationary shadows are reused, while balls, cue parents and visibility changes invalidate them', () => {
  const ball = new Mesh(), holder = new Object3D(), cue = new Object3D();
  holder.add(cue);
  const objects = [ball, holder, cue], changed = trackShadowChanges();
  assert.equal(changed(objects), true);
  assert.equal(changed(objects), false);
  for (const move of [
    () => { ball.position.x++; },
    () => { ball.rotation.z += .2; },
    () => { holder.position.y++; },
    () => { holder.rotation.y += .1; },
    () => { cue.visible = false; },
    () => { ball.visible = false; },
    () => { ball.scale.multiplyScalar(.5); },
    () => { ball.geometry = new SphereGeometry(); },
  ]) {
    move();
    assert.equal(changed(objects), true);
    assert.equal(changed(objects), false);
  }
  assert.equal(changed([ball]), true, 'removing a caster removes its old shadow');
  assert.equal(changed([ball]), false);
});
