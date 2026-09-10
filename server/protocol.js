import { newMatch, resolveShot, targets } from '../src/eight-ball.js';
import { rackPositions, canPlace } from '../src/table-state.js';
import { P } from '../physics/constants.js';
import { readArcadeEvidence } from '../src/arcade-events.js';
import { newArcade, scoreArcade, commitArcade } from '../src/arcade-score.js';
export const PROTOCOL_VERSION = 2;
export const MAX_SPEED = 24 * 0.44704 / 0.026;
export const initialSnapshot = (breaker = 0, wins = [0, 0], rack = 1) => ({ match: newMatch(breaker, wins), balls: rackPositions(), arcade: newArcade(rack) });
const ballNumber = n => Number.isInteger(n) && n >= 0 && n <= 15;
const pocketNumber = n => Number.isInteger(n) && n >= 0 && n < 6;
const requireValue = (valid, message) => { if (!valid) throw new Error(message); };
export function validateAim(aim) {
  if (aim === null) return null;
  requireValue(aim && typeof aim === 'object' && !Array.isArray(aim), 'Invalid aim.');
  const { dir, pull, spin } = aim;
  requireValue(Number.isFinite(dir?.x) && Number.isFinite(dir?.y) && Math.abs(Math.hypot(dir.x, dir.y) - 1) < 0.001, 'Invalid aim direction.');
  requireValue(Number.isFinite(pull) && pull >= 0 && pull <= 24, 'Invalid aim power.');
  requireValue(Number.isFinite(spin?.x) && Number.isFinite(spin?.y) && Math.hypot(spin.x, spin.y) <= 0.701, 'Invalid spin.');
  return { dir: { x: dir.x, y: dir.y }, pull, spin: { x: spin.x, y: spin.y } };
}
export function validateShot(snapshot, action) {
  requireValue(action && typeof action === 'object' && !Array.isArray(action), 'Invalid shot.');
  const { match } = snapshot, { dir, speed, spin, calledPocket } = action;
  requireValue(match.winner === null && !match.ballInHand, 'Place the cue ball before shooting.');
  requireValue(Number.isFinite(dir?.x) && Number.isFinite(dir?.y) && Math.abs(Math.hypot(dir.x, dir.y) - 1) < 0.001, 'Invalid shot direction.');
  requireValue(Number.isFinite(speed) && speed >= 0.3 * MAX_SPEED / 24 && speed <= MAX_SPEED + 0.001, 'Invalid shot power.');
  requireValue(Number.isFinite(spin?.x) && Number.isFinite(spin?.y) && Math.hypot(spin.x, spin.y) <= 0.701, 'Invalid spin.');
  const onEight = !match.breaking && targets(match).length === 1 && targets(match)[0] === 8;
  requireValue(calledPocket === null || pocketNumber(calledPocket), 'Invalid pocket.');
  requireValue(!onEight || pocketNumber(calledPocket), 'Call the 8-ball pocket first.');
  return { dir: { x: dir.x, y: dir.y }, speed, spin: { x: spin.x, y: spin.y }, calledPocket };
}
export function placeCue(snapshot, position) {
  requireValue(snapshot.match.ballInHand && snapshot.match.winner === null, 'The cue ball is not in hand.');
  requireValue(canPlace(position, snapshot.balls), 'Choose a clear spot inside the cushions.');
  return { ...snapshot, match: { ...snapshot.match, ballInHand: false, message: `Player ${snapshot.match.turn + 1}: cue ball placed. Take your shot.` },
    balls: snapshot.balls.filter(b => b.number !== 0).concat({ number: 0, x: position.x, y: position.y }) };
}
export function finishShot(snapshot, pending, report, positions) {
  const present = new Set(snapshot.balls.map(b => b.number));
  requireValue(report && (report.first === null || (ballNumber(report.first) && report.first > 0 && present.has(report.first))), 'Invalid first contact.');
  requireValue(Array.isArray(report.rails) && report.rails.length <= 16 && report.rails.every(n => ballNumber(n) && present.has(n)), 'Invalid cushion contacts.');
  requireValue(Array.isArray(report.pocketed) && report.pocketed.length <= 16 && report.pocketed.every(p => p && ballNumber(p.number) && present.has(p.number) && pocketNumber(p.pocket)), 'Invalid pocket report.');
  requireValue(Array.isArray(report.offTable) && report.offTable.length <= 16 && report.offTable.every(n => ballNumber(n) && present.has(n)), 'Invalid off-table report.');
  const removed = [...report.pocketed.map(p => p.number), ...report.offTable];
  requireValue(new Set(removed).size === removed.length, 'A ball can leave the table only once.');
  const completed = { ...report, calledPocket: pending.action.calledPocket };
  const evidence = readArcadeEvidence(report.arcade, completed, present);
  const result = resolveShot(snapshot.match, completed);
  if (result.rerack) return { ...initialSnapshot(result.state.breaker, result.state.wins, (snapshot.arcade?.rack || 0) + 1), match: result.state };
  const expected = Array.from({ length: 16 }, (_, n) => n).filter(n => n === 0 ? !(result.state.winner !== null && removed.includes(0)) : !result.state.down.includes(n));
  requireValue(Array.isArray(positions) && positions.length === expected.length && positions.every(b =>
    b && expected.includes(b.number) && Number.isFinite(b.x) && Number.isFinite(b.y) && Math.abs(b.x) <= P.HW + P.CUSH && Math.abs(b.y) <= P.HH + P.CUSH) && new Set(positions.map(b => b.number)).size === expected.length, 'Invalid final table.');
  // Existing stored racks without an arcade ledger stay unscored until a fresh
  // rack. Accepted pool rules and arcade points share one persisted snapshot.
  const arcade = snapshot.arcade ? commitArcade(snapshot.arcade, scoreArcade({ state: snapshot.arcade,
    before: snapshot.match, shot: completed, evidence, result })) : null;
  return { match: result.state, balls: positions.map(({ number, x, y }) => ({ number, x, y })), arcade };
}
