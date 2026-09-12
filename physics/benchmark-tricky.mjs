// Identical solo layouts and per-shot search budgets. Truncated runs are reported
// separately from completed racks, so a high score cannot hide stalled play.
import RAPIER from '@dimforge/rapier3d-compat';
import { endgameLayouts } from './computer-benchmark.js';
import { newMatch } from '../src/eight-ball.js';
import { newArcade, scoreArcade, commitArcade } from '../src/arcade-score.js';
import { hardComputerShot } from '../src/hard-computer.js';
import { trickyComputerShot } from '../src/tricky-computer.js';
import { practiceTable, simulateShot } from '../src/shot-simulation.js';
import { canPlace } from '../src/table-state.js';
import { P } from './constants.js';

await RAPIER.init();
const argument = (name, fallback) => Number(process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] || fallback);
const count = argument('racks', 4), maxShots = argument('shots', 24), seed = argument('seed', 1234);
const budget = { solo: true, maxMs: argument('ms', 4500), maxSimulations: argument('simulations', 180) };
const layouts = endgameLayouts(seed, count), summaries = [];
for (const mode of ['hard', 'tricky']) {
  const total = { mode, racks: count, completed: 0, wins: 0, truncated: 0, points: 0, shots: 0, fouls: 0, trickPots: 0, searchMs: 0, simulations: 0 };
  for (const [layout, initial] of layouts.entries()) {
    let balls = structuredClone(initial), state = { ...newMatch(), breaking: false, down: Array.from({ length: 15 }, (_, i) => i + 1).filter(n => !balls.some(b => b.number === n)) }, arcade = newArcade();
    let shots = 0;
    while (shots < maxShots && state.winner === null) {
      const table = practiceTable(balls), started = performance.now();
      const shot = mode === 'tricky' ? trickyComputerShot(balls, state, table, undefined, arcade, budget) : hardComputerShot(balls, state, table, undefined, budget);
      total.searchMs += performance.now() - started; total.simulations += shot.evaluated;
      const result = simulateShot(table, state, shot, false, { arcade: true, solo: true });
      const receipt = scoreArcade({ state: arcade, before: state, shot: result.report, result, evidence: result.evidence });
      arcade = commitArcade(arcade, receipt); total.fouls += Number(!!receipt.fault);
      total.trickPots += receipt.fault ? 0 : new Set(receipt.awards.filter(a => ['bank', 'kick', 'combo', 'carom', 'double', 'thin', 'long'].includes(a.kind)).map(a => a.number)).size;
      balls = result.balls; state = result.state; shots++; total.shots++;
      if (state.winner === null) for (const number of [...result.respot, ...(!balls.some(b => b.number === 0) ? [0] : [])]) {
        let position;
        for (let x = -P.HW + 3; x < P.HW && !position; x += 3) for (let y = -P.HH + 3; y < P.HH && !position; y += 3) if (canPlace({ x, y }, balls)) position = { x, y };
        if (!position) throw new Error('Benchmark cannot respot ball');
        balls.push({ number, ...position });
      }
    }
    total.points += arcade.totals[0]; total.completed += Number(state.winner !== null); total.wins += Number(state.winner === 0); total.truncated += Number(state.winner === null);
    console.log(JSON.stringify({ mode, layout, shots, points: arcade.totals[0], winner: state.winner }));
  }
  summaries.push({ ...total, pointsPerRack: total.points / count, msPerShot: Math.round(total.searchMs / total.shots) });
}
console.log(JSON.stringify({ seed, budget, maxShots, summaries }, null, 2));
