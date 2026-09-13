// Shared by the live table and every computer practice shot. Units match P.
// Gravity bends moving balls; cloth holds settled balls in place for aiming.
export const BLACK_HOLE_GRAVITY = Object.freeze({ radius: 36, strength: 42, softening: 5 });

export function blackHoleGravity(bodies, eight, dt, ballZ) {
  if (!eight?.isEnabled()) return;
  const center = eight.translation();
  if (center.z < ballZ - 0.3) return;
  const { radius, strength, softening } = BLACK_HOLE_GRAVITY;
  for (const body of bodies) {
    if (!body?.isEnabled() || body === eight || body.isSleeping()) continue;
    const p = body.translation();
    if (p.z < ballZ - 0.3) continue;
    const dx = center.x - p.x, dy = center.y - p.y, distance = Math.hypot(dx, dy);
    if (distance < 0.001 || distance >= radius) continue;
    const v = body.linvel(), speed = Math.hypot(v.x, v.y);
    // Fade below rolling speed, with zero force below the shot-settlement
    // threshold. This prevents perpetual orbits or a fresh pull between turns.
    const motion = Math.min(1, Math.max(0, (speed - 0.3) / 8));
    if (!motion) continue;
    const acceleration = strength * (1 - distance / radius) ** 2 / (1 + (distance / softening) ** 2);
    const impulse = acceleration * motion * dt * body.mass() / distance;
    body.applyImpulse({ x: dx * impulse, y: dy * impulse, z: 0 }, false);
  }
}
