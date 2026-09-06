import { P, pocketCenters } from '../physics/constants.js';
import { targets } from './eight-ball.js';
const pockets = pocketCenters(), { R, HW, HH } = P;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function clearPath(a, b, balls, ignored = []) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  return balls.every(ball => {
    if (ignored.includes(ball.number)) return true;
    const t = length2 ? Math.max(0, Math.min(1, ((ball.x - a.x) * dx + (ball.y - a.y) * dy) / length2)) : 0;
    return Math.hypot(ball.x - a.x - dx * t, ball.y - a.y - dy * t) > 2 * R + 0.04;
  });
}
export function potOptions(balls, legal) {
  const cue = balls.find(b => b.number === 0), options = [];
  for (const ball of balls.filter(b => legal.includes(b.number))) for (const [pocket, p] of pockets.entries()) {
    const length = distance(ball, p), nx = (p.x - ball.x) / length, ny = (p.y - ball.y) / length;
    const ghost = { x: ball.x - nx * 2 * R, y: ball.y - ny * 2 * R };
    const travel = distance(cue, ghost);
    if (travel < 0.01 || Math.abs(ghost.x) > HW - R || Math.abs(ghost.y) > HH - R) continue;
    const dir = { x: (ghost.x - cue.x) / travel, y: (ghost.y - cue.y) / travel };
    const cut = dir.x * nx + dir.y * ny;
    if (cut < 0.25 || !clearPath(cue, ghost, balls, [0, ball.number]) || !clearPath(ball, p, balls, [0, ball.number])) continue;
    // Both newly struck balls lose speed while sliding into natural roll.
    const objectSpeed = 1.4 * Math.sqrt(2 * P.MU_ROLL * P.G * length + 10 * 10);
    const speed = Math.min(125, Math.max(22, 1.4 * Math.sqrt((objectSpeed / (cut * 0.94)) ** 2 + 2 * P.MU_ROLL * P.G * travel)));
    options.push({ dir, speed, pocket, target: ball.number, score: cut * 100 - travel * 0.3 - length * 0.45 });
  }
  return options.sort((a, b) => b.score - a.score);
}
export function computerShot(balls, state, difficulty = 'medium', random = Math.random) {
  const cue = balls.find(b => b.number === 0), legal = targets(state);
  if (!cue) throw new Error('Computer needs a cue ball');
  if (state.breaking) return { dir: { x: 1, y: 0 }, speed: 300, pocket: null, target: 1 };
  const options = potOptions(balls, legal);
  let choice;
  if (options.length) {
    // Even a beginner picks a sensible pot, rather than an arbitrary difficult alternative.
    const count = difficulty === 'easy' ? Math.min(2, options.filter(s => s.score >= options[0].score - 12).length) : 1;
    choice = options[Math.floor(random() * count)];
  } else {
    // With no clear pot, make legal contact. Try a one-cushion escape if direct paths are blocked.
    const candidates = balls.filter(b => legal.includes(b.number)).sort((a, b) => distance(cue, a) - distance(cue, b));
    let target = candidates.find(b => clearPath(cue, b, balls, [0, b.number])), aim = target;
    if (!target) for (const ball of candidates) {
      for (const [axis, wall] of [['x', HW - R], ['x', -HW + R], ['y', HH - R], ['y', -HH + R]]) {
        const mirror = { ...ball, [axis]: 2 * wall - ball[axis] };
        const t = (wall - cue[axis]) / (mirror[axis] - cue[axis]);
        const bounce = { x: cue.x + (mirror.x - cue.x) * t, y: cue.y + (mirror.y - cue.y) * t };
        if (!(t > 0 && t < 1) || Math.abs(bounce.x) > HW - R || Math.abs(bounce.y) > HH - R ||
          pockets.some(p => distance(p, bounce) < 4)) continue;
        if (clearPath(cue, bounce, balls, [0, ball.number]) && clearPath(bounce, ball, balls, [0, ball.number])) { target = ball; aim = bounce; break; }
      }
      if (target) break;
    }
    target ||= candidates[0]; aim ||= target;
    if (!target) throw new Error('Computer has no legal target');
    const length = distance(cue, aim) || 1;
    const pocket = pockets.reduce((best, p, i) => distance(target, p) < distance(target, pockets[best]) ? i : best, 0);
    choice = { dir: { x: (aim.x - cue.x) / length, y: (aim.y - cue.y) / length }, speed: 90, pocket, target: target.number };
  }
  // Short, straight pots are forgiving at every level; distance and cut expose weaker technique.
  // 'hard' is the geometric fallback/baseline. The actual Hard opponent uses its physics worker.
  const profile = difficulty === 'easy' ? { aim: 0.014, power: 0.12 } :
    difficulty === 'hard' ? { aim: 0.0015, power: 0 } : { aim: 0.0035, power: 0.025 };
  const challenge = difficulty === 'hard' || choice.score === undefined ? 1 : Math.max(0.35, Math.min(1.25, (100 - choice.score) / 60));
  const angle = Math.atan2(choice.dir.y, choice.dir.x) + (random() - 0.5) * 2 * profile.aim * challenge;
  const speed = choice.speed * (1 + (random() - 0.5) * 2 * profile.power * challenge);
  return { ...choice, speed, dir: { x: Math.cos(angle), y: Math.sin(angle) } };
}
export function computerPlacement(balls, state, valid) {
  const legal = targets(state), options = [];
  for (const ball of balls.filter(b => legal.includes(b.number))) for (const p of pockets) {
    const length = distance(ball, p);
    const position = { x: ball.x + (ball.x - p.x) / length * 8, y: ball.y + (ball.y - p.y) / length * 8 };
    if (!valid(position)) continue;
    const shots = potOptions([{ number: 0, ...position }, ...balls.filter(b => b.number !== 0)], legal);
    if (shots.length) options.push({ position, score: shots[0].score });
  }
  return options.sort((a, b) => b.score - a.score)[0]?.position ?? null;
}
