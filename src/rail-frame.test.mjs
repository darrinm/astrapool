import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { railFrameShape } from './rail-frame.js';
import { P, pocketCenters, cushionPolygons } from '../physics/poolphysics.js';

test('beveled rail frame leaves all six pocket drops and their entrances open', () => {
  const geometry = new THREE.ExtrudeGeometry(railFrameShape(), {
    depth: P.RAIL_H + 1.5, bevelEnabled: true, bevelThickness: 0.5,
    bevelSize: P.RAIL_BEVEL, bevelSegments: 5, curveSegments: 40,
  });
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  const blocked = (x, y) => {
    ray.set(new THREE.Vector3(x, y, 10), new THREE.Vector3(0, 0, -1));
    return ray.intersectObject(mesh).length > 0;
  };
  for (const p of pocketCenters()) {
    assert.equal(blocked(p.x, p.y), false);
    for (let i = 0; i < 72; i++) {
      const a = i * Math.PI / 36;
      assert.equal(blocked(p.x + P.POCKET_R * Math.cos(a), p.y + P.POCKET_R * Math.sin(a)), false,
        `wood over pocket at ${p.x},${p.y}, angle ${a}`);
    }
    for (let t = 0; t <= 1; t += 0.1) assert.equal(blocked(p.x * t, p.y * t), false);
  }
  for (const [b0, n0, n1, b1] of cushionPolygons()) {
    for (const [a, b] of [[n0, b0], [n1, b1]]) for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      assert.equal(blocked(a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])), false,
        'rail bevel must not overhang a pocket jaw');
    }
  }
  for (const sx of [-1, 1]) assert.equal(blocked(sx * (P.HW + P.CUSH + 1.6), 0), true);
  for (const sy of [-1, 1]) assert.equal(blocked(15, sy * (P.HH + P.CUSH + 1.6)), true);
  geometry.dispose(); mesh.material.dispose();
});
