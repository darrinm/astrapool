import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { updateSunLight } from './sun.js';
import { trackShadowChanges } from './shadow-updates.js';

test('one Sun light follows the displayed cue and stops illuminating hidden or pocketed cues', () => {
  const light = new THREE.PointLight(), live = new THREE.Mesh(), replay = new THREE.Mesh();
  const parent = new THREE.Group(); parent.position.set(4, 5, 0); parent.add(replay);
  live.position.set(1, 2, 1); replay.position.set(3, -2, 1);
  const shadowsChanged = trackShadowChanges();
  updateSunLight(light, live, true, 0);
  assert.deepEqual(light.position.toArray(), [1, 2, 1]);
  assert.equal(light.visible, true);
  assert.equal(shadowsChanged([light]), true);
  assert.equal(shadowsChanged([light]), false);

  updateSunLight(light, replay, true, 0);
  assert.deepEqual(light.position.toArray(), [7, 3, 1]);
  assert.equal(shadowsChanged([light]), true);
  assert.deepEqual(live.position.toArray(), [1, 2, 1]);
  replay.visible = false; updateSunLight(light, replay, true, 0);
  assert.equal(light.visible, false);
  replay.visible = true; replay.position.z = -1; updateSunLight(light, replay, true, 0);
  assert.equal(light.visible, false);
  updateSunLight(light, live, false, 0); assert.equal(light.visible, false);
  updateSunLight(light, undefined, true, 0); assert.equal(light.visible, false);
  updateSunLight(light, live, true, 0); assert.equal(light.visible, true);
});
