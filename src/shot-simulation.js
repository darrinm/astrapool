// Hard's practice table uses the same Rapier world, timestep and rules as a real shot.
import RAPIER from '@dimforge/rapier3d-compat';
import { P, pocketCenters, ballBody, feltCollider, cushionColliders, pocketWellColliders, backstopColliders, feltExtras, strike } from '../physics/poolphysics.js';
import { shotRecord, resolveShot, resolveSoloShot } from './eight-ball.js';
import { ArcadeEvents, EVENT } from './arcade-events.js';
import { blackHoleGravity } from '../physics/black-hole-gravity.js';
const pockets = pocketCenters();
const zero = { x: 0, y: 0, z: 0 };
export function practiceTable(balls, { blackHoleGravity = false } = {}) {
  const world = new RAPIER.World({ x: 0, y: 0, z: -P.G }); world.timestep = 1 / 480;
  try {
    feltCollider(world, 0); const cushions = cushionColliders(world, 0, true).map(c => c.handle);
    pocketWellColliders(world, 0); backstopColliders(world, 0);
    const handles = balls.map(b => ({ number: b.number, handle: ballBody(world, b.x, b.y, P.R, true).handle }));
    for (let i = 0; i < 120; i++) world.step();
    return { snapshot: world.takeSnapshot(), handles, cushions, feltZ: 0, blackHoleGravity };
  } finally { world.free(); }
}
export function simulateShot(...args) {
  const simulation = simulateShotSteps(...args);
  let next;
  do { next = simulation.next(); } while (!next.done);
  return next.value;
}

// Yielding never advances or changes physics. Interactive workers can abandon
// an obsolete shot between batches; return() still frees the restored world.
export function* simulateShotSteps(table, state, shot, trace = false, { arcade = false, solo = false, aimPreview = false, yieldEvery = 0, maxCueBounces = Infinity } = {}) {
  const world = RAPIER.World.restoreSnapshot(table.snapshot), queue = new RAPIER.EventQueue(true);
  try {
    const balls = table.handles.map(b => ({ number: b.number, body: world.getRigidBody(b.handle) }));
    const bodies = balls.map(b => b.body), cue = balls.find(b => b.number === 0).body;
    const byNumber = new Map(balls.map(b => [b.number, b.body]));
    const numbers = new Map(balls.map(b => [b.body.collider(0).handle, b.number])), cushions = new Set(table.cushions);
    const report = shotRecord(shot.pocket), below = new Map();
    const ballZ = table.feltZ + P.R;
    const tracker = arcade ? new ArcadeEvents() : null, beforeMotion = new Map();
    const railIds = new Map(table.cushions.map((handle, i) => [handle, i]));
    if (shot.position) {
      cue.setTranslation({ ...shot.position, z: ballZ }, true);
      cue.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      cue.setLinvel(zero, true); cue.setAngvel(zero, true);
    }
    // Read a bounded trace without running a second shot or changing its physics.
    // Player aim retains longer paths; computer search uses shorter samples.
    const paths = trace ? balls.filter(b => arcade || b.number === 0 || !aimPreview && b.number === shot.target).map(b => ({ number: b.number, points: [], bounces: [], body: b.body, ended: false })) : null;
    const initial = aimPreview ? new Map(balls.map(b => [b.number, b.body.translation()])) : null;
    const sample = () => {
      for (const path of paths) {
        if (path.ended) continue;
        const p = path.body.translation(), previous = path.points.at(-1);
        if (!path.body.isEnabled() || p.z < table.feltZ || Math.abs(p.x) > P.HW + P.CUSH || Math.abs(p.y) > P.HH + P.CUSH) { path.ended = true; continue; }
        if (path.points.length >= (aimPreview ? 2048 : 96)) { path.ended = true; continue; }
        if (!previous || Math.hypot(p.x - previous.x, p.y - previous.y) > 0.2) path.points.push({ x: p.x, y: p.y });
      }
    };
    if (paths) sample();
    tracker?.add(EVENT.launch, 0, 0);
    tracker?.sample(0, cue.translation());
    strike(cue, shot.dir, shot.speed, shot.spin);
    let still = 0, settled = false;
    for (let step = 0; step < 480 * 24; step++) {
      if (yieldEvery && step > 0 && step % yieldEvery === 0) yield;
      let traceContact = false, cueBounce = false;
      queue.drainCollisionEvents((a, b, started) => {
        if (!started) return;
        const na = numbers.get(a), nb = numbers.get(b);
        if (aimPreview && (na === 0 && (nb > 0 || cushions.has(b)) || nb === 0 && (na > 0 || cushions.has(a)))) cueBounce = true;
        if (paths && (aimPreview || arcade || na === 0 || nb === 0 || na === shot.target || nb === shot.target)) traceContact = true;
        if (tracker) {
          if (na !== undefined && nb !== undefined) tracker.hit(step, na, nb, beforeMotion.get(na), beforeMotion.get(nb), byNumber.get(na).linvel(), byNumber.get(nb).linvel());
          const n = cushions.has(a) ? nb : cushions.has(b) ? na : undefined;
          if (n !== undefined) {
            const p = byNumber.get(n).translation();
            if (!pockets.some(hole => Math.hypot(p.x - hole.x, p.y - hole.y) < P.POCKET_R * 2.2)) tracker.add(EVENT.rail, step, n, railIds.get(cushions.has(a) ? a : b));
          }
        }
        if (report.first === null) {
          if (na === 0 && nb > 0) report.first = nb;
          if (nb === 0 && na > 0) report.first = na;
        }
        if (aimPreview && paths?.length === 1 && report.first !== null) {
          const number = report.first, p = initial.get(number);
          paths.push({ number, body: byNumber.get(number), points: [{ x: p.x, y: p.y }], ended: false });
        }
        if (report.first !== null) {
          const n = cushions.has(a) ? nb : cushions.has(b) ? na : undefined;
          if (n !== undefined && !report.rails.includes(n)) report.rails.push(n);
        }
      });
      if (cueBounce && paths) {
        const path = paths[0], p = cue.translation();
        if (!path.ended && path.points.length < 2048) {
          path.points.push({ x: p.x, y: p.y });
          path.bounces.push(path.points.length - 1);
        }
      }
      if (paths && (step % (aimPreview ? 8 : 16) === 0 || traceContact)) sample();
      // A bounded look-ahead ends at the next impact after the allowed bounces.
      // This is a truncated trajectory, so no ball receives a resting marker.
      if (aimPreview && cueBounce && paths[0].bounces.length > maxCueBounces) break;
      if (tracker) for (const { number, body } of balls) {
        const p = body.translation();
        if (body.isEnabled() && p.z >= table.feltZ) tracker.sample(number, p);
      }
      feltExtras(bodies, world.timestep, ballZ);
      if (table.blackHoleGravity) blackHoleGravity(bodies, byNumber.get(8), world.timestep, ballZ);
      for (const { number, body } of balls) {
        if (!body.isEnabled()) continue;
        const p = body.translation(), down = p.z < table.feltZ - 1.5;
        if (down || Math.abs(p.x) > P.HW + P.CUSH || Math.abs(p.y) > P.HH + P.CUSH) {
          if (!below.has(number)) below.set(number, step);
          if (step - below.get(number) > 0.6 * 480) {
            if (down) {
              const pocket = pockets.reduce((best, q, i) => Math.hypot(p.x - q.x, p.y - q.y) < Math.hypot(p.x - pockets[best].x, p.y - pockets[best].y) ? i : best, 0);
              report.pocketed.push({ number, pocket }); tracker?.pot(step, number, pocket);
            } else { report.offTable.push(number); tracker?.pot(step, number, 0, true); }
            body.setEnabled(false); below.delete(number);
          }
        } else below.delete(number);
      }
      const stopped = !below.size && balls.every(({ body }) => {
        if (!body.isEnabled()) return true;
        const v = body.linvel(); return Math.hypot(v.x, v.y, v.z) < 0.3;
      });
      still = stopped ? still + 1 : 0;
      if (still >= 120) { settled = true; break; }
      if (tracker) for (const { number, body } of balls) {
        const p = body.translation(), v = body.linvel();
        beforeMotion.set(number, { x: p.x, y: p.y, vx: v.x, vy: v.y });
      }
      world.step(queue);
    }
    // A stop marker needs the actual final centre, not the last periodic sample.
    // Only show one when the full simulation settled and the ball remains on the cloth.
    if (aimPreview && paths) for (const path of paths) {
      const p = path.body.translation();
      path.stopped = settled && !path.ended && path.body.isEnabled() && p.z >= table.feltZ;
      if (path.stopped) path.points.push({ x: p.x, y: p.y });
    }
    const ballsAfter = balls.filter(b => b.body.isEnabled()).map(b => ({ number: b.number, x: b.body.translation().x, y: b.body.translation().y }));
    return { ...(solo ? resolveSoloShot : resolveShot)(state, report), report, balls: ballsAfter, settled,
      ...(tracker && { evidence: tracker.evidence(), arcade: tracker.report() }),
      ...(paths && { paths: paths.map(({ number, points, stopped, bounces }) => ({ number, points, ...(aimPreview && { stopped, bounces: bounces || [] }) })) }) };
  } finally { queue.free(); world.free(); }
}
