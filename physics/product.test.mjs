import { test } from 'node:test';
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import assert from 'node:assert/strict';
import { newMatch, resolveShot, shotRecord } from '../src/eight-ball.js';
import { groupLabel, playerText, rackOutcome } from '../src/match-copy.js';
import { overheadDistance, setOverheadCamera, withinCueTarget } from '../src/table-view.js';
import { placeCue } from '../server/protocol.js';
import { rackPositions } from '../src/table-state.js';

test('rack results omit routine wins but retain the cause of an unusual loss', () => {
  const before = { ...newMatch(), breaking: false, groups: ['solids', 'stripes'], down: [1, 2, 3, 4, 5, 6, 7] };
  const shot = { ...shotRecord(0), first: 8, pocketed: [{ number: 8, pocket: 0 }] };
  assert.equal(rackOutcome(resolveShot(before, shot).state), '');
  assert.equal(rackOutcome(newMatch()), '');
  for (const [state, attempt, expected] of [
    [before, { ...shot, pocketed: [...shot.pocketed, { number: 0, pocket: 1 }] }, 'Cue ball scratched or left the table.'],
    [before, { ...shot, calledPocket: 2 }, '8-ball went into an uncalled pocket.'],
    [{ ...before, down: [] }, { ...shot, first: 1 }, '8-ball pocketed early.'],
    [before, { ...shot, first: 9 }, 'Wrong ball hit first.'],
    [before, { ...shot, pocketed: [], offTable: [8] }, 'Object ball left the table.'],
  ]) {
    const text = rackOutcome(resolveShot(state, attempt).state);
    assert.equal(text, expected);
    assert.doesNotMatch(text, /wins|Player/);
  }
});

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
  // Capitalised by the copy, not by a CSS text-transform that also title-cased the rest.
  assert.equal(groupLabel('stripes', [1, 9, 10]), 'Stripes · 5 remaining');
  assert.equal(groupLabel('solids', [1, 2, 3, 4, 5, 6, 7]), 'Solids cleared · 8-ball next');
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

for (const [width, height, top, bottom, right] of [
  [390, 844, 88, 110, 12], [320, 568, 88, 145, 12],
  [768, 1024, 88, 110, 12], [844, 390, 88, 12, 250],
  [1440, 900, 140, 210, 12], [390, 844, 88, 560, 12],
]) {
  test(`overhead camera fills the available space and holds its orientation at ${width} × ${height}, bottom ${bottom}`, () => {
    const camera = new PerspectiveCamera(48, width / height, 0.1, 800);
    camera.up.set(0, 0, 1);
    camera.position.set(-60, 0, 21);
    const controls = new OrbitControls(camera, null);
    controls.minPolarAngle = 0.05;
    controls.enableDamping = true;
    controls.rotateLeft(0.8); // Leave an unfinished orbit when Overhead is pressed.
    const halfWidth = 43.7, halfHeight = 24.2, left = 12, surfaceZ = 2.1;
    setOverheadCamera(camera, controls, { width, height, halfWidth, halfHeight, surfaceZ, top, bottom, left, right });
    const before = camera.position.clone();
    for (let frame = 0; frame < 120; frame++) controls.update();
    assert.ok(before.distanceTo(camera.position) < 0.00001, 'orbit damping must not move the fitted table');
    camera.updateMatrixWorld();
    const screen = (x, y) => {
      const p = new Vector3(x, y, surfaceZ).project(camera);
      return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 };
    };
    const corners = [-1, 1].flatMap(x => [-1, 1].map(y => screen(x * halfWidth, y * halfHeight)));
    const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
    assert.ok(Math.min(...xs) >= left - 0.01 && Math.max(...xs) <= width - right + 0.01);
    assert.ok(Math.min(...ys) >= top - 0.01 && Math.max(...ys) <= height - bottom + 0.01);
    const tableWidth = Math.max(...xs) - Math.min(...xs), tableHeight = Math.max(...ys) - Math.min(...ys);
    assert.ok(Math.abs(tableWidth - (width - left - right)) < 0.01 || Math.abs(tableHeight - (height - top - bottom)) < 0.01,
      'table must fill at least one available dimension');
    assert.equal(tableHeight > tableWidth, height > width, 'long rails follow the viewport orientation');
    assert.ok(controls.enableDamping);
  });
}
