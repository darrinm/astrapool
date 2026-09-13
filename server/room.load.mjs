// Bounded protocol load test. Uses fresh rooms; never joins an existing game.
// Physics/rendering remain client-side and are deliberately outside this test.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from './protocol.js';

const { values } = parseArgs({ options: {
  base: { type: 'string', default: 'http://127.0.0.1:8787' },
  rooms: { type: 'string', default: '1000' },
  concurrency: { type: 'string', default: '25' },
  rounds: { type: 'string', default: '5' },
  'aim-seconds': { type: 'string', default: '5' },
  'peak-seconds': { type: 'string', default: '15' },
  output: { type: 'string', default: '/tmp/astrapool-load-result.json' },
} });
const base = new URL(values.base).origin;
const roomsCount = Number(values.rooms), concurrency = Number(values.concurrency), rounds = Number(values.rounds);
const aimSeconds = Number(values['aim-seconds']), peakSeconds = Number(values['peak-seconds']);
for (const n of [roomsCount, concurrency, rounds, aimSeconds, peakSeconds]) assert.ok(Number.isInteger(n) && n > 0);
assert.ok(roomsCount <= 1000 && concurrency <= 100 && rounds <= 10 && aimSeconds <= 30 && peakSeconds <= 30, 'Keep the load test bounded');
const started = performance.now(), clients = new Set(), rooms = [], samples = {};
const counts = { roomsCreated: 0, connections: 0, reconnects: 0, shots: 0, results: 0, aimsSent: 0, aimsReceived: 0, pings: 0, pongs: 0, unexpectedCloses: 0, errors: 0 };
let open = 0, peakOpen = 0, cleanup = false, failure = null;
const phases = [], aimTimings = [], lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();
const log = data => console.log(JSON.stringify({ atSeconds: +((performance.now() - started) / 1000).toFixed(2), ...data }));
const record = (name, ms) => (samples[name] ||= []).push(ms);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const error = reason => { counts.errors++; failure ||= new Error(String(reason)); };
const summary = values => {
  if (!values?.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b), at = p => +sorted[Math.ceil((sorted.length - 1) * p)].toFixed(2);
  return { count: sorted.length, p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: at(1) };
};
async function parallel(items, fn, width = concurrency) {
  let next = 0;
  const results = await Promise.allSettled(Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length && !failure) { const i = next++; await fn(items[i], i); }
  }));
  const rejected = results.find(r => r.status === 'rejected');
  if (rejected) throw rejected.reason;
  if (failure) throw failure;
}
async function phase(name, fn) {
  const before = { ...counts }, start = performance.now();
  const sampleStarts = Object.fromEntries(Object.entries(samples).map(([name, list]) => [name, list.length]));
  log({ phase: name, status: 'started', open });
  await fn();
  if (failure) throw failure;
  const result = { name, seconds: +((performance.now() - start) / 1000).toFixed(2), open,
    counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v - before[k]])),
    latency: Object.fromEntries(Object.entries(samples).map(([key, list]) => [key, summary(list.slice(sampleStarts[key] || 0))]).filter(([, value]) => value.count)) };
  phases.push(result); log({ phase: name, status: 'passed', ...result });
}
async function connect(room, seat, token = crypto.randomUUID()) {
  const start = performance.now();
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/api/rooms/${room.id}/socket`, { headers: { Origin: base }, handshakeTimeout: 30000 });
  const c = { ws, room, seat, token, queue: [], waiters: new Set(), plannedClose: false, counted: false, pings: [] };
  clients.add(c);
  c.wait = (predicate, timeoutMs = 30000) => {
    const i = c.queue.findIndex(predicate);
    if (i >= 0) return Promise.resolve(c.queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject };
      waiter.timer = setTimeout(() => { c.waiters.delete(waiter); reject(new Error('Timed out waiting for room state')); }, timeoutMs);
      c.waiters.add(waiter);
    });
  };
  c.send = (type, data = {}) => {
    if (ws.readyState !== WebSocket.OPEN) throw new Error('Attempted send on disconnected test client');
    ws.send(JSON.stringify({ type, seq: room.seq, ...data }));
  };
  const rejectWaiters = reason => { for (const w of c.waiters) { clearTimeout(w.timer); w.reject(reason); } c.waiters.clear(); };
  ws.on('error', e => { if (!cleanup && !c.plannedClose) error(e.message); rejectWaiters(e); });
  ws.on('close', (code) => {
    if (c.counted) { open--; c.counted = false; }
    clients.delete(c);
    if (!cleanup && !c.plannedClose) { counts.unexpectedCloses++; error(`Unexpected WebSocket close ${code}`); }
    rejectWaiters(new Error(`WebSocket closed ${code}`));
  });
  ws.on('message', raw => {
    try {
      const text = raw.toString();
      if (text === 'pong') { const sent = c.pings.shift(); if (sent !== undefined) { record('ping', performance.now() - sent); counts.pongs++; } return; }
      const m = JSON.parse(text);
      if (m.type === 'error') { error(m.message); rejectWaiters(new Error(m.message)); return; }
      if (m.type === 'aim') {
        const sent = room.aims.get(m.aim?.pull);
        assert.ok(sent && m.seq === sent.seq && m.seat === sent.seat && c.seat !== sent.seat, 'Aim delivered to wrong player or sequence');
        assert.deepEqual(m.aim.dir, room.direction, 'Aim crossed room boundaries');
        room.aims.delete(m.aim.pull); counts.aimsReceived++; record('aimRelay', performance.now() - sent.at); return;
      }
      for (const w of c.waiters) if (w.predicate(m)) { clearTimeout(w.timer); c.waiters.delete(w); w.resolve(m); return; }
      c.queue.push(m);
    } catch (e) { error(e.message); rejectWaiters(e); }
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve); ws.once('error', reject);
  });
  open++; c.counted = true; peakOpen = Math.max(peakOpen, open); counts.connections++;
  c.send('hello', { version: PROTOCOL_VERSION, token });
  const state = await c.wait(m => m.type === 'state');
  assert.equal(state.seat, seat); assert.equal(state.seq, room.seq);
  if (room.snapshot) assert.deepEqual(state.snapshot, room.snapshot, 'Reconnect or join changed game state');
  else room.snapshot = state.snapshot;
  record('join', performance.now() - start);
  return c;
}
async function syncBoth(room, type, seq) {
  const [a, b] = await Promise.all(room.players.map(c => c.wait(m => m.type === type && m.seq === seq)));
  assert.deepEqual(a.snapshot, b.snapshot, 'Players disagree about the table');
  assert.deepEqual(a.pending, b.pending, 'Players disagree about the shot');
  room.seq = seq; room.snapshot = a.snapshot;
  return a;
}
async function aimFor(seconds, hz) {
  const start = performance.now(), frames = Math.floor(seconds * hz), before = counts.aimsReceived;
  let maxBufferedBytesPerSocket = 0;
  for (let tick = 0; tick < frames; tick++) {
    // Pace from actual sends: never catch up in a burst that exceeds the game's rate limit.
    const frameStart = performance.now();
    for (const room of rooms) {
      const seat = room.snapshot.match.turn, pull = ++room.counter / 10000;
      room.aims.set(pull, { at: performance.now(), seq: room.seq, seat });
      room.players[seat].send('aim', { aim: { dir: room.direction, pull, spin: { x: 0, y: 0 } } });
      maxBufferedBytesPerSocket = Math.max(maxBufferedBytesPerSocket, room.players[seat].ws.bufferedAmount);
      counts.aimsSent++;
    }
    if (tick % (hz * 15) === 0) for (const c of clients) { c.pings.push(performance.now()); c.ws.send('ping'); counts.pings++; }
    if (failure) throw failure;
    await pause(Math.max(0, 1000 / hz - (performance.now() - frameStart)));
  }
  const sendSeconds = (performance.now() - start) / 1000;
  const pendingAfterSending = rooms.reduce((n, r) => n + r.aims.size, 0);
  const deadline = performance.now() + 30000;
  while (rooms.some(r => r.aims.size) && !failure && performance.now() < deadline) await pause(25);
  assert.equal(rooms.reduce((n, r) => n + r.aims.size, 0), 0, 'Missing aim messages');
  const secondsActual = (performance.now() - start) / 1000;
  const timing = { offeredHzPerRoom: hz, sendSeconds: +sendSeconds.toFixed(2),
    sentPerSecond: +(roomsCount * frames / sendSeconds).toFixed(1),
    deliveredPerSecond: +((counts.aimsReceived - before) / secondsActual).toFixed(1), secondsActual: +secondsActual.toFixed(2),
    pendingAfterSending, maxBufferedBytesPerSocket };
  aimTimings.push(timing); log(timing);
}
async function shotRound() {
  // Protocol-valid synthetic dry shots keep all 16 balls in each rack. This
  // measures server coordination and persistence, not browser physics accuracy.
  await parallel(rooms, async room => {
    const seat = room.snapshot.match.turn, expectedTurn = 1 - seat, shooter = room.players[seat];
    let start = performance.now();
    shooter.send('shoot', { action: { dir: { x: 1, y: 0 }, speed: 100, spin: { x: 0, y: 0 }, calledPocket: null } });
    const shot = await syncBoth(room, 'shot', room.seq + 1);
    assert.equal(shot.pending.seat, seat); counts.shots++; record('shotBroadcast', performance.now() - start);
    start = performance.now();
    shooter.send('result', { report: { first: 1, rails: [1, 2, 3, 4], pocketed: [], offTable: [] }, balls: room.snapshot.balls });
    const result = await syncBoth(room, 'state', room.seq + 1);
    assert.equal(result.pending, null); assert.equal(result.snapshot.match.turn, expectedTurn);
    assert.equal(result.snapshot.match.ballInHand, false); counts.results++; record('resultCommit', performance.now() - start);
  }, roomsCount);
}
async function close(c) {
  c.plannedClose = true;
  if (c.ws.readyState === WebSocket.CLOSED) return;
  await new Promise(resolve => { const timer = setTimeout(() => c.ws.terminate(), 3000); c.ws.once('close', () => { clearTimeout(timer); resolve(); }); c.ws.close(); });
}
const deadline = setTimeout(() => { error('Load-test time limit reached'); for (const c of clients) c.ws.terminate(); }, 10 * 60 * 1000);
try {
  log({ target: base, rooms: roomsCount, players: roomsCount * 2, concurrency, rounds, aimSeconds, peakSeconds });
  await phase('create-and-join', () => parallel(Array.from({ length: roomsCount }), async (_, index) => {
    const start = performance.now();
    const response = await fetch(`${base}/api/rooms`, { method: 'POST', headers: { Origin: base }, signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 201); const { id } = await response.json(); counts.roomsCreated++; record('createRoom', performance.now() - start);
    const angle = (index + 1) / (roomsCount + 1);
    const room = { id, seq: 0, counter: 0, aims: new Map(), direction: { x: Math.cos(angle), y: Math.sin(angle) }, players: [] };
    const a = await connect(room, 0), b = await connect(room, 1); room.players = [a, b];
    await a.wait(m => m.type === 'presence' && m.connected.every(Boolean)); rooms.push(room);
  }));
  assert.equal(open, roomsCount * 2);
  for (let i = 0; i < rounds; i++) {
    await phase(`aim-10hz-${i + 1}`, () => aimFor(aimSeconds, 10));
    await phase(`shots-${i + 1}`, shotRound);
  }
  await phase('peak-aim-40hz', () => aimFor(peakSeconds, 40));
  await phase('reconnect-all', async () => {
    await Promise.all(rooms.flatMap(r => r.players.map(close)));
    assert.equal(open, 0);
    await parallel(rooms, async room => {
      const start = performance.now(), tokens = room.players.map(c => c.token);
      const a = await connect(room, 0, tokens[0]), b = await connect(room, 1, tokens[1]); room.players = [a, b];
      await a.wait(m => m.type === 'presence' && m.connected.every(Boolean)); counts.reconnects += 2; record('restoreRoom', performance.now() - start);
    });
    assert.equal(open, roomsCount * 2);
  });
  await phase('shots-after-reconnect', shotRound);
  await phase('aim-after-reconnect', () => aimFor(aimSeconds, 10));
  assert.equal(counts.aimsSent, counts.aimsReceived);
  assert.equal(counts.pings, counts.pongs);
} catch (e) { failure ||= e; log({ failure: e.message }); }
finally {
  cleanup = true; clearTimeout(deadline); lag.disable();
  for (const c of clients) c.ws.terminate();
  const report = { passed: !failure, target: base, timestamp: new Date().toISOString(), rooms: roomsCount, players: roomsCount * 2,
    workload: { rounds, aimSeconds, peakSeconds, joinConcurrency: concurrency, syntheticResults: true },
    seconds: +((performance.now() - started) / 1000).toFixed(2), peakConnections: peakOpen, counts, phases, aimTimings,
    latency: Object.fromEntries(Object.entries(samples).map(([name, list]) => [name, summary(list)])),
    loadGenerator: { node: process.version, rssMB: +(process.memoryUsage().rss / 1e6).toFixed(1), eventLoopP99Ms: +(lag.percentile(99) / 1e6).toFixed(2), eventLoopMaxMs: +(lag.max / 1e6).toFixed(2) },
    ...(failure && { failure: failure.message }) };
  writeFileSync(values.output, JSON.stringify(report, null, 2) + '\n'); log({ result: report });
  process.exitCode = failure ? 1 : 0;
}
