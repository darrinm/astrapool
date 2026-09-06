// Identical endgame starts, same physics, play until the turn ends.
// Randomized levels get four seeded visits per layout; deterministic Hard needs one.
// This measures conversion and run-outs, not a human opponent win rate.
import RAPIER from '@dimforge/rapier3d-compat';
import { endgameLayouts, playVisit } from './computer-benchmark.js';
await RAPIER.init();
const layouts = endgameLayouts(98765, 8), totals = {};
for (const difficulty of ['easy', 'medium', 'hard']) {
  const total = { shots: 0, pots: 0, fouls: 0, runouts: 0, visits: 0 };
  for (const [i, balls] of layouts.entries()) {
    for (let attempt = 0; attempt < (difficulty === 'hard' ? 1 : 4); attempt++) {
      const visit = playVisit(balls, difficulty, 1000 + i * 10 + attempt);
      for (const key of Object.keys(total)) total[key] += visit[key];
    }
    console.log(`${difficulty}: ${i + 1}/${layouts.length} layouts complete`);
  }
  totals[difficulty] = { ...total, potRate: +(total.pots / total.shots).toFixed(3), runoutRate: +(total.runouts / total.visits).toFixed(3), potsPerVisit: +(total.pots / total.visits).toFixed(2) };
  console.log(JSON.stringify({ difficulty, ...totals[difficulty] }));
}
console.table(totals);
