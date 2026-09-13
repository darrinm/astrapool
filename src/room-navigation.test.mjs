import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteRoom, rememberGameChoice, readGameChoice, startupRoom } from './room-navigation.js';
const room = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const hash = `#room=${room}`;
const storage = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };

for (const mode of ['computer', 'local', 'free']) test(`restoring an old invite after choosing ${mode} does not rejoin online`, () => {
  const store = storage();
  rememberGameChoice('online', room, store);
  rememberGameChoice(mode, room, store);
  // Further offline game changes must not forget which stale invite was left.
  rememberGameChoice(mode, null, store);
  const choice = readGameChoice(store);
  for (const navigation of [{ navigationType: 'reload' }, { navigationType: 'back_forward' }, { navigationType: 'navigate', standalone: true }]) {
    assert.equal(startupRoom(hash, navigation, choice), null);
  }
  assert.equal(startupRoom(hash, { navigationType: 'navigate' }, choice), room, 'a freshly opened invitation is intentional');
  assert.equal(startupRoom(`#room=${other}`, { navigationType: 'reload' }, choice), other, 'a different invitation is not suppressed');
});

test('active online games keep reconnecting, including after explicitly rejoining a left room', () => {
  const store = storage();
  rememberGameChoice('computer', room, store);
  rememberGameChoice('online', room, store);
  assert.equal(startupRoom(hash, { navigationType: 'reload' }, readGameChoice(store)), room);
  assert.equal(startupRoom(hash, { standalone: true }, readGameChoice(store)), room);
  assert.equal(startupRoom(hash, { navigationType: 'reload' }, null), room, 'existing installations retain reconnect behavior');
});

test('bad or unavailable storage never prevents joining an invitation', () => {
  const unavailable = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.doesNotThrow(() => rememberGameChoice('computer', room, unavailable));
  assert.equal(readGameChoice(unavailable), null);
  assert.equal(readGameChoice({ getItem: () => '{' }), null);
  assert.equal(readGameChoice({ getItem: () => '{"mode":"bogus"}' }), null);
  assert.equal(startupRoom(hash, { navigationType: 'reload' }, readGameChoice(unavailable)), room);
  assert.equal(inviteRoom('#room=bad'), null);
  assert.equal(inviteRoom(''), null);
});
