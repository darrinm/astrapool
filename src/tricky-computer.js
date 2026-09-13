import { P } from '../physics/constants.js';
import { targets } from './eight-ball.js';
import { canPlace } from './table-state.js';
import { computerShot, computerPlacement, potOptions } from './computer.js';
import { contactOptions, variation } from './hard-computer.js';
import { trickShotFamilies } from './trick-shots.js';
import { practiceTable, simulateShot } from './shot-simulation.js';
import { newArcade, scoreArcade, commitArcade, multiplierFor, AWARD_NAMES } from './arcade-score.js';

function receiptFor(result, before, arcade) {
  return scoreArcade({ state: arcade, before, shot: result.report, evidence: result.evidence, result });
}
export function trickyValue(result, receipt, arcade) {
  if (!result.settled) return -100000;
  const multiplier = multiplierFor(arcade.streaks[receipt.player]);
  // Losing a rack also forfeits its remaining scoring chances. Otherwise the
  // objective is points, with only a small cost for losing a built-up streak.
  if (result.state.winner !== null && result.state.winner !== receipt.player) return -1200 * multiplier;
  if (receipt.fault) return -300 * multiplier;
  return receipt.total - (receipt.count ? 0 : (multiplier - 1) * 100);
}
export function projectedLabel(receipt, fallback) {
  if (!receipt.total) return fallback;
  const kinds = [...new Set(receipt.awards.filter(a => !['pot', 'finish'].includes(a.kind)).map(a => AWARD_NAMES[a.kind]))];
  return `${kinds.join(' + ') || 'Pot'} · projected +${receipt.total.toLocaleString()}`;
}

export function trickyComputerShot(balls, state, liveTable, onPreview, arcade = newArcade(), { solo = false, maxMs = 4500, maxSimulations = 180 } = {}) {
  const started = performance.now(), deadline = started + maxMs, table = liveTable || practiceTable(balls);
  const legal = targets(state), seen = new Set(), entries = [], familiesTried = new Set();
  let simulations = 0, lastPreview = -Infinity;
  const available = () => simulations < maxSimulations && performance.now() < deadline;
  const simulate = (t, before, shot, trace = false) => {
    simulations++;
    return simulateShot(t, before, shot, trace, { arcade: true, solo });
  };
  const evaluate = shot => {
    if (!available() && entries.length) return;
    const key = JSON.stringify([shot.dir, shot.speed, shot.spin, shot.position, shot.pocket]);
    if (seen.has(key)) return; seen.add(key);
    const preview = !!onPreview && performance.now() - lastPreview >= 100;
    const result = simulate(table, state, shot, preview), receipt = receiptFor(result, state, arcade);
    const entry = { shot, result, receipt, score: trickyValue(result, receipt, arcade) };
    entries.push(entry); familiesTried.add(shot.family || 'Contact');
    if (preview) {
      lastPreview = performance.now();
      onPreview({ target: shot.target, pocket: shot.pocket, paths: result.paths, traceTargets: shot.traceTargets, label: projectedLabel(receipt, `${shot.family || 'Shot'}…`) });
      delete result.paths;
    }
    return entry;
  };
  let position, placed = balls;
  if (state.ballInHand) {
    position = computerPlacement(balls, state, p => canPlace(p, balls));
    for (let x = -P.HW + 2 * P.R; x < P.HW && !position; x += 3 * P.R)
      for (let y = -P.HH + 2 * P.R; y < P.HH && !position; y += 3 * P.R) if (canPlace({ x, y }, balls)) position = { x, y };
    if (!position) throw new Error('No legal cue-ball placement');
    placed = balls.map(b => b.number ? b : { number: 0, ...position });
  }
  const fallback = { ...computerShot(placed, state, 'hard', () => 0.5), ...(position && { position }), family: state.breaking ? 'Break' : 'Direct pot' };
  evaluate(variation(fallback));
  if (state.breaking) {
    for (const speed of [270, 320, 370, 412]) for (const angle of [0, -0.012, 0.012]) evaluate(variation({ ...fallback, speed }, angle));
  } else if (available()) {
    const families = trickShotFamilies(balls, legal, state.ballInHand);
    // Round-robin budgets ensure a page of easy pots never crowds out kicks,
    // banks or combinations. Reserve the final simulations for margin/leave.
    outer: for (let i = 0; i < 12; i++) for (const family of families) {
      const shot = family.shots[i]; if (!shot) continue;
      for (const power of [0.85, 1.1]) {
        if (!available() || simulations >= maxSimulations - 48 || performance.now() > started + maxMs * 0.65) break outer;
        evaluate(variation(shot, 0, power));
      }
    }
    if (!entries.some(e => e.receipt.total)) {
      for (const shot of contactOptions(placed, legal).slice(0, 6)) evaluate(variation({ ...shot, ...(position && { position }) }));
    }
    for (const { shot } of entries.toSorted((a, b) => b.score - a.score).slice(0, 4)) {
      if (performance.now() > started + maxMs * 0.8) break;
      const angles = table.blackHoleGravity ? [-0.08, -0.04, -0.02, -0.006, -0.0025, 0.0025, 0.006, 0.02, 0.04, 0.08] : [-0.006, -0.0025, 0.0025, 0.006];
      for (const angle of angles) evaluate(variation(shot, angle));
      for (const spin of [{ x: 0, y: -0.35 }, { x: 0, y: 0.35 }]) evaluate(variation(shot, 0, 1, spin));
    }
  }
  const finalists = entries.toSorted((a, b) => b.score - a.score).slice(0, 4);
  for (const entry of finalists) Object.assign(entry, { sum: entry.score, samples: 1, successes: Number(entry.receipt.total > 0) });
  // Give every finalist its margin check before spending the remaining budget
  // on a leave. Slow devices still compare shots on the same evidence.
  for (const [angle, power] of [[-0.0007, 0.985], [0.0007, 1.015]]) for (const entry of finalists) {
    if (!available()) break;
    const result = simulate(table, state, variation(entry.shot, angle, power)), receipt = receiptFor(result, state, arcade);
    entry.sum += trickyValue(result, receipt, arcade); entry.samples++; entry.successes += Number(receipt.total > 0);
  }
  for (const entry of finalists) {
    entry.score = entry.sum / entry.samples;
    const { result } = entry;
    if (available() && entry.receipt.total && result.state.turn === state.turn && result.state.winner === null && !result.respot.length) {
      const nextArcade = commitArcade(arcade, entry.receipt), nextTable = practiceTable(result.balls, table);
      const nextOptions = potOptions(result.balls, targets(result.state)).slice(0, 3);
      let continuation = 0;
      for (const next of nextOptions) {
        if (!available()) break;
        const attempt = simulate(nextTable, result.state, variation(next));
        continuation = Math.max(continuation, trickyValue(attempt, receiptFor(attempt, result.state, nextArcade), nextArcade));
      }
      entry.score += continuation * 0.5 * entry.successes / entry.samples;
    }
  }
  const best = finalists.sort((a, b) => b.score - a.score || b.receipt.awards.length - a.receipt.awards.length)[0];
  return { ...best.shot, label: projectedLabel(best.receipt, 'Aha!'), evaluated: simulations,
    search: { families: [...familiesTried], milliseconds: performance.now() - started },
    expected: { pocketed: best.result.report.pocketed, foul: !!best.receipt.fault, points: best.receipt.total, awards: best.receipt.awards } };
}
