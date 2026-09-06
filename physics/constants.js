// Geometry and material constants, usable without loading the physics engine.
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

export function pocketCenters() {
  const { HW, HH } = P;
  return [[-HW + 0.1, HH - 0.1], [0, HH + 0.8], [HW - 0.1, HH - 0.1], [-HW + 0.1, -HH + 0.1], [0, -HH - 0.8], [HW - 0.1, -HH + 0.1]].map(([x, y]) => ({ x, y }));
}

