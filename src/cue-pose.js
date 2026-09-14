import { P } from '../physics/constants.js';

// Include the widest part of the cue and a small visual gap. Using inset
// rectangles also covers the rounded cushion and wood bevels at the corners.
const CUE_RADIUS = 0.42, GAP = 0.08, TIP_FRONT = 0.345;
const SURFACES = [
  { inset: -0.28 - CUE_RADIUS, height: P.RAIL_H },
  { inset: P.CUSH - 0.45 - CUE_RADIUS, height: P.RAIL_H + 0.5 },
];

function distanceToEdge(x, y, dir, inset) {
  const hw = P.HW + inset, hh = P.HH + inset;
  if (Math.abs(x) >= hw || Math.abs(y) >= hh) return 0;
  let distance = Infinity;
  if (dir.x > 1e-8) distance = Math.min(distance, (x + hw) / dir.x);
  if (dir.x < -1e-8) distance = Math.min(distance, (x - hw) / dir.x);
  if (dir.y > 1e-8) distance = Math.min(distance, (y + hh) / dir.y);
  if (dir.y < -1e-8) distance = Math.min(distance, (y - hh) / dir.y);
  return distance;
}

export function cuePose(c, dir, pull, spin, feltZ) {
  const x = c.x + dir.y * spin.x * P.R * 0.7;
  const y = c.y - dir.x * spin.x * P.R * 0.7;
  const z = feltZ + P.R + 0.15 + spin.y * P.R * 0.7;
  const surfaces = SURFACES.map(surface => ({
    distance: distanceToEdge(x, y, dir, surface.inset),
    top: feltZ + surface.height + CUE_RADIUS + GAP,
  }));
  const elevation = Math.min(Math.PI / 2 - 0.001, Math.max(5 * Math.PI / 180,
    ...surfaces.map(surface => Math.atan2(surface.top - z, surface.distance))));
  const back = P.R + 0.5 + pull * 0.6;
  const cos = Math.cos(elevation), sin = Math.sin(elevation);
  // A ball beside a pocket can put the offset tip over the cushion itself.
  // In that case lift enough to clear it, even at the front of the tip.
  let lift = 0;
  for (const surface of surfaces) {
    const first = Math.max(surface.distance, (back - TIP_FRONT) * cos);
    lift = Math.max(lift, surface.top - (z + first * Math.tan(elevation)));
  }
  return {
    x: x - dir.x * back * cos,
    y: y - dir.y * back * cos,
    z: z + back * sin + lift,
    elevation,
    yaw: Math.atan2(dir.y, dir.x),
  };
}
