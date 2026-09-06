import { P, pocketCenters } from '../physics/constants.js';
const { R, HW, HH, POCKET_R } = P;
const pockets = pocketCenters();
export function rackPositions() {
  const numbers = [1, 2, 3, 4, 8, 5, 6, 11, 9, 10, 7, 12, 13, 14, 15];
  const balls = [{ number: 0, x: -HW * 0.5, y: 0 }];
  let j = 0;
  for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++)
    balls.push({ number: numbers[j++], x: HW * 0.5 + row * R * 1.74, y: (k - row / 2) * R * 2.01 });
  return balls;
}
export function canPlace(p, balls, number = 0) {
  return Number.isFinite(p?.x) && Number.isFinite(p?.y) && Math.abs(p.x) < HW - R && Math.abs(p.y) < HH - R &&
    !pockets.some(h => Math.hypot(p.x - h.x, p.y - h.y) < POCKET_R + R) &&
    !balls.some(b => b.number !== number && Math.hypot(p.x - b.x, p.y - b.y) < 2 * R + 0.05);
}
