import { P } from '../physics/constants.js';
import { targets } from './eight-ball.js';
import { canPlace } from './table-state.js';
import { computerShot, computerPlacement } from './computer.js';
import { contactOptions, variation } from './hard-computer.js';
import { trickShotFamilies } from './trick-shots.js';
import { practiceTable, simulateShot } from './shot-simulation.js';
import { newArcade, scoreArcade, commitArcade, multiplierFor, AWARD_NAMES } from './arcade-score.js';

function receiptFor(result, before, arcade) {
  return scoreArcade({ state: arcade, before, shot: result.report, evidence: result.evidence, result });
}
const TRICK_KINDS = new Set(['bank', 'kick', 'combo', 'carom', 'double']);
const clean = (result, receipt) => result.settled && !receipt.fault &&
  (result.state.winner === null || result.state.winner === receipt.player);
const scores = (result, receipt) => clean(result, receipt) && receipt.total > 0;
export const earnsTrick = (result, receipt) => scores(result, receipt) && receipt.awards.some(a => TRICK_KINDS.has(a.kind));
const byPoints = (a, b) => b.score - a.score || b.receipt.awards.length - a.receipt.awards.length;

// Reserve room for tricks before reliability testing, even when plain pots have
// higher scores. Also keep a fallback so fragile tricks cannot force a bad shot.
export function trickyFinalists(entries) {
  const ranked = entries.toSorted(byPoints);
  const tricks = ranked.filter(e => earnsTrick(e.result, e.receipt));
  const plain = ranked.find(e => !earnsTrick(e.result, e.receipt));
  const chosen = [], kindsSeen = new Set(), trickSlots = plain ? 3 : 4;
  // Aim refinements of one lucrative bank must not crowd every kick or combo
  // out of the margin checks. First compare different earned trick families.
  for (const entry of tricks) {
    const kinds = [...new Set(entry.receipt.awards.filter(a => TRICK_KINDS.has(a.kind)).map(a => a.kind))].sort().join('+');
    if (!kindsSeen.has(kinds) && chosen.length < trickSlots) { chosen.push(entry); kindsSeen.add(kinds); }
  }
  for (const entry of tricks) if (chosen.length < trickSlots && !chosen.includes(entry)) chosen.push(entry);
  if (plain) chosen.push(plain);
  for (const entry of ranked) if (chosen.length < 4 && !chosen.includes(entry)) chosen.push(entry);
  return chosen;
}
export function chooseTrickyFinalist(finalists) {
  const reliableTricks = finalists.filter(e => e.samples === 3 && e.tricks === 3);
  const reliablePots = finalists.filter(e => e.samples === 3 && e.successes === 3);
  const safe = finalists.filter(e => e.safe === e.samples);
  const pool = reliableTricks.length ? reliableTricks : reliablePots.length ? reliablePots : safe.length ? safe : finalists;
  return { best: pool.toSorted(byPoints)[0], selection: reliableTricks.length ? 'reliable-trick' : reliablePots.length ? 'reliable-pot' : 'fallback' };
}

// One representative from each trick family gives a small lookahead variety.
// Keep a direct pot as well; generation scores only prioritize what to simulate.
export function trickyContinuations(balls, state) {
  const families = trickShotFamilies(balls, targets(state));
  const direct = families.find(f => f.name === 'Direct pot').shots[0];
  const tricks = families.filter(f => f.name !== 'Direct pot').map(f => f.shots[0]).filter(Boolean).sort((a, b) => b.score - a.score);
  return [...tricks.slice(0, 3), ...(direct ? [direct] : [])];
}
export function trickyValue(result, receipt, arcade) {
  if (!result.settled) return -100000;
  const multiplier = multiplierFor(arcade.streaks[receipt.player]);
  // Losing a rack also forfeits its remaining scoring chances. Otherwise rank
  // within each reliability tier by points, with a small streak-loss cost.
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
    const canRefine = () => available() && simulations < maxSimulations - 8 && performance.now() < started + maxMs * 0.8;
    for (const { shot } of trickyFinalists(entries)) {
      const angles = table.blackHoleGravity ? [-0.08, -0.04, -0.02, -0.006, -0.0025, 0.0025, 0.006, 0.02, 0.04, 0.08] : [-0.006, -0.0025, 0.0025, 0.006];
      for (const angle of angles) { if (!canRefine()) break; evaluate(variation(shot, angle)); }
      for (const spin of [{ x: 0, y: -0.35 }, { x: 0, y: 0.35 }]) { if (!canRefine()) break; evaluate(variation(shot, 0, 1, spin)); }
    }
  }
  const finalists = state.breaking ? entries.toSorted(byPoints).slice(0, 4) : trickyFinalists(entries);
  for (const entry of finalists) Object.assign(entry, { sum: entry.score, samples: 1,
    successes: Number(scores(entry.result, entry.receipt)), safe: Number(clean(entry.result, entry.receipt)), tricks: Number(earnsTrick(entry.result, entry.receipt)) });
  // Give every finalist its margin check before spending the remaining budget
  // on a leave. Slow devices still compare shots on the same evidence.
  for (const [angle, power] of [[-0.0007, 0.985], [0.0007, 1.015]]) for (const entry of finalists) {
    if (!available()) break;
    const result = simulate(table, state, variation(entry.shot, angle, power)), receipt = receiptFor(result, state, arcade);
    entry.sum += trickyValue(result, receipt, arcade); entry.samples++;
    entry.successes += Number(scores(result, receipt)); entry.safe += Number(clean(result, receipt)); entry.tricks += Number(earnsTrick(result, receipt));
  }
  const leaves = [], continuationFamilies = new Set();
  for (const entry of finalists) {
    entry.score = entry.sum / entry.samples;
    const { result } = entry;
    if (available() && scores(result, entry.receipt) && result.state.turn === state.turn && result.state.winner === null && !result.respot.length) {
      const nextArcade = commitArcade(arcade, entry.receipt), nextTable = practiceTable(result.balls, table);
      leaves.push({ entry, nextArcade, nextTable, options: trickyContinuations(result.balls, result.state), continuation: 0 });
    }
  }
  // Share the remaining simulations across finalists before deepening any leave.
  for (let i = 0; i < 4; i++) for (const leave of leaves) {
    const next = leave.options[i]; if (!next || !available()) continue;
    const { entry, nextTable, nextArcade } = leave;
    continuationFamilies.add(next.family);
    const attempt = simulate(nextTable, entry.result.state, variation(next));
    leave.continuation = Math.max(leave.continuation, trickyValue(attempt, receiptFor(attempt, entry.result.state, nextArcade), nextArcade));
  }
  for (const { entry, continuation } of leaves) entry.score += continuation * 0.5 * entry.successes / entry.samples;
  const { best, selection } = state.breaking ? { best: finalists.toSorted(byPoints)[0], selection: 'break' } : chooseTrickyFinalist(finalists);
  return { ...best.shot, label: projectedLabel(best.receipt, 'Aha!'), evaluated: simulations,
    search: { families: [...familiesTried], milliseconds: performance.now() - started, selection,
      samples: best.samples, scoringSamples: best.successes, trickSamples: best.tricks,
      continuationFamilies: [...continuationFamilies] },
    expected: { pocketed: best.result.report.pocketed, foul: !!best.receipt.fault, points: best.receipt.total, awards: best.receipt.awards } };
}
