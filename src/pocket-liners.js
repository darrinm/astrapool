import * as THREE from 'three';
import { P } from '../physics/constants.js';
import { railPocketCuts } from './rail-frame.js';

export function createPocketLiners(surfaceZ) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: '#17120f', roughness: 0.9, side: THREE.DoubleSide });
  for (const c of railPocketCuts()) {
    const radius = c.radius - P.RAIL_BEVEL - 0.015;
    // Cover the rear slate edge, the exposed slate behind the drop, and the
    // wooden back wall with one fitted liner. The approach shelf remains cloth;
    // the open front arc has no raised threshold across the pocket mouth.
    const profile = [[P.POCKET_R - 0.012, -1.25], [P.POCKET_R - 0.012, 0.016],
      [radius, 0.016], [radius, P.RAIL_H],
      ...Array.from({ length: 5 }, (_, i) => {
        const angle = (i + 1) / 5 * Math.PI / 2;
        return [radius + P.RAIL_BEVEL * (1 - Math.cos(angle)), P.RAIL_H + 0.5 * Math.sin(angle)];
      })];
    const positions = [], segments = 80;
    const point = (i, j) => {
      const angle = c.start + (c.end - c.start) * i / segments;
      return [c.x + profile[j][0] * Math.cos(angle), c.y + profile[j][0] * Math.sin(angle), surfaceZ + profile[j][1]];
    };
    for (let i = 0; i < segments; i++) for (let j = 0; j < profile.length - 1; j++) {
      for (const [u, v] of [[i, j], [i + 1, j], [i, j + 1], [i, j + 1], [i + 1, j], [i + 1, j + 1]]) positions.push(...point(u, v));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    const liner = new THREE.Mesh(geometry, material);
    liner.receiveShadow = true; liner.castShadow = true;
    group.add(liner);
  }
  return group;
}
