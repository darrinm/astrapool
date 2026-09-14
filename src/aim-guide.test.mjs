import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPowerGuide, setPowerPath } from './aim-guide.js';

test('curved guides preserve their endpoints and refresh bounds when the shot moves', () => {
  const mesh = createPowerGuide('#ffffff');
  setPowerPath(mesh, [{ x: -35, y: 0 }, { x: -15, y: 0 }, { x: -10, y: 5 }], 1, 0.5);
  assert.equal(mesh.visible, true);
  const positions = mesh.geometry.attributes.position;
  const endA = new THREE.Vector3().fromBufferAttribute(positions, positions.count - 2);
  const endB = new THREE.Vector3().fromBufferAttribute(positions, positions.count - 1);
  assert.ok(endA.add(endB).multiplyScalar(0.5).distanceTo(new THREE.Vector3(-10, 5, 1)) < 1e-5);
  const oldBounds = mesh.geometry.boundingSphere.clone();
  setPowerPath(mesh, [{ x: 10, y: 0 }, { x: 35, y: 0 }, { x: 35, y: 0 }], 1, 1);
  assert.ok(mesh.geometry.boundingSphere.center.x > oldBounds.center.x);
  assert.ok(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite));
  setPowerPath(mesh, [{ x: 10, y: 0 }, { x: 10, y: 0 }], 1, 0);
  assert.equal(mesh.visible, false);
  mesh.geometry.dispose(); mesh.material.dispose();
});

test('look ahead truncates at the next contact and never marks it as a resting position', async () => {
  const { limitCuePath } = await import('./aim-guide.js');
  const path = { points: Array.from({ length: 8 }, (_, x) => ({ x, y: 0 })), bounces: [2, 4, 6], stopped: true };
  assert.equal(limitCuePath(path, 0).points.length, 3);
  assert.equal(limitCuePath(path, 1).points.length, 5);
  assert.equal(limitCuePath(path, 2).points.length, 7);
  assert.equal(limitCuePath(path, 2).stopped, false);
  assert.equal(limitCuePath(path, 3), path);
  assert.equal(limitCuePath(path, Infinity), path);
});
