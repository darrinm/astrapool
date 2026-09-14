import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { endgameLayouts, playVisit, seededRandom } from './computer-benchmark.js';
import { computerShot } from '../src/computer.js';
import { newMatch } from '../src/eight-ball.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
await RAPIER.init();

test('Easy makes straightforward short pots instead of missing indiscriminately', () => {
  const balls = [{ number: 0, x: 0, y: 9 }, { number: 1, x: 0, y: 16 }, { number: 8, x: 24, y: 0 }];
  const state = { ...newMatch(1), breaking: false, groups: ['stripes', 'solids'], down: [2, 3, 4, 5, 6, 7] }, table = practiceTable(balls);
  let pots = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const shot = computerShot(balls, state, 'easy', seededRandom(seed * 1000));
    const result = simulateShot(table, state, shot);
    assert.equal(result.state.ballInHand, false);
    pots += Number(result.report.pocketed.some(p => p.number === 1));
  }
  assert.ok(pots >= 10, `Only ${pots}/12 short pots made`);
});

test('Medium converts more shots and builds longer runs than Easy on shared seeded layouts', () => {
  // Use enough layouts that pocket-geometry changes do not let a few shots dominate the comparison.
  const layouts = endgameLayouts(54321, 24), totals = {};
  for (const difficulty of ['easy', 'medium']) {
    const total = { shots: 0, pots: 0, fouls: 0, runouts: 0, visits: 0 };
    for (const [i, balls] of layouts.entries()) for (let attempt = 0; attempt < 2; attempt++) {
      const visit = playVisit(balls, difficulty, 2000 + i * 10 + attempt);
      for (const key of Object.keys(total)) total[key] += visit[key];
    }
    totals[difficulty] = total;
  }
  const { easy, medium } = totals, detail = JSON.stringify(totals);
  assert.ok(easy.pots / easy.shots > 0.3 && easy.pots / easy.shots < 0.75, detail);
  assert.ok(medium.pots / medium.shots > easy.pots / easy.shots + 0.08, detail);
  assert.ok(medium.pots / medium.visits > easy.pots / easy.visits + 0.4, detail);
  assert.ok(medium.runouts > easy.runouts, detail);
});
