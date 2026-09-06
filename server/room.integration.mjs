// Real Workers runtime / WebSocket lifecycle test. Run after npm run build.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base = 'http://127.0.0.1:8789';
let runtime, output = '';
const clients = [];
before(async () => {
  runtime = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', '8789', '--ip', '127.0.0.1', '--persist-to', '/tmp/pool-room-tests-' + process.pid], { env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
  runtime.stdout.on('data', b => { output += b; }); runtime.stderr.on('data', b => { output += b; });
  for (let i = 0; i < 100; i++) {
    if (output.includes('Ready on')) return;
    if (runtime.exitCode !== null) throw new Error(output);
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Local Worker did not start: ' + output);
});
after(async () => {
  for (const c of clients) c.ws.terminate();
  if (runtime?.exitCode === null) { runtime.kill('SIGTERM'); await once(runtime, 'exit'); }
});
async function connect(id, token = crypto.randomUUID()) {
  const ws = new WebSocket(`${base.replace('http:', 'ws:')}/api/rooms/${id}/socket`, { headers: { Origin: base } });
  const messages = [], listeners = new Set();
  ws.on('message', bytes => { const value = JSON.parse(bytes.toString()); messages.push(value); for (const listener of listeners) listener(); });
  const client = { ws, token, seq: 0, send(type, payload = {}) { ws.send(JSON.stringify({ type, seq: this.seq, ...payload })); }, async wait(predicate) {
    const take = () => { const i = messages.findIndex(predicate); if (i < 0) return; const value = messages.splice(i, 1)[0]; if (value.seq !== undefined) this.seq = value.seq; return value; };
    const value = take(); if (value) return value;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { listeners.delete(check); reject(new Error('Timed out waiting for room event')); }, 5000);
      const check = () => { const value = take(); if (value) { clearTimeout(timeout); listeners.delete(check); resolve(value); } }; listeners.add(check);
    });
  } };
  clients.push(client); await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', version: 1, token }));
  return client;
}
test('private room: seats, turn enforcement, results, placement, reconnect, interrupted shot, win and mutual rematch', async () => {
  assert.equal((await fetch(base + '/api/rooms', { method: 'POST', headers: { Origin: 'https://unrelated.example' } })).status, 403);
  const response = await fetch(base + '/api/rooms', { method: 'POST', headers: { Origin: base } }); assert.equal(response.status, 201);
  const { id } = await response.json();
  const one = await connect(id), initial = await one.wait(m => m.type === 'state'); assert.equal(initial.seat, 0);
  const two = await connect(id); assert.equal((await two.wait(m => m.type === 'state')).seat, 1);
  await one.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  const third = await connect(id); assert.match((await third.wait(m => m.type === 'error')).message, /two players/);
  const action = { dir: { x: 1, y: 0 }, speed: 100, spin: { x: 0, y: 0 }, calledPocket: null };
  two.send('shoot', { action }); assert.match((await two.wait(m => m.type === 'error')).message, /friend/);
  one.send('shoot', { action }); const shot = await one.wait(m => m.type === 'shot'); await two.wait(m => m.type === 'shot');
  assert.equal(shot.pending.seat, 0);
  one.send('result', { report: { first: 1, rails: [1, 2, 3, 4], pocketed: [], offTable: [] }, balls: initial.snapshot.balls });
  const finished = await one.wait(m => m.type === 'state' && m.seq > shot.seq); await two.wait(m => m.type === 'state' && m.seq === finished.seq);
  assert.equal(finished.snapshot.match.turn, 1);
  two.send('shoot', { action }); const second = await two.wait(m => m.type === 'shot'); await one.wait(m => m.type === 'shot');
  two.send('result', { report: { first: null, rails: [], pocketed: [], offTable: [] }, balls: initial.snapshot.balls });
  const foul = await one.wait(m => m.type === 'state' && m.seq > second.seq); await two.wait(m => m.type === 'state' && m.seq === foul.seq);
  assert.equal(foul.snapshot.match.ballInHand, true);
  one.send('place', { position: { x: 19.5, y: 0 } }); assert.match((await one.wait(m => m.type === 'error')).message, /clear spot/);
  one.send('place', { position: { x: -12, y: 4 } }); const placed = await one.wait(m => m.type === 'state' && m.seq > foul.seq); await two.wait(m => m.type === 'state' && m.seq === placed.seq);
  assert.equal(placed.snapshot.match.ballInHand, false);
  two.ws.close(); await once(two.ws, 'close');
  await one.wait(m => m.type === 'presence' && !m.connected[1]);
  const rejoined = await connect(id, two.token); const restored = await rejoined.wait(m => m.type === 'state');
  assert.equal(restored.seat, 1); assert.deepEqual(restored.snapshot, placed.snapshot);
  await one.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  one.send('shoot', { action }); const interrupted = await one.wait(m => m.type === 'shot'); await rejoined.wait(m => m.type === 'shot');
  one.ws.close(); await once(one.ws, 'close');
  const rollback = await rejoined.wait(m => m.type === 'state' && m.seq > interrupted.seq); assert.deepEqual(rollback.snapshot, placed.snapshot); assert.equal(rollback.pending, null);
  const returned = await connect(id, one.token); await returned.wait(m => m.type === 'state');
  await rejoined.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  returned.send('shoot', { action }); const last = await returned.wait(m => m.type === 'shot'); await rejoined.wait(m => m.type === 'shot');
  returned.send('result', { report: { first: 1, rails: [], pocketed: [{ number: 8, pocket: 0 }], offTable: [] }, balls: placed.snapshot.balls.filter(b => b.number !== 8) });
  const won = await returned.wait(m => m.type === 'state' && m.seq > last.seq); await rejoined.wait(m => m.type === 'state' && m.seq === won.seq); assert.equal(won.snapshot.match.winner, 1);
  returned.send('rematch'); const vote = await returned.wait(m => m.type === 'state' && m.seq > won.seq); await rejoined.wait(m => m.type === 'state' && m.seq === vote.seq);
  assert.equal(vote.snapshot.match.winner, 1);
  rejoined.send('rematch'); const rematch = await returned.wait(m => m.type === 'state' && m.seq > vote.seq);
  assert.equal(rematch.snapshot.match.winner, null); assert.equal(rematch.snapshot.match.breaker, 1); assert.deepEqual(rematch.snapshot.match.wins, [0, 1]); assert.equal(rematch.snapshot.balls.length, 16);
});

test('nonexistent rooms return a readable terminal WebSocket rejection', async () => {
  const ws = new WebSocket(`${base.replace('http:', 'ws:')}/api/rooms/${crypto.randomUUID()}/socket`, { headers: { Origin: base } });
  const messages = []; ws.on('message', bytes => messages.push(JSON.parse(bytes.toString())));
  const [code, reason] = await once(ws, 'close');
  assert.equal(code, 4002); assert.match(reason.toString(), /expired/);
  assert.deepEqual(messages.map(m => m.type), ['error']);
});

test('connection capacity returns a terminal rejection while preserving existing connections', async () => {
  const { id } = await (await fetch(base + '/api/rooms', { method: 'POST', headers: { Origin: base } })).json();
  const sockets = [];
  try {
    for (let i = 0; i < 6; i++) {
      const ws = new WebSocket(`${base.replace('http:', 'ws:')}/api/rooms/${id}/socket`, { headers: { Origin: base } });
      sockets.push(ws); await once(ws, 'open');
    }
    const rejected = new WebSocket(`${base.replace('http:', 'ws:')}/api/rooms/${id}/socket`, { headers: { Origin: base } });
    const [code, reason] = await once(rejected, 'close');
    assert.equal(code, 4002); assert.match(reason.toString(), /full/);
    assert.ok(sockets.every(ws => ws.readyState === WebSocket.OPEN));
  } finally { for (const ws of sockets) ws.terminate(); }
});
