// Pool house rules. Pure state transitions shared by local, computer, and online matches.
import { shotSummary } from './match-copy.js';
export const groupOf = (n) => n >= 1 && n <= 7 ? 'solids' : n >= 9 && n <= 15 ? 'stripes' : null;
export const groupBalls = (group) => Array.from({ length: 7 }, (_, i) => i + (group === 'solids' ? 1 : 9));
export function newMatch(breaker = 0, wins = [0, 0]) {
  return { turn: breaker, breaker, wins: [...wins], groups: [null, null], down: [], breaking: true,
    ballInHand: false, winner: null, message: `Player ${breaker + 1} to break.`, lastShot: null, lastFoul: null, shots: 0 };
}
export function targets(state, player = state.turn) {
  const group = state.groups[player];
  if (!group) {
    const remaining = [...groupBalls('solids'), ...groupBalls('stripes')].filter(n => !state.down.includes(n));
    return remaining.length ? remaining : [8];
  }
  const remaining = groupBalls(group).filter(n => !state.down.includes(n));
  return remaining.length ? remaining : [8];
}
export function shotRecord(calledPocket = null) {
  return { first: null, rails: [], pocketed: [], offTable: [], calledPocket };
}
// Rails contains distinct ball numbers driven to a cushion AFTER the cue's first object contact.
// Pocketed entries are { number, pocket }; off-table balls never count as legal pots.
export function resolveShot(previous, shot) {
  const result = resolveRules(previous, shot);
  if (previous.winner === null) result.state.lastShot = shotSummary(previous, shot, result);
  return result;
}
// The welcome demo plays one open-table run: either group is a target, then the 8.
// Keep normal fouls, spotting, and rack endings, but never hand play to a human.
export function resolveSoloShot(previous, shot) {
  const result = resolveShot(previous, shot);
  return { ...result, state: { ...result.state, turn: 0, breaker: 0, groups: [null, null] } };
}
function resolveRules(previous, shot) {
  if (previous.winner !== null) return { state: previous, respot: [], rerack: false };
  const state = { ...previous, groups: [...previous.groups], down: [...previous.down], wins: [...previous.wins],
    breaking: false, ballInHand: false, lastFoul: null, shots: previous.shots + 1 };
  const player = previous.turn, other = 1 - player;
  const pots = shot.pocketed.map(p => p.number);
  const removed = [...new Set([...pots, ...shot.offTable])];
  const eight = shot.pocketed.find(p => p.number === 8);
  const legal = targets(previous);
  let foul = '';
  const violation = (kind, message, ball = null) => {
    foul = message; state.lastFoul = { kind, player, ball };
  };
  if (removed.includes(0)) violation(shot.offTable.includes(0) ? 'off-table' : 'scratch', 'Cue ball scratched or left the table', 0);
  else if (shot.offTable.length) violation('off-table', 'Object ball left the table', shot.offTable[0]);
  else if (shot.first === null) violation('no-contact', 'No object ball hit', 0);
  else if (!previous.breaking && !legal.includes(shot.first)) violation('wrong-ball', 'Wrong ball hit first', shot.first);
  else if (!pots.some(n => n !== 0) && !shot.rails.length) violation('no-rail', 'No ball reached a cushion after contact', shot.first);

  if (previous.breaking && !pots.some(n => n !== 0) && new Set(shot.rails.filter(n => n !== 0)).size < 4) {
    const reset = newMatch(other, previous.wins);
    reset.lastFoul = { kind: 'break', player, ball: null };
    reset.message = `Illegal break — Player ${other + 1} breaks a fresh rack.`;
    return { state: reset, respot: [], rerack: true };
  }
  const respot = previous.breaking && removed.includes(8) ? [8] : [];
  state.down = [...new Set([...state.down, ...removed.filter(n => n > 0 && !respot.includes(n))])];
  if (!previous.breaking && removed.includes(8)) {
    const win = !foul && legal.length === 1 && legal[0] === 8 && eight &&
      Number.isInteger(shot.calledPocket) && eight.pocket === shot.calledPocket;
    if (!win && !foul) state.lastFoul = { kind: !legal.includes(8) ? 'early-eight' : 'wrong-pocket', player, ball: 8 };
    state.winner = win ? player : other;
    state.wins[state.winner]++;
    const reason = foul || (shot.offTable.includes(8) ? '8-ball left the table' :
      !legal.includes(8) ? '8-ball pocketed early' : '8-ball went into an uncalled pocket');
    state.message = win ? `Player ${player + 1} wins!` : `${reason} — Player ${other + 1} wins.`;
    return { state, respot, rerack: false };
  }
  if (!previous.breaking && !foul && !state.groups[player]) {
    const groups = [...new Set(pots.map(groupOf).filter(Boolean))];
    if (groups.length === 1) { state.groups[player] = groups[0]; state.groups[other] = groups[0] === 'solids' ? 'stripes' : 'solids'; }
  }
  const keepsTurn = !foul && pots.some(n => n !== 0 && (previous.breaking ||
    (state.groups[player] ? groupOf(n) === state.groups[player] : groupOf(n))));
  state.turn = keepsTurn ? player : other;
  state.ballInHand = !!foul;
  const assignment = state.groups[state.turn] ? ` · ${state.groups[state.turn]}` : ' · open table';
  state.message = foul ? `${foul}. Player ${other + 1}: ball in hand.` :
    `${respot.length ? '8-ball spotted. ' : ''}Player ${state.turn + 1}${keepsTurn ? ' continues' : "’s turn"}${assignment}.`;
  return { state, respot, rerack: false };
}
