// Reproducible layouts and visits used for difficulty calibration, separate from gameplay.
import { newMatch } from '../src/eight-ball.js';
import { computerShot } from '../src/computer.js';
import { hardComputerShot } from '../src/hard-computer.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
export const seededRandom = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
export function endgameLayouts(seed, count) {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const balls = [];
    for (const number of [0, 1, 2, 3, 8, 9, 10, 11]) {
      let ball;
      do { ball = { number, x: (random() - 0.5) * 66, y: (random() - 0.5) * 28 }; }
      while (balls.some(b => Math.hypot(b.x - ball.x, b.y - ball.y) < 3));
      balls.push(ball);
    }
    return balls;
  });
}
export function playVisit(initial, difficulty, seed) {
  const random = seededRandom(seed);
  let balls = initial, state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'], down: [4, 5, 6, 7, 12, 13, 14, 15] };
  let shots = 0, pots = 0, fouls = 0;
  while (shots < 5 && state.turn === 1 && state.winner === null) {
    const shot = difficulty === 'hard' ? hardComputerShot(balls, state) : computerShot(balls, state, difficulty, random);
    const result = simulateShot(practiceTable(balls), state, shot);
    shots++; pots += result.report.pocketed.filter(p => p.number >= 1 && p.number <= 8).length;
    fouls += Number(result.state.ballInHand || result.rerack);
    balls = result.balls; state = result.state;
  }
  return { shots, pots, fouls, runouts: Number(state.winner === 1), visits: 1 };
}
