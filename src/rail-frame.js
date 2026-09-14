import * as THREE from 'three';
import { P, pocketCenters, POCKET_DIMENSIONS } from '../physics/constants.js';

// Shared by the wood frame and its fitted pocket liners. Angles run clockwise
// around the back of each opening; the gap faces the playing surface.
export function railPocketCuts() {
  const { HW, HH, CUSH } = P;
  const ix = HW + CUSH, iy = HH + CUSH;
  const pockets = pocketCenters();
  const { x: cx, y: cy } = pockets[2], sideY = pockets[1].y;
  const { corner, side } = POCKET_DIMENSIONS;
  const run = angle => CUSH / Math.tan((180 - angle) * Math.PI / 180);
  const cornerBackX = HW - corner.mouth / Math.SQRT2 + run(corner.facingAngle);
  const sideBackX = side.mouth / 2 - run(side.facingAngle);
  const r = Math.hypot(cx - cornerBackX, iy - cy) + 0.5;
  const sr = Math.hypot(sideBackX, iy - sideY) + 0.5;
  const a = Math.asin((iy - cy) / r), b = Math.acos((ix - cx) / r);
  const s = Math.asin((iy - sideY) / sr);
  return [
    [r, -Math.PI + b, -2 * Math.PI + a], [sr, Math.PI - s, s],
    [r, Math.PI - a, -b], [r, -a, -Math.PI - b],
    [sr, -s, -Math.PI + s], [r, b, -Math.PI + a],
  ].map(([radius, start, end], i) => ({ ...pockets[i], radius, start, end }));
}

export function railFrameShape(railWidth = P.RAIL_W) {
  const ox = P.HW + P.CUSH + railWidth, oy = P.HH + P.CUSH + railWidth;
  const shape = new THREE.Shape();
  shape.moveTo(-ox, -oy); shape.lineTo(ox, -oy); shape.lineTo(ox, oy); shape.lineTo(-ox, oy); shape.closePath();
  const cuts = railPocketCuts(), first = cuts[0], opening = new THREE.Path();
  opening.moveTo(first.x + first.radius * Math.cos(first.end), first.y + first.radius * Math.sin(first.end));
  for (const i of [1, 2, 5, 4, 3, 0]) {
    const c = cuts[i];
    opening.lineTo(c.x + c.radius * Math.cos(c.start), c.y + c.radius * Math.sin(c.start));
    opening.absarc(c.x, c.y, c.radius, c.start, c.end, true);
  }
  opening.closePath(); shape.holes.push(opening);
  return shape;
}
