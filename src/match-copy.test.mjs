import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnStatus } from './match-copy.js';
import { newMatch, resolveShot, shotRecord } from './eight-ball.js';

const playing = () => ({ ...newMatch(), breaking: false, groups: ['solids', 'stripes'], down: [1, 2] });

test('online turn labels follow the viewer seat; only the active player gets instructions', () => {
  const match = playing();
  assert.deepEqual(turnStatus({ match, mode: 'online', seat: 0 }), {
    title: 'Your turn', detail: 'Solids · 5 remaining', active: true,
  });
  assert.deepEqual(turnStatus({ match, mode: 'online', seat: 1 }), {
    title: 'Friend’s turn', detail: '', active: false,
  });
  assert.equal(turnStatus({ match, mode: 'online' }).active, false);
});

test('a resolved miss changes the turn only after simulation and confirmation finish', () => {
  const shot = { ...shotRecord(), first: 3, rails: [3] };
  const result = resolveShot(playing(), shot).state;
  assert.equal(result.turn, 1);
  assert.equal(turnStatus({ match: result, mode: 'online', seat: 1, shooting: true, pending: true }).title, 'Shot in progress');
  assert.equal(turnStatus({ match: result, mode: 'online', seat: 1, pending: true }).title, 'Confirming shot…');
  assert.equal(turnStatus({ match: result, mode: 'online', seat: 1 }).title, 'Your turn');
});

test('a legal pocket retains the turn without repeating the shot summary', () => {
  const result = resolveShot(playing(), { ...shotRecord(), first: 3, pocketed: [{ number: 3, pocket: 0 }] }).state;
  assert.deepEqual(turnStatus({ match: result, mode: 'online', seat: 0 }), {
    title: 'Your turn', detail: 'Solids · 4 remaining', active: true,
  });
});

test('a foul asks the incoming player to place the cue ball, without instructing the spectator', () => {
  const result = resolveShot(playing(), { ...shotRecord(), first: 3, pocketed: [{ number: 0, pocket: 0 }] }).state;
  assert.equal(result.ballInHand, true);
  assert.equal(turnStatus({ match: result, mode: 'online', seat: 1 }).detail, 'Place the cue ball');
  assert.deepEqual(turnStatus({ match: result, mode: 'online', seat: 0 }), {
    title: 'Friend’s turn', detail: '', active: false,
  });
});

test('shared-screen names and computer turns remain unambiguous', () => {
  const match = { ...playing(), turn: 1 };
  assert.deepEqual(turnStatus({ match, mode: 'local' }), {
    title: 'Player 2’s turn', detail: 'Stripes · 7 remaining', active: true,
  });
  assert.deepEqual(turnStatus({ match, mode: 'computer' }), {
    title: 'Computer’s turn', detail: '', active: false,
  });
});

test('breaks, pocket calls, and connection interruptions replace routine guidance', () => {
  const match = newMatch();
  assert.equal(turnStatus({ match, mode: 'computer' }).detail, 'Break');
  assert.equal(turnStatus({ match: playing(), mode: 'computer', canCall: true }).detail, '8-ball · call a pocket');
  assert.equal(turnStatus({ match: playing(), mode: 'computer', canCall: true, pocketName: 'Top right pocket' }).detail, 'Called: Top right pocket');
  assert.deepEqual(turnStatus({ match, mode: 'online', seat: 0, connection: 'Waiting for your friend' }), {
    title: 'Waiting for your friend', detail: '', active: false,
  });
  assert.equal(turnStatus({ match, mode: 'computer', racking: true }).active, false);
  assert.deepEqual(turnStatus({ match, mode: 'online', seat: 0, waiting: true }), {
    title: 'Updating…', detail: '', active: false,
  });
});
