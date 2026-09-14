import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { P, pocketCenters } from '../physics/constants.js';
import { createPocketLiners } from './pocket-liners.js';

test('fitted liners leave every pocket drop and approach shelf unobstructed', () => {
  const liners = createPocketLiners(0), ray = new THREE.Raycaster();
  const clear = (x, y) => {
    ray.set(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1));
    assert.equal(ray.intersectObject(liners, true).length, 0, `liner obstructs ${x}, ${y}`);
  };
  for (const p of pocketCenters()) {
    clear(p.x, p.y);
    for (let i = 0; i < 72; i++) {
      const angle = i * Math.PI / 36;
      clear(p.x + (P.POCKET_R - 0.03) * Math.cos(angle), p.y + (P.POCKET_R - 0.03) * Math.sin(angle));
    }
    const d = p.x === 0 ? [0, Math.sign(p.y)] : [Math.sign(p.x) / Math.SQRT2, Math.sign(p.y) / Math.SQRT2];
    for (let t = 0; t <= 4; t += 0.1) clear(p.x - t * d[0], p.y - t * d[1]);
  }
  for (const mesh of liners.children) mesh.geometry.dispose();
  liners.children[0].material.dispose();
});
