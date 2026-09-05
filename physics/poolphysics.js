// Pool table physics shared by the game scene and the validation harness (physics/validate.mjs).
// Everything here is plain physics: no rendering, no DOM. Units: 1 unit = 26 mm, 1 head = a 57 mm ball.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const P = {
  R: 1.1, G: 377,
  MU_ROLL: 0.012,      // rolling resistance (cloth)
  MU_SLIDE: 0.2,       // ball-cloth kinetic friction
  MU_BALL: 0.05,       // ball-ball friction (throw)
  E_BALL: 0.95, E_CUSHION: 0.85,
  MU_CUSHION: 0.5,           // ball-cushion friction; high because the real contact is long and compliant and kills most incoming spin
  SPIN_DECEL: 10,      // rad/s^2, spin about the table normal
  HW: 39, HH: 19.5,    // half length / width of the playing surface
  RAIL_H: 1.6, CUSH: 1.0,
  NOSE_H: 1.3,               // cushion nose height above the felt (59% of the ball diameter; real tables ~63%, but the rigid ridge misbehaves on slow balls above ~1.3)
  UNDERCUT: 0.4,             // how far the cushion face recedes below the nose
  POCKET_R: 1.65,
  WELL_DEPTH: 6,             // pocket well depth below the felt
  REST_V: 0.12, REST_W: 0.25,
};
export const RULES = () => ({ friction: RAPIER.CoefficientCombineRule.Max, restitution: RAPIER.CoefficientCombineRule.Min });

export function pocketCenters() {
  const { HW, HH } = P;
  return [[-HW + 0.1, HH - 0.1], [0, HH + 0.8], [HW - 0.1, HH - 0.1], [-HW + 0.1, -HH + 0.1], [0, -HH - 0.8], [HW - 0.1, -HH + 0.1]].map(([x, y]) => ({ x, y }));
}

// The felt outline with pocket holes (used for both the visual slab and the trimesh collider).
export function tableShape(withHoles = true) {
  const { HW, HH, CUSH, POCKET_R } = P, RAIL_W = 3.2;
  const s = new THREE.Shape();
  const ox = HW + RAIL_W + CUSH, oy = HH + RAIL_W + CUSH;
  s.moveTo(-ox, -oy); s.lineTo(ox, -oy); s.lineTo(ox, oy); s.lineTo(-ox, oy); s.closePath();
  if (withHoles) for (const p of pocketCenters()) { const h = new THREE.Path(); h.absarc(p.x, p.y, POCKET_R, 0, Math.PI * 2, true); s.holes.push(h); }
  return s;
}

// Felt collider: a flat triangle mesh at feltZ with the pocket holes. Returns the collider.
export function feltCollider(world, feltZ, withHoles = true) {
  const flat = new THREE.ShapeGeometry(tableShape(withHoles), 40);
  const pos = flat.attributes.position, verts = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { verts[i * 3] = pos.getX(i); verts[i * 3 + 1] = pos.getY(i); verts[i * 3 + 2] = feltZ; }
  const flags = (RAPIER.TriMeshFlags && RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES) || 0;
  const rules = RULES();
  return world.createCollider(RAPIER.ColliderDesc.trimesh(verts, new Uint32Array(flat.index.array), flags)
    .setFriction(P.MU_SLIDE).setRestitution(0).setFrictionCombineRule(rules.friction).setRestitutionCombineRule(rules.restitution));
}

// Cushion polygons in table coordinates (nose on the playing line, ends angled into the pockets).
export function cushionPolygons() {
  const { HW, HH, CUSH, POCKET_R } = P;
  const jc = POCKET_R * 1.15, js = POCKET_R * 1.25, jawC = CUSH * 1.3, jawS = CUSH * 0.8;
  const polys = [];
  for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
    const b0 = js - 0.6, b1 = HW - jc + 0.6, n0 = js + jawS, n1 = HW - jc - jawC;
    polys.push([[sx * b0, sy * (HH + CUSH)], [sx * n0, sy * HH], [sx * n1, sy * HH], [sx * b1, sy * (HH + CUSH)]]);
  }
  for (const sx of [-1, 1]) {
    const b = HH - jc + 0.6, n = HH - jc - jawC;
    polys.push([[sx * (HW + CUSH), -b], [sx * HW, -n], [sx * HW, n], [sx * (HW + CUSH), b]]);
  }
  return polys;
}
// Cushion collider: a prism whose cross-section is a real cushion profile. The nose (the polygon's playing-line
// edge) is a ridge at NOSE_H, above the ball's centre; below it the face recedes toward the rail (UNDERCUT), and
// above it the face slopes back to the rail top. A ball therefore contacts the nose only, and the contact normal
// tilts slightly downward: hard shots get pressed into the felt, and topspin dies into a rail as it does for real.
export function cushionColliders(world, feltZ, events = false) {
  const rules = RULES(), out = [];
  for (const pts of cushionPolygons()) {
    // pts: [back0, nose0, nose1, back1]; the back edge is against the rail wood
    const [b0, n0, n1, b1] = pts;
    const recede = (n, b, d) => { const dx = b[0] - n[0], dy = b[1] - n[1], L = Math.hypot(dx, dy); return [n[0] + (dx / L) * d, n[1] + (dy / L) * d]; };
    const u0 = recede(n0, b0, P.UNDERCUT), u1 = recede(n1, b1, P.UNDERCUT);
    const v = [];
    for (const [x, y] of [b0, b1]) { v.push(x, y, feltZ); v.push(x, y, feltZ + P.RAIL_H); }   // back face, full height
    for (const [x, y] of [n0, n1]) v.push(x, y, feltZ + P.NOSE_H);                            // nose ridge
    for (const [x, y] of [u0, u1]) v.push(x, y, feltZ);                                       // undercut foot
    const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(v));
    if (!desc) continue;
    desc.setRestitution(P.E_CUSHION).setFriction(P.MU_CUSHION).setFrictionCombineRule(rules.friction).setRestitutionCombineRule(rules.restitution);
    if (events) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    out.push(world.createCollider(desc));
  }
  return out;
}

// Pocket well: a ring of wall segments and a bottom, all stopping 1.2 below the felt so a ball rolling over the
// hole edge never clips them. On the rail side of each hole a pocket back (the leather casting) rises to rail
// height and leans over the hole by CASTING_LEAN: a fast ball that skips across the hole meets it and is turned
// downward into the well instead of landing under the rail wood or rattling straight back out. `events` tags
// the bottom so a drop can be heard. Returns the colliders.
export const CASTING_LEAN = 15 * Math.PI / 180;
export function pocketWellColliders(world, feltZ, events = false) {
  const { HW, HH, CUSH, RAIL_H, POCKET_R, WELL_DEPTH } = P, rules = RULES(), out = [];
  const soft = (d, e, f) => d.setRestitution(e).setFriction(f).setFrictionCombineRule(rules.friction).setRestitutionCombineRule(rules.restitution);   // leather over wood: dead
  const zAxis = new THREE.Vector3(0, 0, 1), yAxis = new THREE.Vector3(0, 1, 0);
  for (const p of pocketCenters()) {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2, wr = POCKET_R + 0.35, ca = Math.cos(a), sa = Math.sin(a), hy = wr * 0.34;
      const qz = new THREE.Quaternion().setFromAxisAngle(zAxis, a);
      out.push(world.createCollider(soft(RAPIER.ColliderDesc.cuboid(0.25, hy, (WELL_DEPTH - 1.2) / 2)
        .setTranslation(p.x + ca * wr, p.y + sa * wr, feltZ - 1.2 - (WELL_DEPTH - 1.2) / 2).setRotation(qz), 0.2, 0.6)));
      const cx = p.x + ca * wr, cy = p.y + sa * wr;
      if (!(Math.abs(cx) > HW + CUSH || Math.abs(cy) > HH + CUSH)) continue;   // playing side: no back
      // casting: from the well wall top up to above the rail, leaning inward (local +x is radially outward)
      const top = feltZ + RAIL_H + 0.6, bottom = feltZ - 1.2, hz = (top - bottom) / 2, cz = (top + bottom) / 2;
      const th = CASTING_LEAN, faceR = wr;   // inner face passes through radius `faceR` at felt level
      const zl = (feltZ - cz + 0.25 * Math.sin(th)) / Math.cos(th);           // local z of the inner-face point at felt level
      const rc = faceR + 0.25 * Math.cos(th) + zl * Math.sin(th);             // radial position of the cuboid centre
      const q = qz.clone().multiply(new THREE.Quaternion().setFromAxisAngle(yAxis, -th));
      out.push(world.createCollider(soft(RAPIER.ColliderDesc.cuboid(0.25, hy, hz).setTranslation(p.x + ca * rc, p.y + sa * rc, cz).setRotation(q), 0.2, 0.6)));
    }
    const w = POCKET_R + 0.6;
    const desc = soft(RAPIER.ColliderDesc.cuboid(w, w, 0.3).setTranslation(p.x, p.y, feltZ - WELL_DEPTH - 0.3), 0.15, 0.8);
    if (events) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    out.push(world.createCollider(desc));
  }
  return out;
}

// Backstop around the whole table so nothing leaves the area even on a jump.
export function backstopColliders(world, feltZ) {
  const { HW, HH, CUSH } = P, RAIL_W = 3.2, ox = HW + CUSH + RAIL_W, oy = HH + CUSH + RAIL_W, out = [];
  const add = (hx, hy, x, y) => out.push(world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, 8).setTranslation(x, y, feltZ + 4).setRestitution(0).setFriction(1)));
  add(ox + 4, 1, 0, oy + 1); add(ox + 4, 1, 0, -oy - 1); add(1, oy + 4, ox + 1, 0); add(1, oy + 4, -ox - 1, 0);
  return out;
}

export function ballBody(world, x, y, ballZ, events = false) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, ballZ).setLinearDamping(0).setAngularDamping(0.02).setCcdEnabled(true));
  const desc = RAPIER.ColliderDesc.ball(P.R).setRestitution(P.E_BALL).setFriction(P.MU_BALL).setDensity(1);
  if (events) desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
  world.createCollider(desc, body);
  return body;
}

// Cue strike: impulse along `dir` (unit, in the table plane) applied at a point offset by the spin selection
// (spin.x = side, shooter's right positive; spin.y = above/below centre) in units of the ball radius.
export function strike(body, dir, speed, spin = { x: 0, y: 0 }) {
  const c = body.translation(), m = body.mass(), R = P.R;
  const right = { x: dir.y, y: -dir.x };
  const point = { x: c.x + right.x * spin.x * R, y: c.y + right.y * spin.x * R, z: c.z + spin.y * R };
  body.applyImpulseAtPoint({ x: dir.x * speed * m, y: dir.y * speed * m, z: 0 }, point, true);
}

// Per-step extras Rapier does not model: rolling resistance once rolling, friction against spin about the
// table normal, and a clean stop when nearly still. `ballZ` is the resting centre height; balls below it
// (falling into a pocket) are left alone.
export function feltExtras(bodies, dt, ballZ) {
  const { R, G, MU_ROLL, SPIN_DECEL, REST_V, REST_W } = P;
  for (const body of bodies) {
    if (!body.isEnabled()) continue;
    const t = body.translation(); if (t.z < ballZ - 0.3) continue;
    const v = body.linvel(), w = body.angvel(), speed = Math.hypot(v.x, v.y);
    if (Math.abs(w.z) > 0) {
      const dz = Math.min(Math.abs(w.z), SPIN_DECEL * dt) * Math.sign(w.z);
      body.setAngvel({ x: w.x, y: w.y, z: w.z - dz }, true); w.z -= dz;
    }
    const slip = Math.hypot(v.x - R * w.y, v.y + R * w.x);
    if (speed < REST_V && Math.hypot(w.x, w.y) < REST_W && Math.abs(w.z) < 0.5) { body.setLinvel({ x: 0, y: 0, z: v.z }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); continue; }
    if (speed > 0 && slip < 0.8) {
      // Rolling resistance acts on the whole rolling state: slow the velocity and the rolling spin together,
      // otherwise the felt converts the untouched spin back into speed and only 5/7 of the deceleration lands.
      const a = Math.min(MU_ROLL * G, speed / dt), k = (speed - a * dt) / speed;
      body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z }, true);
      body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z }, true);
    }
  }
}
export const slipSpeed = (body) => { const v = body.linvel(), w = body.angvel(); return Math.hypot(v.x - P.R * w.y, v.y + P.R * w.x); };
