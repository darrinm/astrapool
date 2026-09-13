import test from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, resolveShot, shotRecord } from './eight-ball.js';
import { PlacementMarker } from './placement-marker.js';
import { foulLabels } from './rule-feedback.js';

const match = () => ({ ...newMatch(), breaking: false, groups: ['solids', 'stripes'] });
test('rule outcomes identify the responsible player, cause, and ball for both clients', () => {
  for (const [kind, changes, ball] of [
    ['no-contact', { first: null }, 0],
    ['wrong-ball', { first: 9 }, 9],
    ['no-rail', { rails: [] }, 1],
    ['scratch', { pocketed: [{ number: 0, pocket: 2 }] }, 0],
    ['off-table', { offTable: [4] }, 4],
    ['early-eight', { pocketed: [{ number: 8, pocket: 2 }] }, 8],
  ]) {
    const state = resolveShot(match(), { ...shotRecord(), first: 1, rails: [1], ...changes }).state;
    assert.deepEqual(state.lastFoul, { kind, player: 0, ball });
    assert.ok(foulLabels[kind]);
    assert.deepEqual(JSON.parse(JSON.stringify(state)).lastFoul, state.lastFoul, 'snapshot preserves visual reason');
  }
});

test('illegal breaks and wrong-pocket rack losses retain their visual explanation', () => {
  const broken = resolveShot(newMatch(), shotRecord());
  assert.equal(broken.rerack, true);
  assert.equal(broken.state.lastFoul.kind, 'break');
  assert.equal(broken.state.lastFoul.player, 0);
  const state = resolveShot({ ...match(), down: [1, 2, 3, 4, 5, 6, 7] },
    { ...shotRecord(1), first: 8, pocketed: [{ number: 8, pocket: 2 }] }).state;
  assert.equal(state.lastFoul.kind, 'wrong-pocket');
  assert.equal(state.winner, 1);
});

test('placing the cue retains the last explanation; a clean shot and a new game clear it', () => {
  const fouled = resolveShot(match(), shotRecord()).state;
  const placed = { ...fouled, ballInHand: false };
  assert.equal(placed.lastFoul.kind, 'no-contact');
  const next = resolveShot(placed, { ...shotRecord(), first: 9, rails: [9] }).state;
  assert.equal(next.lastFoul, null);
  assert.equal(newMatch().lastFoul, null);
});

test('cue placement has handles for legal locations and a cross for blocked locations', t => {
  const marker = new PlacementMarker(1.1, -1.65); t.after(() => marker.dispose());
  marker.update({ x: 3, y: 4 }, { visible: true });
  assert.equal(marker.visible, true); assert.equal(marker.handles.visible, true); assert.equal(marker.invalid.visible, false);
  marker.update({ x: 7, y: 8 }, { visible: true, valid: false });
  assert.equal(marker.position.x, 7); assert.equal(marker.position.y, 8);
  assert.equal(marker.handles.visible, false); assert.equal(marker.invalid.visible, true);
  const intersections = []; marker.traverse(o => o.raycast(null, intersections));
  assert.deepEqual(intersections, [], 'visual marker never captures touch input');
  marker.update({ x: 7, y: 8 }, { visible: false });
  assert.equal(marker.visible, false);
});
