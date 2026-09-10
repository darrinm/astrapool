import { P } from '../physics/constants.js';
import { rackPositions, canPlace } from './table-state.js';

export const RACK_HOLD = 0.14, RACK_TRAVEL = 0.78, RACK_DURATION = RACK_HOLD + RACK_TRAVEL + 0.12;
const { R, HW, HH } = P;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

// Keep balls already on the felt. Only missing balls need a clear random start.
// Rejection sampling is bounded; the spare grid also handles a constant RNG.
export function planRack(current, random = Math.random, targets = rackPositions()) {
  const present = new Map(current.filter(p => p.onTable && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    Math.abs(p.x) < HW && Math.abs(p.y) < HH).map(p => [p.number, p]));
  const occupied = [...present.values()], spare = [];
  for (let x = -HW + 3 * R; x < HW - 3 * R; x += 3 * R)
    for (let y = -HH + 3 * R; y < HH - 3 * R; y += 3 * R) spare.push({ x, y });
  return targets.map(to => {
    let from = present.get(to.number);
    const returned = !from;
    if (!from) {
      for (let attempt = 0; attempt < 48 && !from; attempt++) {
        const p = { x: (random() * 2 - 1) * (HW - 3 * R), y: (random() * 2 - 1) * (HH - 3 * R) };
        if (canPlace(p, occupied, to.number)) from = p;
      }
      if (!from) {
        const offset = Math.floor(random() * spare.length);
        for (let i = 0; i < spare.length; i++) {
          const p = spare[(i + offset) % spare.length];
          if (canPlace(p, occupied, to.number)) { from = p; break; }
        }
      }
      if (!from) throw new Error('No clear starting position for the rack.');
      occupied.push({ number: to.number, ...from });
    }
    const dx = to.x - from.x, dy = to.y - from.y, distance = Math.hypot(dx, dy);
    const bend = Math.min(3, distance * 0.12) * (to.number % 2 ? 1 : -1);
    const control = {
      x: clamp((from.x + to.x) / 2 - dy / (distance || 1) * bend, -HW + R, HW - R),
      y: clamp((from.y + to.y) / 2 + dx / (distance || 1) * bend, -HH + R, HH - R),
    };
    const row = to.number === 0 ? 4 : Math.round((to.x - HW * 0.5) / (R * 1.74));
    return { number: to.number, from: { x: from.x, y: from.y }, to: { ...to }, control, returned, delay: RACK_HOLD + row * 0.03 };
  });
}

export function rackPose(move, elapsed) {
  const t = clamp((elapsed - move.delay) / RACK_TRAVEL, 0, 1);
  const progress = t * t * t * (t * (t * 6 - 15) + 10);
  const a = (1 - progress) ** 2, b = 2 * progress * (1 - progress), c = progress ** 2;
  return { x: a * move.from.x + b * move.control.x + c * move.to.x,
    y: a * move.from.y + b * move.control.y + c * move.to.y, progress };
}
