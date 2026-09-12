import { P, pocketCenters } from '../physics/constants.js';
import { clearPath, potOptions } from './computer.js';
import { bankOptions, placements, variation } from './hard-computer.js';

const pockets = pocketCenters(), walls = [['x', P.HW - P.R], ['x', -P.HW + P.R], ['y', P.HH - P.R], ['y', -P.HH + P.R]];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (a, b) => { const d = distance(a, b); return { x: (b.x - a.x) / d, y: (b.y - a.y) / d }; };
const dot = (a, b) => a.x * b.x + a.y * b.y;
const inside = p => Math.abs(p.x) < P.HW - P.R && Math.abs(p.y) < P.HH - P.R;
const sequences = count => count ? sequences(count - 1).flatMap(s => walls.map((_, i) => i).filter(i => s.at(-1) !== i).map(i => [...s, i])) : [[]];

// Unfold the cushions to find an actual sequence of bounce points. The pocket
// mouths are excluded: jaw chatter does not count as another cushion.
export function railRoute(from, to, rails) {
  if (!rails.length) return [to];
  let virtual = { ...to };
  for (const i of rails.toReversed()) { const [axis, wall] = walls[i]; virtual[axis] = 2 * wall - virtual[axis]; }
  const [axis, wall] = walls[rails[0]], t = (wall - from[axis]) / (virtual[axis] - from[axis]);
  const bounce = { x: from.x + t * (virtual.x - from.x), y: from.y + t * (virtual.y - from.y) };
  if (!(t > 0.0001 && t < 1) || Math.abs(bounce.x) > P.HW - P.R + 0.001 || Math.abs(bounce.y) > P.HH - P.R + 0.001 || pockets.some(p => distance(p, bounce) < 4)) return null;
  const rest = railRoute(bounce, to, rails.slice(1));
  return rest && [bounce, ...rest];
}
function openRoute(from, route, balls, ignored) {
  return route.every((to, i) => clearPath(i ? route[i - 1] : from, to, balls, ignored));
}
function routeLength(from, route) { return route.reduce((sum, p, i) => sum + distance(i ? route[i - 1] : from, p), 0); }
function aimObject(cue, ball, destination, balls, ignored, length, loss = 1) {
  const normal = unit(ball, destination), ghost = { x: ball.x - normal.x * 2 * P.R, y: ball.y - normal.y * 2 * P.R };
  if (!inside(ghost) || distance(cue, ghost) < 0.01 || !clearPath(cue, ghost, balls, ignored)) return null;
  const dir = unit(cue, ghost), cut = dot(dir, normal);
  if (cut < 0.2) return null;
  const speed = Math.min(300, Math.max(22, 2 * Math.sqrt((2 * P.MU_ROLL * P.G * length + 100) / (cut * loss) ** 2 + 2 * P.MU_ROLL * P.G * distance(cue, ghost))));
  return { dir, speed, target: ball.number, score: cut * loss * 100 - length * 0.4 - distance(cue, ghost) * 0.25 };
}
function banks(balls, legal, count) {
  const cue = balls.find(b => !b.number), options = [];
  for (const ball of balls.filter(b => legal.includes(b.number))) for (const [pocket, p] of pockets.entries()) for (const rails of sequences(count)) {
    const route = railRoute(ball, p, rails);
    if (!route || !openRoute(ball, route, balls, [0, ball.number])) continue;
    const shot = aimObject(cue, ball, route[0], balls, [0, ball.number], routeLength(ball, route), 0.85 ** count);
    if (shot) options.push({ ...shot, pocket });
  }
  return options;
}
function kicks(balls, legal, count) {
  const cue = balls.find(b => !b.number), options = [];
  for (const ball of balls.filter(b => legal.includes(b.number))) for (const [pocket, p] of pockets.entries()) {
    if (!clearPath(ball, p, balls, [0, ball.number])) continue;
    const normal = unit(ball, p), ghost = { x: ball.x - 2 * P.R * normal.x, y: ball.y - 2 * P.R * normal.y };
    if (!inside(ghost)) continue;
    for (const rails of sequences(count)) {
      const route = railRoute(cue, ghost, rails);
      if (!route || !openRoute(cue, route, balls, [0, ball.number])) continue;
      const cut = dot(unit(route.at(-2), ghost), normal);
      if (cut < 0.25) continue;
      const length = routeLength(cue, route), speed = Math.min(320, 2 * Math.sqrt((2 * P.MU_ROLL * P.G * distance(ball, p) + 100) / cut ** 2 + 2 * P.MU_ROLL * P.G * length) / 0.85 ** count);
      options.push({ dir: unit(cue, route[0]), speed, pocket, target: ball.number, score: cut * 100 - length * 0.4 });
    }
  }
  return options;
}
function combinations(balls, legal, count, bank = false) {
  const cue = balls.find(b => !b.number), options = [];
  for (const last of balls.filter(b => legal.includes(b.number))) for (const [pocket, p] of pockets.entries()) for (const rails of bank ? sequences(1) : [[]]) {
    const route = railRoute(last, p, rails);
    if (!route || !openRoute(last, route, balls, [0, last.number])) continue;
    function prepend(chain, destination, length, loss) {
      const ball = chain[0], normal = unit(ball, destination);
      const ghost = { x: ball.x - 2 * P.R * normal.x, y: ball.y - 2 * P.R * normal.y };
      if (chain.length === count) {
        if (!legal.includes(ball.number)) return;
        const shot = aimObject(cue, ball, destination, balls, [0, ball.number], length, loss);
        if (shot) options.push({ ...shot, pocket, traceTargets: chain.map(b => b.number) });
        return;
      }
      for (const first of balls.filter(b => b.number && !chain.includes(b))) {
        if (!inside(ghost) || !clearPath(first, ghost, balls, [0, first.number, ball.number])) continue;
        const cut = dot(unit(first, ghost), normal);
        if (cut > 0.3) prepend([first, ...chain], ghost, length + distance(first, ghost), loss * cut * 0.95);
      }
    }
    prepend([last], route[0], routeLength(last, route), bank ? 0.85 : 1);
  }
  return options;
}
function caroms(balls, legal) {
  const cue = balls.find(b => !b.number), options = [], radius = 2 * P.R;
  for (const ball of balls.filter(b => legal.includes(b.number))) for (const other of balls.filter(b => b.number && b !== ball)) for (const [pocket, p] of pockets.entries()) {
    const d = distance(other, p); if (d <= radius) continue;
    const base = Math.atan2(p.y - other.y, p.x - other.x), offset = Math.acos(radius / d);
    for (const angle of [base - offset, base + offset]) {
      const contact = { x: other.x + Math.cos(angle) * radius, y: other.y + Math.sin(angle) * radius };
      const incoming = unit(ball, contact), normal = unit(contact, other), outgoing = unit(contact, p);
      if (dot(incoming, normal) < 0.15 || dot(incoming, outgoing) < 0.25 || !inside(contact) ||
          !clearPath(ball, contact, balls, [0, ball.number, other.number]) || !clearPath(contact, p, balls, [0, ball.number, other.number])) continue;
      const shot = aimObject(cue, ball, contact, balls, [0, ball.number], distance(ball, contact) + distance(contact, p), dot(incoming, outgoing));
      if (shot) options.push({ ...shot, pocket, traceTargets: [ball.number, other.number] });
    }
  }
  return options;
}
const family = (name, shots, limit) => ({ name, shots: shots.sort((a, b) => b.score - a.score).slice(0, limit).map(s => ({ ...s, family: name })) });
export function trickShotFamilies(balls, legal, ballInHand = false) {
  const direct = ballInHand ? placements(balls, legal) : potOptions(balls, legal);
  // Placement is also searched for trick routes, from a few legal, useful spots.
  const placed = ballInHand ? direct.slice(0, 3).map(s => ({ position: s.position, balls: balls.map(b => b.number ? b : { number: 0, ...s.position }) })) : [{ balls }];
  const collect = fn => placed.flatMap(p => fn(p.balls).map(s => ({ ...s, ...(p.position && { position: p.position }) })));
  const carom = collect(b => caroms(b, legal));
  return [family('Direct pot', direct, 12), family('Bank', collect(b => bankOptions(b, legal)), 10),
    family('Two-rail bank', collect(b => banks(b, legal, 2)), 8), family('Three-rail bank', collect(b => banks(b, legal, 3)), 4),
    ...[1, 2, 3].map(n => family(n === 1 ? 'Kick' : `${n}-rail kick`, collect(b => kicks(b, legal, n)), n === 1 ? 8 : 4)),
    family('Combination', collect(b => combinations(b, legal, 2)), 8), family('Three-ball combination', collect(b => combinations(b, legal, 3)), 4),
    family('Bank + combo', collect(b => combinations(b, legal, 2, true)), 6), family('Carom', carom, 6),
    family('Double kiss', carom.map(s => variation(s, 0, 0.8, { x: 0, y: -0.6 })), 4)];
}
