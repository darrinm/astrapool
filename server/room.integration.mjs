// Real Workers runtime / WebSocket lifecycle test. Run after npm run build.
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from './protocol.js';
import { ArcadeEvents, EVENT as E } from '../src/arcade-events.js';
const base = 'http://127.0.0.1:8789';
let runtime, output = '';
const clients = [];
const persist = '/tmp/pool-room-tests-' + process.pid;
function analyticsSQL(sql) {
  return JSON.parse(execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'GAME_ANALYTICS',
    '--local', '--persist-to', persist, '--json', '--command', sql], { encoding: 'utf8', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } }))[0].results;
}
before(async () => {
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'GAME_ANALYTICS', '--local', '--persist-to', persist], { stdio: 'pipe', env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' } });
  // BEFORE INSERT counts attempted upserts, even when their conflict guard updates zero rows.
  analyticsSQL('CREATE TABLE analytics_attempts (id TEXT); CREATE TRIGGER count_analytics_attempt BEFORE INSERT ON games BEGIN INSERT INTO analytics_attempts VALUES (NEW.id); END;');
  runtime = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', '8789', '--ip', '127.0.0.1', '--persist-to', persist], { env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const client = { ws, token, messages, seq: 0, send(type, payload = {}) { ws.send(JSON.stringify({ type, seq: this.seq, ...payload })); }, async wait(predicate) {
    const take = () => { const i = messages.findIndex(predicate); if (i < 0) return; const value = messages.splice(i, 1)[0]; if (value.seq !== undefined) this.seq = value.seq; return value; };
    const value = take(); if (value) return value;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { listeners.delete(check); reject(new Error('Timed out waiting for room event')); }, 5000);
      const check = () => { const value = take(); if (value) { clearTimeout(timeout); listeners.delete(check); resolve(value); } }; listeners.add(check);
    });
  } };
  clients.push(client); await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', version: PROTOCOL_VERSION, token }));
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
  const desktop = { room: 'orbital', device: 'desktop' }, mobile = { room: 'tokyo', device: 'mobile' };
  two.send('shoot', { action }); assert.match((await two.wait(m => m.type === 'error')).message, /friend/);
  one.send('shoot', { action, settings: desktop }); const shot = await one.wait(m => m.type === 'shot'); await two.wait(m => m.type === 'shot');
  assert.equal(shot.pending.seat, 0);
  one.send('result', { report: { first: 1, rails: [1, 2, 3, 4], pocketed: [], offTable: [] }, balls: initial.snapshot.balls });
  const finished = await one.wait(m => m.type === 'state' && m.seq > shot.seq); await two.wait(m => m.type === 'state' && m.seq === finished.seq);
  assert.equal(finished.snapshot.match.turn, 1);
  two.send('shoot', { action, settings: mobile }); const second = await two.wait(m => m.type === 'shot'); await one.wait(m => m.type === 'shot');
  two.send('result', { report: { first: null, rails: [], pocketed: [], offTable: [] }, balls: initial.snapshot.balls });
  const foul = await one.wait(m => m.type === 'state' && m.seq > second.seq); await two.wait(m => m.type === 'state' && m.seq === foul.seq);
  assert.equal(foul.snapshot.match.ballInHand, true);
  assert.deepEqual(foul.snapshot.match.lastFoul, { kind: 'no-contact', player: 1, ball: 0 });
  one.send('place', { position: { x: 19.5, y: 0 } }); assert.match((await one.wait(m => m.type === 'error')).message, /clear spot/);
  one.send('place', { position: { x: -12, y: 4 } }); const placed = await one.wait(m => m.type === 'state' && m.seq > foul.seq); await two.wait(m => m.type === 'state' && m.seq === placed.seq);
  assert.equal(placed.snapshot.match.ballInHand, false);
  two.ws.close(); await once(two.ws, 'close');
  await one.wait(m => m.type === 'presence' && !m.connected[1]);
  const rejoined = await connect(id, two.token); const restored = await rejoined.wait(m => m.type === 'state');
  assert.equal(restored.seat, 1); assert.deepEqual(restored.snapshot, placed.snapshot);
  await one.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  one.send('shoot', { action, settings: desktop }); const interrupted = await one.wait(m => m.type === 'shot'); await rejoined.wait(m => m.type === 'shot');
  one.ws.close(); await once(one.ws, 'close');
  const rollback = await rejoined.wait(m => m.type === 'state' && m.seq > interrupted.seq); assert.deepEqual(rollback.snapshot, placed.snapshot); assert.equal(rollback.pending, null);
  const returned = await connect(id, one.token); await returned.wait(m => m.type === 'state');
  await rejoined.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  returned.send('shoot', { action, settings: desktop }); const last = await returned.wait(m => m.type === 'shot'); await rejoined.wait(m => m.type === 'shot');
  returned.send('result', { report: { first: 1, rails: [], pocketed: [{ number: 8, pocket: 0 }], offTable: [] }, balls: placed.snapshot.balls.filter(b => b.number !== 8) });
  const won = await returned.wait(m => m.type === 'state' && m.seq > last.seq); await rejoined.wait(m => m.type === 'state' && m.seq === won.seq); assert.equal(won.snapshot.match.winner, 1);
  returned.send('rematch'); const vote = await returned.wait(m => m.type === 'state' && m.seq > won.seq); await rejoined.wait(m => m.type === 'state' && m.seq === vote.seq);
  assert.equal(vote.snapshot.match.winner, 1);
  rejoined.send('rematch'); const rematch = await returned.wait(m => m.type === 'state' && m.seq > vote.seq);
  assert.equal(rematch.snapshot.match.winner, null); assert.equal(rematch.snapshot.match.breaker, 1); assert.deepEqual(rematch.snapshot.match.wins, [0, 1]); assert.equal(rematch.snapshot.balls.length, 16);
  assert.equal(rematch.snapshot.arcade.rack, won.snapshot.arcade.rack + 1); assert.deepEqual(rematch.snapshot.arcade.totals, [0, 0]);
  // Both peers and several reconnects produced one played rack; voting does not start another.
  const games = analyticsSQL("SELECT mode, source, outcome, finished_at, settings_changes, (SELECT COUNT(*) FROM analytics_attempts) AS writes FROM games");
  assert.equal(games.length, 1); assert.equal(games[0].mode, 'online'); assert.equal(games[0].source, 'room');
  assert.equal(games[0].outcome, 'player2'); assert.ok(games[0].finished_at);
  assert.equal(games[0].settings_changes, 0); assert.equal(games[0].writes, 5); // Four shots and one finish only.
});

test('analytics ingestion persists cumulative records once and exposes no public reporting endpoint', async () => {
  const { newGameAnalytics } = await import('../src/game-analytics.js');
  const game = newGameAnalytics('computer', { difficulty: 'tricky', room: 'orbital' }); game.shots = 1;
  const send = body => fetch(base + '/api/analytics/game', { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send(game)).status, 204); assert.equal((await send(game)).status, 204);
  assert.equal((await send({ ...game, mode: 'online' })).status, 400);
  assert.equal((await fetch(base + '/api/analytics/report')).status, 404);
  game.version++; game.finishedAt = Date.now(); game.outcome = 'player';
  assert.equal((await send(game)).status, 204);
  const rows = analyticsSQL("SELECT COUNT(*) AS n, SUM(finished_at IS NOT NULL) AS finished FROM games WHERE source = 'browser'");
  assert.deepEqual(rows, [{ n: 1, finished: 1 }]);
});

test('arcade scores agree across peers, reject duplicates, survive reconnect, and roll back interrupted play', async () => {
  const { id } = await (await fetch(base + '/api/rooms', { method: 'POST', headers: { Origin: base } })).json();
  const one = await connect(id), initial = await one.wait(m => m.type === 'state');
  const two = await connect(id); await two.wait(m => m.type === 'state');
  await one.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  const action = { dir: { x: 1, y: 0 }, speed: 100, spin: { x: 0, y: 0 }, calledPocket: null };
  one.send('shoot', { action }); const started = await one.wait(m => m.type === 'shot'); await two.wait(m => m.type === 'shot');
  const trace = new ArcadeEvents();
  trace.add(E.launch, 0, 0); trace.add(E.hit, 10, 0, 1); trace.add(E.rail, 20, 1, 0); trace.add(E.pot, 100, 1, 2);
  const report = { first: 1, rails: [1], pocketed: [{ number: 1, pocket: 2 }], offTable: [], arcade: trace.report() };
  one.send('result', { report, balls: initial.snapshot.balls.filter(b => b.number !== 1) });
  const scored = await one.wait(m => m.type === 'state' && m.seq > started.seq);
  const peer = await two.wait(m => m.type === 'state' && m.seq === scored.seq);
  assert.deepEqual(scored.snapshot.arcade, peer.snapshot.arcade); assert.equal(peer.snapshot.arcade.totals[0], 250);
  one.send('result', { seq: started.seq, report, balls: scored.snapshot.balls });
  assert.match((await one.wait(m => m.type === 'error')).message, /table changed/);
  const duplicate = await one.wait(m => m.type === 'state'); assert.deepEqual(duplicate.snapshot.arcade, scored.snapshot.arcade);
  one.send('shoot', { action }); const unfinished = await one.wait(m => m.type === 'shot'); await two.wait(m => m.type === 'shot');
  one.ws.close(); await once(one.ws, 'close');
  const rollback = await two.wait(m => m.type === 'state' && m.seq > unfinished.seq);
  assert.deepEqual(rollback.snapshot.arcade, scored.snapshot.arcade);
  const returned = await connect(id, one.token); const restored = await returned.wait(m => m.type === 'state');
  assert.deepEqual(restored.snapshot.arcade, scored.snapshot.arcade);
  await two.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  returned.send('shoot', { action }); const scratchStart = await returned.wait(m => m.type === 'shot'); await two.wait(m => m.type === 'shot');
  const scratch = new ArcadeEvents(); scratch.add(E.launch, 0, 0); scratch.add(E.hit, 10, 0, 2); scratch.add(E.pot, 30, 2, 0); scratch.add(E.pot, 40, 0, 3);
  returned.send('result', { report: { first: 2, rails: [], pocketed: [{ number: 2, pocket: 0 }, { number: 0, pocket: 3 }], offTable: [], arcade: scratch.report() }, balls: restored.snapshot.balls.filter(b => b.number !== 2) });
  const failed = await returned.wait(m => m.type === 'state' && m.seq > scratchStart.seq);
  await two.wait(m => m.type === 'state' && m.seq === failed.seq);
  assert.equal(failed.snapshot.arcade.last.fault, 'scratch'); assert.deepEqual(failed.snapshot.arcade.totals, [250, 0]); assert.equal(failed.snapshot.arcade.streaks[0], 0);
  returned.ws.close(); two.ws.close();
});

test('live cues relay only the active player, preserve the table, and do not consume shot requests', async () => {
  const { id } = await (await fetch(base + '/api/rooms', { method: 'POST', headers: { Origin: base } })).json();
  const one = await connect(id), initial = await one.wait(m => m.type === 'state');
  const two = await connect(id); await two.wait(m => m.type === 'state');
  await one.wait(m => m.type === 'presence' && m.connected.every(Boolean));
  const aim = { dir: { x: 0.6, y: 0.8 }, pull: 12, spin: { x: -0.3, y: 0.4 } };
  two.send('aim', { aim });
  one.send('aim', { aim, seq: -1 });
  one.send('aim', { aim: { ...aim, pull: 25 } });
  one.send('aim', { aim, seat: 1 });
  assert.deepEqual(await two.wait(m => m.type === 'aim'), { type: 'aim', seq: 0, seat: 0, aim });
  // More than a full 10-second window at 40 Hz, sent as a burst to exercise budget headroom.
  for (let i = 0; i < 420; i++) one.send('aim', { aim: { ...aim, pull: (i % 48) / 2 } });
  one.send('aim', { aim: null });
  await two.wait(m => m.type === 'aim' && m.aim === null);
  const action = { dir: { x: 1, y: 0 }, speed: 100, spin: { x: 0, y: 0 }, calledPocket: null };
  one.send('shoot', { action });
  const shot = await one.wait(m => m.type === 'shot'); await two.wait(m => m.type === 'shot');
  assert.equal(shot.seq, 1); assert.deepEqual(shot.snapshot, initial.snapshot);
  assert.equal(one.messages.some(m => m.type === 'aim' || m.type === 'error'), false);
  assert.equal(two.messages.filter(m => m.type === 'aim').length, 420);
  two.messages.length = 0;
  one.send('aim', { aim }); // Cannot show a cue while balls are moving.
  one.send('result', { report: { first: null, rails: [], pocketed: [], offTable: [] }, balls: initial.snapshot.balls });
  const state = await one.wait(m => m.type === 'state' && m.seq > shot.seq);
  await two.wait(m => m.type === 'state' && m.seq === state.seq);
  assert.equal(two.messages.some(m => m.type === 'aim'), false);
  assert.equal(state.snapshot.match.turn, 1);
  two.send('aim', { aim });
  assert.equal((await one.wait(m => m.type === 'aim')).seat, 1);
  one.ws.close(); two.ws.close();
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
