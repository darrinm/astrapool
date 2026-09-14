import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cuePose } from './cue-pose.js';
import { P } from '../physics/constants.js';
const feltZ = -8;

// Check the actual tapered cue mesh against conservative solid cushion/rail
// envelopes, including the bevels; gaps at pockets only reduce obstructions.
const pieces = [
  [new THREE.CylinderGeometry(0.2, 0.3, 24, 16), -12],
  [new THREE.CylinderGeometry(0.3, 0.42, 18, 16), -33],
  [new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16), -0.4],
  [new THREE.CylinderGeometry(0.19, 0.2, 0.35, 16), 0.17],
];
function verify(c, dir, pull, spin) {
  const pose = cuePose(c, dir, pull, spin, feltZ);
  const holder = new THREE.Object3D();
  holder.position.set(pose.x, pose.y, pose.z);
  holder.rotation.set(0, pose.elevation, pose.yaw, 'ZYX');
  holder.updateMatrixWorld();
  const transform = point => point.applyAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2).applyMatrix4(holder.matrixWorld);
  const check = point => {
    const outer = Math.abs(point.x) <= P.HW + P.CUSH + 3.2 + 0.45 && Math.abs(point.y) <= P.HH + P.CUSH + 3.2 + 0.45;
    if (!outer) return;
    const wood = Math.abs(point.x) >= P.HW + P.CUSH - 0.45 - 1e-8 || Math.abs(point.y) >= P.HH + P.CUSH - 0.45 - 1e-8;
    const cushion = Math.abs(point.x) >= P.HW - 0.28 - 1e-8 || Math.abs(point.y) >= P.HH - 0.28 - 1e-8;
    const top = feltZ + (wood ? P.RAIL_H + 0.5 : cushion ? P.RAIL_H : 0);
    assert.ok(point.z >= top, JSON.stringify({ c, dir, pull, spin, point, top }));
  };
  for (const [geometry, y] of pieces) {
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      check(transform(new THREE.Vector3(positions.getX(i), positions.getY(i) + y, positions.getZ(i))));
    }
    // Vertices alone miss a long shaft crossing a narrow rail. Also intersect
    // each longitudinal edge with the cushion and wood entrance planes.
    const { radiusTop, radiusBottom, height } = geometry.parameters;
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8;
      const a = transform(new THREE.Vector3(Math.sin(angle) * radiusTop, y + height / 2, Math.cos(angle) * radiusTop));
      const b = transform(new THREE.Vector3(Math.sin(angle) * radiusBottom, y - height / 2, Math.cos(angle) * radiusBottom));
      for (const [axis, half] of [['x', P.HW], ['y', P.HH]]) for (const inset of [-0.28, P.CUSH - 0.45]) for (const sign of [-1, 1]) {
        const t = (sign * (half + inset) - a[axis]) / (b[axis] - a[axis]);
        if (t >= 0 && t <= 1) check(a.clone().lerp(b, t));
      }
    }
  }
  return pose;
}

test('the cue clears the near rail on a pulled-back break shot', () => {
  for (const pull of [0, 6, 12, 24]) verify({ x: -20, y: 0 }, { x: 1, y: 0 }, pull, { x: 0, y: 0 });
});
test('cue mesh clears cushions, corner bevels and rails across directions, power and spin', () => {
  const spots = [{x:0,y:0}, {x:-20,y:0}];
  for (const sx of [-1,1]) for (const sy of [-1,1]) {
    spots.push({x:sx*(P.HW-P.R),y:sy*8}, {x:sx*12,y:sy*(P.HH-P.R)},
      {x:sx*(P.HW-P.R),y:sy*(P.HH-P.R)});
  }
  for (const c of spots) for (let i=0;i<24;i++) {
    const dir={x:Math.cos(i*Math.PI/12),y:Math.sin(i*Math.PI/12)};
    for(const pull of [0,12,24]) for(const spin of [{x:0,y:0},{x:0,y:-1},{x:0,y:1},{x:1,y:0},{x:-1,y:0},{x:0.7,y:-0.7}]) verify(c,dir,pull,spin);
  }
});
test('pulling back follows the inclined axis without changing aim or pitch', () => {
  const dir={x:0.6,y:0.8}, c={x:-20,y:0}, spin={x:0,y:-1};
  const a=cuePose(c,dir,0,spin,feltZ), b=cuePose(c,dir,24,spin,feltZ);
  assert.equal(a.elevation,b.elevation);
  assert.equal(a.yaw,b.yaw);
  const delta=new THREE.Vector3(b.x-a.x,b.y-a.y,b.z-a.z);
  const expected=new THREE.Vector3(-dir.x*Math.cos(a.elevation),-dir.y*Math.cos(a.elevation),Math.sin(a.elevation));
  assert.ok(delta.normalize().distanceTo(expected)<1e-10);
  assert.ok(b.z>a.z);
});
