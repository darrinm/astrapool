import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newMatch, resolveShot, shotRecord } from '../src/eight-ball.js';
import { groupLabel, playerText } from '../src/match-copy.js';
import { overheadDistance, withinCueTarget } from '../src/table-view.js';
import { placeCue } from '../server/protocol.js';
import { rackPositions } from '../src/table-state.js';

test('break feedback explains a pot without implying group assignment or a rack win', () => {
  const state = resolveShot(newMatch(), { ...shotRecord(), first: 6, pocketed: [{ number: 6, pocket: 0 }] }).state;
  assert.deepEqual(state.groups, [null, null]);
  assert.deepEqual(state.wins, [0, 0]);
  assert.match(state.lastShot, /pocketed the 6/);
  assert.match(state.lastShot, /Groups are assigned after the break/);
  assert.equal(playerText(state.lastShot, 'computer'), 'You pocketed the 6. Groups are assigned after the break.');
});

test('foul reason survives cue placement and snapshot serialization', () => {
  const previous = { ...newMatch(), breaking: false, groups: ['solids', 'stripes'] };
  const match = resolveShot(previous, { ...shotRecord(), first: 9, rails: [9] }).state;
  const placed = placeCue({ match, balls: rackPositions() }, { x: -12, y: 4 });
  assert.equal(placed.match.ballInHand, false);
  assert.match(JSON.parse(JSON.stringify(placed)).match.lastShot, /Wrong ball hit first/);
  assert.match(playerText(match.lastShot, 'online', 1), /You: ball in hand/);
});

test('rack-ending feedback explains the loss and is unchanged by later reports', () => {
  const previous = { ...newMatch(), breaking: false };
  const shot = { ...shotRecord(), first: 1, pocketed: [{ number: 8, pocket: 0 }] };
  const ended = resolveShot(previous, shot).state;
  assert.match(ended.lastShot, /8-ball pocketed early/);
  assert.match(playerText(ended.lastShot, 'computer'), /Computer wins/);
  assert.deepEqual(resolveShot(ended, shot).state, ended);
  assert.equal(newMatch(1, ended.wins).lastShot, null);
});

test('remaining-ball labels and personal names agree with the active game', () => {
  assert.equal(playerText('Player 1 to break. Player 1 shooting…', 'computer'), 'Your break. You are shooting…');
  assert.equal(groupLabel('stripes', [1, 9, 10]), 'stripes · 5 remaining');
  assert.equal(groupLabel('solids', [1, 2, 3, 4, 5, 6, 7]), 'solids cleared · 8-ball next');
  assert.equal(groupLabel(null, [6]), 'Groups not assigned');
  assert.equal(playerText('Player 1’s turn. Player 2 wins!', 'computer'), 'Your turn. Computer wins!');
  assert.equal(playerText('Player 2 continues. Player 1 breaks.', 'online', 1), 'You continue. Friend breaks.');
});

test('a cue-ball-only scratch does not claim that no balls were pocketed', () => {
  const state = resolveShot({ ...newMatch(), breaking: false }, { ...shotRecord(), first: 1, pocketed: [{ number: 0, pocket: 0 }] }).state;
  assert.match(state.lastShot, /scratched the cue ball/);
  assert.doesNotMatch(state.lastShot, /pocketed no balls/);
});

for (const [width, height] of [[390, 844], [320, 568], [844, 390], [1440, 900]]) {
  test(`overhead table fits inside the HUD margins at ${width} × ${height}`, () => {
    const short = width > height && height <= 600;
    const halfWidth = 45, halfHeight = 25, top = 90, bottom = short ? 16 : 160, right = short ? 250 : 12;
    const distance = overheadDistance(width, height, halfWidth, halfHeight, 48, top, bottom, 12, right);
    const pixelsPerUnit = height / (2 * distance * Math.tan(24 * Math.PI / 180));
    const portrait = height > width;
    assert.ok(2 * (portrait ? halfHeight : halfWidth) * pixelsPerUnit <= width - 12 - right + 0.001);
    assert.ok(2 * (portrait ? halfWidth : halfHeight) * pixelsPerUnit <= height - top - bottom + 0.001);
  });
}

test('small cue balls have a forgiving touch target without capturing distant drags', () => {
  const center = { x: 100, y: 100 };
  assert.ok(withinCueTarget({ x: 120, y: 100 }, center, 5, true));
  assert.ok(!withinCueTarget({ x: 120, y: 100 }, center, 5, false));
  assert.ok(!withinCueTarget({ x: 125, y: 100 }, center, 5, true));
});
