import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineRoom } from './online.js';

function setup(t) {
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    close() { this.readyState = 3; this.dispatchEvent(Object.assign(new Event('close'), { code: 4001 })); }
    message(data) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(data) })); }
  }
  t.mock.method(globalThis, 'setTimeout', () => 0);
  const previous = globalThis.WebSocket;
  globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = previous; });
  const messages = [], statuses = [];
  const room = new OnlineRoom(data => messages.push({ data, canAct: room.canAct }), text => statuses.push(text));
  t.after(() => room.leave());
  // Exercise the production connection handlers without browser URL/storage setup.
  const oldLocation = globalThis.location;
  globalThis.location = { protocol: 'http:', host: 'localhost' };
  t.after(() => { if (oldLocation === undefined) delete globalThis.location; else globalThis.location = oldLocation; });
  room.id = 'test-room'; room.connect();
  room.socket.message({ type: 'state', seq: 0, seat: 0, connected: [true, true], pending: null });
  assert.equal(room.canAct, true);
  messages.length = 0;
  return { room, messages, statuses };
}

test('own connection loss notifies the scene after disabling input, including terminal closes', t => {
  const { room, messages } = setup(t);
  room.socket.close();
  assert.deepEqual(messages, [{ data: { type: 'presence', connected: [false, false] }, canAct: false }]);
});

test('peer disconnect and reconnect notify the scene with current input availability', t => {
  const { room, messages } = setup(t);
  room.socket.message({ type: 'presence', connected: [true, false] });
  room.socket.message({ type: 'presence', connected: [true, true] });
  assert.deepEqual(messages.map(m => m.canAct), [false, true]);
});

test('leaving a room ignores late connection events from that room', t => {
  const { room, messages } = setup(t), socket = room.socket;
  room.leave();
  socket.message({ type: 'presence', connected: [true, true] });
  assert.deepEqual(messages, []);
  assert.equal(room.canAct, false);
});
