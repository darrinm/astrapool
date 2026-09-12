import { targets } from './eight-ball.js';
import { ARCADE_VERSION } from './arcade-events.js';

export const newArcade = (rack = 1) => ({ version: ARCADE_VERSION, rack, totals: [0, 0], streaks: [0, 0], lastPlay: 0, last: null });
export const multiplierFor = streak => [1, 1.5, 2, 3][Math.min(3, Math.max(0, streak))];

export function arcadeFault(before, shot, result, free = false) {
  if (shot.pocketed.some(p => p.number === 0)) return 'scratch';
  if (shot.offTable.length) return 'off';
  const eight = shot.pocketed.find(p => p.number === 8);
  if (!free && !before.breaking && eight) {
    if (!targets(before).includes(8)) return 'early';
    if (eight.pocket !== shot.calledPocket) return 'wrong';
  }
  if (!free && result && (result.rerack || result.state.ballInHand ||
      (result.state.winner !== null && result.state.winner !== before.turn))) return 'foul';
  return null;
}

export function scoreArcade({ state, before, shot, evidence = new Map(), result = null, free = false, input = 'cue' }) {
  const player = free ? 0 : before.turn;
  const multiplier = multiplierFor(state.streaks[player]);
  const legal = free ? null : new Set(targets(before));
  const seen = new Set(), awards = [];
  let count = 0, kickAwarded = false;
  function award(kind, number, pocket, base) {
    awards.push({ id: `${state.rack}:${state.lastPlay + 1}:${number}:${kind}`, kind, number, pocket, base });
  }
  for (const { number, pocket } of shot.pocketed) {
    if (number === 0 || seen.has(number)) continue;
    seen.add(number);
    if (!free && (before.breaking ? number === 8 : !legal.has(number))) continue;
    const route = evidence.get(number);
    if (free && !route?.active) continue;
    count++; award('pot', number, pocket, 100);
    if (route?.banks) award('bank', number, pocket, 150 + 75 * (Math.min(3, route.banks) - 1));
    if (route?.combo) award('combo', number, pocket, route.combo >= 2 ? 350 : 200);
    if (input === 'cue' && route?.kick && !kickAwarded) { award('kick', number, pocket, 200 + 100 * (Math.min(3, Number(route.kick)) - 1)); kickAwarded = true; }
    for (const [kind, bonus] of [['carom', 200], ['double', 300], ['thin', 100], ['long', 75]]) if (route?.[kind] && !(kind === 'carom' && route.double)) award(kind, number, pocket, bonus);
    if (count > 1) award('multi', number, pocket, count * 100);
    if (!free && number === 8 && !before.breaking && pocket === shot.calledPocket) award('finish', number, pocket, 500);
  }
  // Distribute rounded points by cumulative sums; displayed parts always add up.
  let sum = 0, rounded = 0;
  for (const a of awards) { sum += a.base; const next = Math.round(sum * multiplier); a.points = next - rounded; rounded = next; }
  const fault = arcadeFault(before, shot, result, free);
  return { rack: state.rack, play: state.lastPlay + 1, player, multiplier, count, awards, fault, total: fault ? 0 : rounded };
}

export function commitArcade(state, receipt) {
  if (receipt.rack !== state.rack || receipt.play !== state.lastPlay + 1) return state;
  const totals = [...state.totals], streaks = [...state.streaks];
  totals[receipt.player] += receipt.total;
  streaks[receipt.player] = !receipt.fault && receipt.count ? Math.min(3, streaks[receipt.player] + 1) : 0;
  return { ...state, totals, streaks, lastPlay: receipt.play, last: receipt };
}

export const AWARD_NAMES = { pot: 'Pot', bank: 'Bank', combo: 'Combination', kick: 'Kick', multi: 'Multi-pot', finish: 'Rack finish', carom: 'Carom', double: 'Double kiss', thin: 'Thin cut', long: 'Long pot' };
export const FAULT_NAMES = { scratch: 'Scratch', off: 'Off the table', early: 'Early 8-ball', wrong: 'Wrong pocket', foul: 'Foul' };
export function arcadeSummary(receipt) {
  if (!receipt) return '';
  if (receipt.fault) return `${receipt.count > 1 ? `${receipt.count} pots, then ` : ''}${FAULT_NAMES[receipt.fault]}. No points this shot. Streak reset.`;
  if (!receipt.total) return 'No scoring pot. Streak reset.';
  const parts = new Map();
  for (const a of receipt.awards) parts.set(a.kind, (parts.get(a.kind) || 0) + a.base);
  return `${[...parts].map(([kind, points]) => `${AWARD_NAMES[kind]} ${points}`).join(' + ')} · ×${receipt.multiplier} = +${receipt.total.toLocaleString()}`;
}
