// Deliberately different, repeatable breaks for each trailer scene.
import { rackPositions } from "../../../src/table-state.js";

const profiles = {
  opening: { x: -19.45, y: 0, hit: 0, speed: 310, spin: [0, 0], order: 0 },
  portrait: {
    x: -22,
    y: -10,
    hit: -0.35,
    speed: 295,
    spin: [0.25, 0.3],
    order: 2,
  },
  landscape: {
    x: -25,
    y: 11,
    hit: 0.4,
    speed: 325,
    spin: [-0.4, -0.45],
    order: 4,
  },
  coast: { x: -22, y: -6, hit: 0.65, speed: 280, spin: [0.6, -0.3], order: 6 },
  riad: { x: -26, y: 8, hit: -0.65, speed: 305, spin: [-0.55, 0.5], order: 8 },
  glasshouse: {
    x: -16,
    y: -13,
    hit: 1.05,
    speed: 340,
    spin: [0.2, 0.7],
    order: 10,
  },
  finale: { x: -24, y: 12, hit: -1, speed: 330, spin: [-0.7, -0.65], order: 1 },
};

export function trailerBreak(name) {
  const p = profiles[name];
  if (!p) throw Error(`Unknown trailer break: ${name}`);
  const rack = rackPositions();
  // Keep the 8 in the center and a solid/stripe in the two rear corners.
  const movable = rack
    .filter((b) => ![0, 8, 7, 15].includes(b.number))
    .map((b) => b.number);
  const positions = rack.map((b) =>
    b.number === 0
      ? { ...b, x: p.x, y: p.y }
      : {
          ...b,
          number: movable.includes(b.number)
            ? movable[(movable.indexOf(b.number) + p.order) % movable.length]
            : b.number,
        },
  );
  const dx = rack[1].x - p.x,
    dy = p.hit - p.y,
    length = Math.hypot(dx, dy);
  return {
    positions,
    shot: {
      name: `break-${name}`,
      dir: { x: dx / length, y: dy / length },
      speed: p.speed,
      spin: { x: p.spin[0], y: p.spin[1] },
    },
  };
}
