import test from 'node:test';
import assert from 'node:assert/strict';
import { gameRequest, NativeRoomSocket, inviteURL, roomSocketURL } from './platform.js';

test('browser requests stay relative; native requests and invitations use the production service', async t => {
  const saved = { webkit: globalThis.webkit, location: globalThis.location, fetch: globalThis.fetch };
  t.after(() => { for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });
  globalThis.location = { origin: 'http://localhost:5176', host: 'localhost:5176', protocol: 'http:' };
  delete globalThis.webkit;
  globalThis.fetch = async (path, options) => ({ path, options });
  assert.equal((await gameRequest('/api/rooms', { method: 'POST' })).path, '/api/rooms');
  assert.equal(inviteURL('abc'), 'http://localhost:5176/#room=abc');
  assert.equal(roomSocketURL('abc'), 'ws://localhost:5176/api/rooms/abc/socket');
  let message;
  globalThis.webkit = { messageHandlers: { astra: { postMessage: async value => { message = value; return { status: 201, body: '{"id":"abc"}' }; } } } };
  const response = await gameRequest('/api/rooms', { method: 'POST' });
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { id: 'abc' });
  assert.equal(message.action, 'request');
  assert.equal(inviteURL('abc'), 'https://astrapool.darrinm.com/#room=abc');
  assert.equal(roomSocketURL('abc'), 'wss://astrapool.darrinm.com/api/rooms/abc/socket');
});

test('native room sockets isolate channels, forward messages, and preserve terminal close codes', async () => {
  const events = new EventTarget(), sent = [];
  const socket = new NativeRoomSocket('wss://astrapool.darrinm.com/api/rooms/id/socket', { postMessage: async m => sent.push(m) }, events);
  const received = [];
  for (const type of ['open', 'message', 'close']) socket.addEventListener(type, e => received.push({ type, data: e.data, code: e.code }));
  const emit = detail => events.dispatchEvent(new CustomEvent('astra-socket', { detail: { id: socket.id, ...detail } }));
  emit({ type: 'open', id: 'other' }); assert.equal(socket.readyState, 0);
  emit({ type: 'open' }); assert.equal(socket.readyState, 1);
  socket.send('ping'); emit({ type: 'message', data: 'pong' });
  emit({ type: 'close', code: 4001 }); emit({ type: 'open' });
  assert.equal(socket.readyState, 3); assert.equal(received.length, 3);
  assert.equal(received[1].data, 'pong'); assert.equal(received[2].code, 4001);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent.map(m => m.action), ['socketOpen', 'socketSend']);
});

test('a rejected native connection closes and releases its event listener', async () => {
  const events = new EventTarget();
  const socket = new NativeRoomSocket('invalid', { postMessage: async () => { throw Error('offline'); } }, events);
  let closed = 0; socket.addEventListener('close', () => closed++);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(socket.readyState, 3); assert.equal(closed, 1);
  events.dispatchEvent(new CustomEvent('astra-socket', { detail: { id: socket.id, type: 'open' } }));
  assert.equal(socket.readyState, 3);
});
