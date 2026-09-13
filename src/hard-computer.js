import { P, pocketCenters } from '../physics/constants.js';
import { targets } from './eight-ball.js';
import { canPlace } from './table-state.js';
import { clearPath, potOptions, computerShot, computerPlacement, executionError } from './computer.js';
import { practiceTable, simulateShot } from './shot-simulation.js';
const pockets = pocketCenters(), MAX_SPEED = 24 * 0.44704 / 0.026;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const walls = [['x', P.HW - P.R], ['x', -P.HW + P.R], ['y', P.HH - P.R], ['y', -P.HH + P.R]];
function bouncePoint(a, b, axis, wall) {
  const mirror = { ...b, [axis]: 2 * wall - b[axis] }, t = (wall - a[axis]) / (mirror[axis] - a[axis]);
  const p = { x: a.x + (mirror.x - a.x) * t, y: a.y + (mirror.y - a.y) * t };
  return t > 0 && t < 1 && Math.abs(p.x) <= P.HW - P.R && Math.abs(p.y) <= P.HH - P.R &&
    !pockets.some(q => distance(p, q) < 4) ? p : null;
}
export function bankOptions(balls, legal) {
  const cue = balls.find(b => b.number === 0), options = [];
  for (const ball of balls.filter(b => legal.includes(b.number))) for (const [pocket, p] of pockets.entries()) for (const [axis, wall] of walls) {
    const bounce = bouncePoint(ball, p, axis, wall);
    if (!bounce || !clearPath(ball, bounce, balls, [0, ball.number]) || !clearPath(bounce, p, balls, [0, ball.number])) continue;
    const length = distance(ball, bounce), nx = (bounce.x - ball.x) / length, ny = (bounce.y - ball.y) / length;
    const ghost = { x: ball.x - nx * 2 * P.R, y: ball.y - ny * 2 * P.R }, travel = distance(cue, ghost);
    if (travel < 0.01 || Math.abs(ghost.x) > P.HW - P.R || Math.abs(ghost.y) > P.HH - P.R || !clearPath(cue, ghost, balls, [0, ball.number])) continue;
    const dir = { x: (ghost.x - cue.x) / travel, y: (ghost.y - cue.y) / travel }, cut = dir.x * nx + dir.y * ny;
    if (cut < 0.3) continue;
    const total = length + distance(bounce, p);
    const speed = Math.min(180, 2 * Math.sqrt((2 * P.MU_ROLL * P.G * total + 100) / (cut * cut) + 2 * P.MU_ROLL * P.G * travel));
    options.push({ dir, speed, pocket, target: ball.number, score: cut * 100 - total * 0.5 - travel * 0.3 });
  }
  return options.sort((a, b) => b.score - a.score);
}
export function contactOptions(balls, legal) {
  const cue = balls.find(b => b.number === 0), options = [];
  for (const ball of balls.filter(b => legal.includes(b.number))) {
    const aims = clearPath(cue, ball, balls, [0, ball.number]) ? [ball] : [];
    for (const [axis, wall] of walls) {
      const p = bouncePoint(cue, ball, axis, wall);
      if (p && clearPath(cue, p, balls, [0, ball.number]) && clearPath(p, ball, balls, [0, ball.number])) aims.push(p);
    }
    for (const aim of aims) {
      const d = distance(cue, aim);
      const pocket = pockets.reduce((best, p, i) => distance(ball, p) < distance(ball, pockets[best]) ? i : best, 0);
      options.push({ dir: { x: (aim.x - cue.x) / d, y: (aim.y - cue.y) / d }, speed: 70, target: ball.number, pocket });
    }
  }
  return options;
}
export function placements(balls, legal) {
  const options = [];
  for (const ball of balls.filter(b => legal.includes(b.number))) for (const p of pockets) for (const gap of [4, 8, 14]) {
    const d = distance(ball, p), position = { x: ball.x + (ball.x - p.x) / d * gap, y: ball.y + (ball.y - p.y) / d * gap };
    if (!canPlace(position, balls)) continue;
    const placed = [{ number: 0, ...position }, ...balls.filter(b => b.number !== 0)];
    const shot = potOptions(placed, legal)[0];
    if (shot) options.push({ ...shot, position });
  }
  // Keep different target/pocket combinations instead of filling the search with one easy pot.
  const seen = new Set();
  return options.sort((a, b) => b.score - a.score).filter(s => {
    const key = `${s.target}:${s.pocket}`; if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, 12);
}
export function variation(shot, angle = 0, power = 1, spin = shot.spin) {
  const a = Math.atan2(shot.dir.y, shot.dir.x) + angle;
  return { ...shot, dir: { x: Math.cos(a), y: Math.sin(a) }, speed: Math.min(MAX_SPEED, Math.max(8, shot.speed * power)), spin: spin || { x: 0, y: 0 } };
}
function value(result, previous, shot) {
  if (!result.settled) return -100000;
  if (result.state.winner !== null) return result.state.winner === previous.turn ? 100000 : -100000;
  if (result.rerack || result.state.ballInHand) return -20000;
  const legal = targets(previous), ownPots = result.report.pocketed.filter(p => legal.includes(p.number)).length;
  const next = potOptions(result.balls, targets(result.state));
  const cue = result.balls.find(b => b.number === 0);
  if (result.state.turn === previous.turn && ownPots > 0) return 4000 + ownPots * 1200 + (next[0]?.score ?? -40) * 5 - Math.hypot(cue.x / P.HW, cue.y / P.HH) * 12;
  // A legal safety should leave few pots and a long or obstructed first contact.
  const opponent = result.balls.filter(b => targets(result.state).includes(b.number));
  const contact = opponent.filter(b => clearPath(cue, b, result.balls, [0, b.number]));
  const target = result.balls.find(b => b.number === shot.target);
  const nearPocket = target && shot.pocket !== null ? distance(target, pockets[shot.pocket]) : 0;
  return -(next[0]?.score ?? -30) * 8 - next.length * 25 + (contact.length ? Math.min(...contact.map(b => distance(cue, b))) : 250) - nearPocket;
}
export function hardComputerShot(balls, state, liveTable, onPreview, { maxMs = Infinity, maxSimulations = Infinity, solo = false } = {}) {
  const table = liveTable || practiceTable(balls), legal = targets(state), evaluated = [], seen = new Set();
  let lastPreview = -Infinity, simulations = 0;
  const deadline = performance.now() + maxMs;
  const available = () => simulations < maxSimulations && performance.now() < deadline;
  const simulate = (t, before, shot, preview = false) => { simulations++; return simulateShot(t, before, shot, preview, { solo }); };
  const evaluate = shot => {
    if (!available() && evaluated.length) return;
    const key = JSON.stringify([shot.dir, shot.speed, shot.spin, shot.position, shot.pocket]);
    if (seen.has(key)) return; seen.add(key);
    const now = performance.now(), preview = !!onPreview && now - lastPreview >= 100;
    if (preview) lastPreview = now;
    const result = simulate(table, state, shot, preview), entry = { shot, result, score: value(result, state, shot) };
    if (preview) {
      onPreview({ target: shot.target, pocket: shot.pocket, paths: result.paths });
      delete result.paths;
    }
    evaluated.push(entry); return entry;
  };
  let fallbackBalls = balls, position;
  if (state.ballInHand) {
    const cue = balls.find(b => b.number === 0);
    if (canPlace(cue, balls)) position = { x: cue.x, y: cue.y };
    else for (let x = -P.HW + 2 * P.R; x < P.HW && !position; x += 3 * P.R)
      for (let y = -P.HH + 2 * P.R; y < P.HH && !position; y += 3 * P.R) if (canPlace({ x, y }, balls)) position = { x, y };
    if (!position) throw new Error('No legal cue-ball placement');
    fallbackBalls = [{ number: 0, ...position }, ...balls.filter(b => b.number !== 0)];
  }
  const fallback = { ...computerShot(fallbackBalls, state, 'hard', () => 0.5), ...(position && { position }) };
  if (state.breaking) {
    // Strong legal breaks at several powers; the cue starts where it does for a human.
    for (const speed of [270, 320, 370, MAX_SPEED]) for (const angle of [0, -0.012, 0.012])
      evaluate(variation({ ...fallback, speed }, angle));
  } else {
    const direct = state.ballInHand ? placements(balls, legal) : potOptions(balls, legal).slice(0, 18);
    for (const shot of direct) for (const power of [0.8, 1, 1.25]) evaluate(variation(shot, 0, power));
    if (!state.ballInHand) for (const shot of bankOptions(balls, legal).slice(0, 10)) for (const power of [0.85, 1.1]) evaluate(variation(shot, 0, power));
    evaluate(variation(fallback));
    const best = evaluated.toSorted((a, b) => b.score - a.score).slice(0, 6);
    for (const { shot } of best) {
      const angles = table.blackHoleGravity ? [-0.08, -0.04, -0.02, -0.012, -0.006, -0.0025, 0.0025, 0.006, 0.012, 0.02, 0.04, 0.08] : [-0.012, -0.006, -0.0025, 0.0025, 0.006, 0.012];
      for (const angle of angles) evaluate(variation(shot, angle));
      for (const spin of [{ x: 0, y: -0.35 }, { x: 0, y: 0.35 }, { x: -0.3, y: 0 }, { x: 0.3, y: 0 }]) evaluate(variation(shot, 0, 1, spin));
    }
    if (!evaluated.some(e => e.score >= 4000)) {
      for (const option of contactOptions(fallbackBalls, legal).slice(0, 10)) for (const angle of [-0.06, 0, 0.06]) for (const power of [0.5, 1.2]) evaluate(variation({ ...option, ...(position && { position }) }, angle, power));
    }
  }
  // Check the next shot from promising leaves: do not trade a run-out for a slightly easier pot.
  const finalists = evaluated.toSorted((a, b) => b.score - a.score).slice(0, 4);
  for (const entry of finalists) {
    const { result, shot } = entry;
    if (available() && entry.score >= 4000 && entry.score < 100000 && !result.respot.length) {
      const nextTable = practiceTable(result.balls, table);
      let continuation = -1000;
      for (const next of potOptions(result.balls, targets(result.state)).slice(0, 5)) {
        if (!available()) break;
        const attempt = simulate(nextTable, result.state, variation(next));
        continuation = Math.max(continuation, value(attempt, result.state, next));
      }
      entry.score += Math.max(-500, Math.min(1800, continuation * 0.2));
    }
    // Prefer a shot with margin over one that only works at a single exact angle.
    for (const angle of [-0.0007, 0.0007]) {
      if (!available()) break;
      const perturbed = simulate(table, state, variation(shot, angle));
      const score = value(perturbed, state, shot);
      if (score < -10000) entry.score -= 3000;
      else if (entry.score >= 4000 && score < 4000) entry.score -= 1200;
    }
  }
  const best = finalists.sort((a, b) => b.score - a.score)[0];
  return { ...best.shot, evaluated: simulations, expected: { pocketed: best.result.report.pocketed, foul: best.result.state.ballInHand || best.result.rerack } };
}

// Easy and Medium keep their geometric choice and execution error, but rehearse
// nearby angles/powers to compensate for gravity. No run-out or trick search.
export function gravityComputerShot(balls, state, table, difficulty, onPreview, random = Math.random) {
  let position, placed = balls;
  if (state.ballInHand) {
    position = computerPlacement(balls, state, p => canPlace(p, balls));
    if (!position) for (let x = -P.HW + 2 * P.R; x < P.HW && !position; x += 3 * P.R)
      for (let y = -P.HH + 2 * P.R; y < P.HH && !position; y += 3 * P.R) if (canPlace({ x, y }, balls)) position = { x, y };
    if (!position) throw new Error('No legal cue-ball placement');
    placed = balls.map(b => b.number === 0 ? { ...b, ...position } : b);
  }
  const base = { ...computerShot(placed, state, difficulty, () => 0.5), ...(position && { position }) };
  let best, simulations = 0;
  const evaluate = shot => {
    const result = simulateShot(table, state, shot), score = value(result, state, shot);
    simulations++;
    if (!best || score > best.score) best = { shot, score };
  };
  evaluate(base);
  for (const angle of [-0.16, -0.12, -0.08, -0.04, -0.02, 0, 0.02, 0.04, 0.08, 0.12, 0.16])
    for (const power of [0.85, 1, 1.25, 1.5]) evaluate(variation(base, angle, power));
  const coarse = best.shot;
  for (const angle of [-0.01, -0.005, 0.005, 0.01]) evaluate(variation(coarse, angle));
  const shot = executionError(best.shot, difficulty, random);
  if (onPreview) {
    const result = simulateShot(table, state, shot, true);
    onPreview({ target: shot.target, pocket: shot.pocket, paths: result.paths });
  }
  return { ...shot, evaluated: simulations };
}
