import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineRoom, roomToken } from './online.js';

function setup(t) {
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    send(data) { this.sent.push(JSON.parse(data)); }
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

const pending = { seat: 0, action: {} };
const completed = { report: { first: 1 }, balls: [{ number: 0, x: -10, y: 0 }] };
for (const sentBeforeLoss of [false, true]) test(`completed result survives reconnect (sent before loss: ${sentBeforeLoss})`, t => {
  const { room } = setup(t);
  room.socket.message({ type: 'shot', seq: 1, pending });
  if (!sentBeforeLoss) room.socket.readyState = 3;
  room.submitResult(completed);
  assert.equal(room.socket.sent.length, Number(sentBeforeLoss));
  room.socket.close(); room.connect();
  assert.equal(room.socket.sent.length, 0, 'wait for the reconnect snapshot before retrying');
  room.socket.message({ type: 'state', seq: 1, seat: 0, connected: [true, true], pending });
  assert.deepEqual(room.socket.sent, [{ type: 'result', seq: 1, ...completed }]);
  room.socket.message({ type: 'state', seq: 1, pending });
  assert.equal(room.socket.sent.length, 1, 'same-connection resync must not repeatedly submit');
  room.socket.message({ type: 'state', seq: 2, pending: null });
  assert.equal(room.result, null);
});

test('canceled shots discard queued results instead of applying them to a new table', t => {
  const { room } = setup(t);
  room.socket.message({ type: 'shot', seq: 1, pending });
  room.socket.readyState = 3; room.submitResult(completed);
  room.socket.close(); room.connect();
  room.socket.message({ type: 'state', seq: 2, pending: null });
  assert.equal(room.result, null); assert.deepEqual(room.socket.sent, []);
});

for (const resyncSeq of [0, 1]) test(`rejections stay visible through recovery state at seq ${resyncSeq}`, t => {
  const { room, statuses } = setup(t);
  room.socket.message({ type: 'error', message: 'Choose a clear spot.' });
  room.socket.message({ type: 'state', seq: resyncSeq, pending: null });
  room.socket.message({ type: 'presence', connected: [true, true] });
  assert.equal(statuses.at(-1), 'Choose a clear spot.');
  room.send('place', { position: { x: 0, y: 0 } });
  assert.match(statuses.at(-1), /Friend connected/);
});

test('rejected results do not create an automatic resubmission loop', t => {
  const { room, statuses } = setup(t);
  room.socket.message({ type: 'shot', seq: 1, pending }); room.submitResult(completed);
  room.socket.message({ type: 'error', message: 'Invalid final table.' });
  room.socket.message({ type: 'state', seq: 1, pending });
  assert.equal(room.result, null); assert.equal(room.socket.sent.length, 1);
  assert.equal(statuses.at(-1), 'Invalid final table.');
});

test('terminal room rejections stop automatic reconnects', t => {
  const { room, statuses } = setup(t);
  room.socket.dispatchEvent(Object.assign(new Event('close'), { code: 4002, reason: 'Room expired' }));
  assert.equal(room.retry, 0); assert.equal(statuses.at(-1), 'Room expired');
  assert.equal(setTimeout.mock.callCount(), 0);
});

test('fresh room credentials work without the secure-context randomUUID API', t => {
  const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: undefined });
  t.after(() => { if (original) Object.defineProperty(crypto, 'randomUUID', original); else delete crypto.randomUUID; });
  const one = roomToken(), two = roomToken();
  assert.match(one, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(one, two);
});

test('completion during reconnect waits for that connection to confirm the pending shot', t => {
  const { room } = setup(t);
  room.socket.message({ type: 'shot', seq: 1, pending });
  room.socket.close(); room.connect(); room.submitResult(completed);
  assert.deepEqual(room.socket.sent, []);
  room.socket.message({ type: 'state', seq: 1, seat: 0, connected: [true, true], pending });
  assert.deepEqual(room.socket.sent, [{ type: 'result', seq: 1, ...completed }]);
});
