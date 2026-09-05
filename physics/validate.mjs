// Physics validation harness: runs the game's own table physics headless and scores it against closed-form
// results and the geometric rules players rely on. Run: node physics/validate.mjs
import RAPIER from '@dimforge/rapier3d-compat';
import { P, feltCollider, cushionColliders, pocketWellColliders, backstopColliders, pocketCenters, ballBody, strike, feltExtras, slipSpeed } from './poolphysics.js';

await RAPIER.init();
const { R, G, MU_SLIDE, MU_ROLL, E_BALL, E_CUSHION, SPIN_DECEL, HW, HH, CUSH } = P;
const FELT_Z = 0, BALL_Z = R;
const results = [];
function check(name, measured, expected, tol, unit = '') {
  const err = expected === 0 ? Math.abs(measured) : Math.abs(measured - expected) / Math.abs(expected);
  const pass = err <= tol;
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: measured ${fmt(measured)}${unit}, expected ${fmt(expected)}${unit} (±${Math.round(tol * 100)}%)`);
}
function note(name, text) { console.log(`INFO  ${name}: ${text}`); }
const fmt = (x) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(3));

const RATE = Number(process.env.RATE || 480);   // the pool scene steps at 480 Hz; override with RATE=120 to see the coarse-step losses
function makeWorld(dt = 1 / RATE, holes = false) {
  const world = new RAPIER.World({ x: 0, y: 0, z: -G });
  world.timestep = dt;
  feltCollider(world, FELT_Z, holes);
  cushionColliders(world, FELT_Z);
  if (holes) { pocketWellColliders(world, FELT_Z); backstopColliders(world, FELT_Z); }
  return world;
}
function settle(world, bodies, steps = 60) { for (let i = 0; i < steps; i++) { feltExtras(bodies, world.timestep, BALL_Z); world.step(); } }
function run(world, bodies, seconds, onStep) {
  const n = Math.round(seconds / world.timestep);
  for (let i = 0; i < n; i++) { feltExtras(bodies, world.timestep, BALL_Z); world.step(); if (onStep && onStep(i * world.timestep, i) === false) break; }
}
const speed = (b) => { const v = b.linvel(); return Math.hypot(v.x, v.y); };
const dirOf = (b) => { const v = b.linvel(); const s = Math.hypot(v.x, v.y); return s > 1e-6 ? [v.x / s, v.y / s] : [0, 0]; };
const deg = (r) => (r * 180) / Math.PI;
const angleBetween = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))));

// ---------- 1. sliding -> rolling after a centre hit ----------
{
  const world = makeWorld(); const b = ballBody(world, -20, 0, BALL_Z); settle(world, [b]);
  const v0 = 40; strike(b, { x: 1, y: 0 }, v0);
  let tRoll = null, vRoll = null, xStart = b.translation().x;
  run(world, [b], 2, (t) => { if (tRoll === null && slipSpeed(b) < 0.5) { tRoll = t; vRoll = speed(b); return false; } });
  const mu = MU_SLIDE;   // felt (0.2) dominates the pairing via the Max combine rule
  check('slide->roll: speed when rolling begins', vRoll, (5 / 7) * v0, 0.03, ' u/s');
  check('slide->roll: time until rolling', tRoll, (2 * v0) / (7 * mu * G), 0.15, ' s');
  check('slide->roll: distance slid', b.translation().x - xStart, (12 * v0 * v0) / (49 * mu * G), 0.15, ' u');
  const w = b.angvel();
  check('natural roll: angular speed = v/R', w.y, speed(b) / R, 0.03, ' rad/s');
}

// ---------- 2. rolling deceleration and lag distance ----------
{
  const world = makeWorld(); const b = ballBody(world, -30, 0, BALL_Z); settle(world, [b]);
  const v = 20; b.setLinvel({ x: v, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: v / R, z: 0 }, true);   // start already rolling
  const x0 = b.translation().x; let t1 = null, v1 = null;
  run(world, [b], 6, (t) => { if (t >= 0.5 && t1 === null) { t1 = t; v1 = speed(b); } if (speed(b) === 0) return false; });
  const decel = (v - v1) / t1;
  check('rolling deceleration', decel, MU_ROLL * G, 0.1, ' u/s^2');
  check('lag distance from 20 u/s', b.translation().x - x0, (v * v) / (2 * MU_ROLL * G), 0.1, ' u');
}

// ---------- 3. spin about the table normal decays and stops ----------
{
  const world = makeWorld(); const b = ballBody(world, 0, 0, BALL_Z); settle(world, [b]);
  b.setAngvel({ x: 0, y: 0, z: 30 }, true);
  let t1 = null; run(world, [b], 5, (t) => { if (b.angvel().z === 0 && t1 === null) { t1 = t; return false; } });
  check('vertical spin: time to stop from 30 rad/s', t1, 30 / SPIN_DECEL, 0.1, ' s');
}

// ---------- 4. full hit with a stunned cue ball: cue stops, object ball takes the speed ----------
{
  const world = makeWorld(); const cue = ballBody(world, -10, 0, BALL_Z), obj = ballBody(world, 0, 0, BALL_Z); settle(world, [cue, obj]);
  const v = 30; cue.setLinvel({ x: v, y: 0, z: 0 }, true); cue.setAngvel({ x: 0, y: 0, z: 0 }, true);
  let vImpact = v, hit = false, cueAfter = null, objAfter = null;
  run(world, [cue, obj], 1, () => {
    if (!hit) { if (speed(obj) > 1) hit = true; else vImpact = speed(cue); }          // last cue speed before the object moved
    else if (cueAfter === null) { cueAfter = cue.linvel().x; objAfter = obj.linvel().x; return false; }   // the step right after impact
  });
  check('stun full hit: object ball speed = (1+e)/2 v_impact', objAfter, ((1 + E_BALL) / 2) * vImpact, 0.04, ' u/s');
  check('stun full hit: cue ball keeps (1-e)/2 v_impact', cueAfter, ((1 - E_BALL) / 2) * vImpact, 1.0, ' u/s');
  check('collision: momentum conserved', cueAfter + objAfter, vImpact, 0.03, ' u/s');
  check('collision: energy retained = (1+e^2)/2', (cueAfter ** 2 + objAfter ** 2) / (vImpact ** 2), (1 + E_BALL * E_BALL) / 2, 0.05);
}

// ---------- 5. full hit with a rolling cue ball: cue follows at 2/7 of its speed ----------
{
  const world = makeWorld(); const cue = ballBody(world, -10, 0, BALL_Z), obj = ballBody(world, 0, 0, BALL_Z); settle(world, [cue, obj]);
  const v = 30; cue.setLinvel({ x: v, y: 0, z: 0 }, true); cue.setAngvel({ x: 0, y: v / R, z: 0 }, true);
  let hit = false, follow = null, vImpact = v;
  run(world, [cue, obj], 2, (t) => { if (!hit) { if (speed(obj) > 1) hit = true; else vImpact = speed(cue); } if (hit && slipSpeed(cue) < 0.5 && speed(cue) > 0.5 && follow === null) { follow = speed(cue); return false; } });
  // after the hit the cue keeps its topspin (omega = v/R) and (1-e)/2 of its speed; friction brings it to roll at
  // (2/7)(omega R) + (5/7)(residual) = (2/7 + (5/7)(1-e)/2) v
  check('rolling full hit: cue follows (2/7 rule)', follow, (2 / 7 + (5 / 7) * (1 - E_BALL) / 2) * vImpact, 0.1, ' u/s');
}

// ---------- 6. cut shots: 90-degree rule (stun) and 30-degree rule (natural roll, half-ball) ----------
function cutShot(rolling, fraction) {
  const world = makeWorld(); const cue = ballBody(world, -12, 0, BALL_Z), obj = ballBody(world, 0, (1 - fraction) * 2 * R, BALL_Z); settle(world, [cue, obj]);
  const v = 30; cue.setLinvel({ x: v, y: 0, z: 0 }, true); cue.setAngvel({ x: 0, y: rolling ? v / R : 0, z: 0 }, true);
  let hit = false, objDir = null, cueDirEarly = null, cueDirLate = null;
  run(world, [cue, obj], 1.2, (t) => {
    if (!hit && speed(obj) > 1) { hit = true; objDir = dirOf(obj); }
    if (hit && cueDirEarly === null && t > 0 && speed(cue) > 1) cueDirEarly = dirOf(cue);
    if (hit && slipSpeed(cue) < 0.5 && speed(cue) > 1 && cueDirLate === null) { cueDirLate = dirOf(cue); return false; }
  });
  return { objDir, cueDirEarly, cueDirLate };
}
{
  const s = cutShot(false, 0.5);
  const expect90 = 90 - deg(Math.atan(((1 - E_BALL) / 2) * Math.cos(Math.PI / 6) / Math.sin(Math.PI / 6)));   // 87.5 for e = 0.95
  check('half-ball stun: cue leaves along the tangent line (90-degree rule, e-corrected)', angleBetween(s.objDir, s.cueDirEarly), expect90, 0.05, ' deg');
  const geometricLine = angleBetween(s.objDir, [1, 0]);
  check('half-ball: object ball along the line of centres (30 deg)', geometricLine, 30, 0.12, ' deg');
  const r = cutShot(true, 0.5);
  check('half-ball natural roll: cue deflects ~30 deg (30-degree rule)', angleBetween(r.cueDirLate, [1, 0]), 30, 0.2, ' deg');
  const q = cutShot(true, 0.25);
  note('quarter-ball natural roll', `cue deflection ${angleBetween(q.cueDirLate, [1, 0]).toFixed(1)} deg (rule of thumb: 20-35)`);
  const q3 = cutShot(true, 0.75);
  note('three-quarter-ball natural roll', `cue deflection ${angleBetween(q3.cueDirLate, [1, 0]).toFixed(1)} deg (rule of thumb: 20-35)`);
}

// ---------- 7. cushion rebound: angle and speed ----------
for (const v of [12, 40]) {
  const world = makeWorld(); const b = ballBody(world, 0, HH - 6, BALL_Z); settle(world, [b]);
  const a = Math.PI / 4; b.setLinvel({ x: v * Math.cos(a), y: v * Math.sin(a), z: 0 }, true); b.setAngvel({ x: -v * Math.sin(a) / R, y: v * Math.cos(a) / R, z: 0 }, true);
  // The rebound direction is read once the ball rolls again: after the cushion it slides briefly while its old
  // spin bends the path (a real effect), so the first post-contact velocity is not the path the ball takes.
  let vIn = v, dirIn = [Math.cos(a), Math.sin(a)], after = null, vAfter = null, bounced = false;
  run(world, [b], 2, () => {
    if (!bounced) { if (b.linvel().y < 0) bounced = true; else { vIn = speed(b); dirIn = dirOf(b); } }
    else if (after === null && slipSpeed(b) < 0.5) { after = dirOf(b); vAfter = speed(b); return false; }
  });
  const angleIn = deg(Math.atan2(dirIn[1], dirIn[0])), angleOut = deg(Math.atan2(-after[1], after[0]));
  note(`cushion at ${v} u/s`, `in ${angleIn.toFixed(1)} deg, out ${angleOut.toFixed(1)} deg; speed ratio ${(vAfter / vIn).toFixed(2)} (real cushions: out <= in, ratio ~0.6-0.9)`);
  // Real rolling balls rebound a little shorter than the mirror angle (more so when fast): accept 30-45 for 45 in
  check(`cushion rebound at ${v} u/s: final path shorter than incidence but not by more than 15 deg`, angleOut >= angleIn - 15 && angleOut <= angleIn + 2 ? 1 : 0, 1, 0);
  check(`cushion speed ratio at ${v} u/s in the real range (0.6-0.9)`, vAfter / vIn >= 0.6 && vAfter / vIn <= 0.9 ? 1 : 0, 1, 0);
}
// ---------- 7b. cushion nose above centre: contact height, hop, and topspin dying into the rail ----------
{
  const world = makeWorld(); const b = ballBody(world, 15, HH - 5, BALL_Z); settle(world, [b]);
  b.setLinvel({ x: 0, y: 40, z: 0 }, true); b.setAngvel({ x: -40 / R, y: 0, z: 0 }, true);   // rolling straight into the top rail
  let maxZ = BALL_Z, bounced = false, vOut = null;
  run(world, [b], 1.5, () => { maxZ = Math.max(maxZ, b.translation().z); if (!bounced && b.linvel().y < 0) bounced = true; if (bounced && vOut === null && b.translation().y < HH - 4) { vOut = -b.linvel().y; return false; } });
  // the nose pushes a hard shot into the felt rather than launching it; the felt has no restitution, so no hop
  check('cushion nose above centre: a hard straight shot stays on the felt', maxZ - BALL_Z < 0.1 ? 1 : 0, 1, 0);
  const straight = (spinFactor) => {   // rebound speed (away from the rail, once rolling resumes) for a straight shot with spin = factor x rolling
    const w = makeWorld(); const s = ballBody(w, 15, HH - 5, BALL_Z); settle(w, [s]);
    s.setLinvel({ x: 0, y: 25, z: 0 }, true); s.setAngvel({ x: -spinFactor * 25 / R, y: 0, z: 0 }, true);
    let bo = false, out = null;
    run(w, [s], 2, (t) => { if (!bo && s.linvel().y < 0) bo = true; if (bo && out === null && slipSpeed(s) < 0.5) { out = -s.linvel().y; return false; } });
    return out;
  };
  const stun = () => straight(0), top = () => straight(2.5);
  const vStun = stun() ?? 0, vTop = top() ?? 0;   // null = never came back off the rail
  note('topspin into a rail', `rebound speed with heavy topspin ${vTop.toFixed(1)} vs stun ${vStun.toFixed(1)} u/s`);
  // Known deviation: a rigid cushion with one friction value cannot both kill a rolling ball's spin (needed for
  // realistic rebound angles) and let heavy topspin survive the contact (which is what makes follow die into a
  // rail). We tune for the common case, so heavy topspin rebounds livelier than on a real table.
  note('known deviation', `heavy topspin into a rail rebounds ${vTop > vStun ? 'faster' : 'slower'} than a rolling ball here; on a real table it comes off shorter`);
}

// ---------- 8. engine hygiene: timestep sensitivity, tunnelling, determinism ----------
{
  const roll = (dt) => { const world = makeWorld(dt); const b = ballBody(world, -20, 0, BALL_Z); settle(world, [b], Math.round(0.5 / dt)); strike(b, { x: 1, y: 0 }, 40); run(world, [b], 3); return b.translation().x; };
  const x1 = roll(1 / RATE), x2 = roll(1 / (2 * RATE));
  check(`timestep sensitivity: stop position ${RATE} Hz vs ${2 * RATE} Hz`, x2, x1, 0.03, ' u');
  const world = makeWorld(); const b = ballBody(world, 0, 0, BALL_Z); settle(world, [b]);
  b.setLinvel({ x: 150, y: 60, z: 0 }, true); let maxX = 0, maxY = 0; run(world, [b], 3, () => { const t = b.translation(); maxX = Math.max(maxX, Math.abs(t.x)); maxY = Math.max(maxY, Math.abs(t.y)); });
  check('no tunnelling at 160 u/s: stays inside the cushions (x)', maxX < HW + 0.5 ? 1 : 0, 1, 0);
  check('no tunnelling at 160 u/s: stays inside the cushions (y)', maxY < HH + 0.5 ? 1 : 0, 1, 0);
  const a = cutShot(true, 0.5), c = cutShot(true, 0.5);
  check('determinism: identical shots give identical results', a.cueDirLate[0] === c.cueDirLate[0] && a.cueDirLate[1] === c.cueDirLate[1] ? 1 : 0, 1, 0);
}

// ---------- 9. pockets: every entry ends in the well or back on the playing surface, never under the rail ----------
// Sweep shots into all six pockets over speed, aim offset and approach angle. A ball that skips across the hole must
// meet the pocket back and drop; the full-table geometry (holes, wells, backs, backstop) is the game's own.
{
  const outcomes = { well: 0, table: 0, rail: 0 }, bad = [];
  for (const [pi, p] of pocketCenters().entries()) {
    const toCentre = Math.atan2(-p.y, -p.x);   // straight out of the pocket toward the table centre
    for (const speed of [25, 60, 120, 220]) for (const off of [-1.2, 0, 1.2]) for (const dAng of [-35, -15, 0, 15, 35]) {
      const a = toCentre + Math.PI + (dAng * Math.PI) / 180, dir = { x: Math.cos(a), y: Math.sin(a) };   // into the pocket
      const perp = { x: -dir.y, y: dir.x }, dist = 14;
      const sx = p.x - dir.x * dist + perp.x * off, sy = p.y - dir.y * dist + perp.y * off;
      if (Math.abs(sx) > HW - R || Math.abs(sy) > HH - R) continue;   // start must be on the playing surface
      const world = makeWorld(1 / RATE, true); const b = ballBody(world, sx, sy, BALL_Z); settle(world, [b]);
      strike(b, dir, speed); run(world, [b], 3);
      const t = b.translation();
      const where = t.z < FELT_Z - 1.5 ? 'well' : (Math.abs(t.x) > HW + CUSH || Math.abs(t.y) > HH + CUSH) ? 'rail' : 'table';
      outcomes[where]++; if (where === 'rail') bad.push(`pocket ${pi} speed ${speed} off ${off} ang ${dAng} -> (${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(2)})`);
    }
  }
  note('pocket sweep', `${outcomes.well} in the well, ${outcomes.table} back on the table, ${outcomes.rail} under the rail${bad.length ? ': ' + bad.slice(0, 5).join('; ') : ''}`);
  check('pocket sweep: no ball ends under the rail', outcomes.rail, 0, 0);
  const world = makeWorld(1 / RATE, true); const b = ballBody(world, 0, HH - 12, BALL_Z); settle(world, [b]);
  strike(b, { x: 0, y: 1 }, 220); run(world, [b], 2);
  check('fast straight shot into the side pocket (5.7 m/s) drops in', b.translation().z < FELT_Z - 1.5 ? 1 : 0, 1, 0);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? ': ' + failed.map((f) => f.name).join('; ') : ''}`);
process.exit(failed.length ? 1 : 0);
