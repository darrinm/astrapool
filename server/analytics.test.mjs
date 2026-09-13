import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { newGameAnalytics } from '../src/game-analytics.js';
import { validateGame, writeGame, report, handleAnalytics, readBoundedJSON } from './analytics.js';

function database(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(readFileSync(new URL('../migrations/0001_gameplay.sql', import.meta.url), 'utf8'));
  const env = { GAME_ANALYTICS: {
    prepare(sql) { return { bind(...args) { return { run: async () => db.prepare(sql).run(...args),
      all: () => ({ results: db.prepare(sql).all(...args).map(row => ({ ...row })) }) }; } }; },
    batch: async queries => queries.map(query => query.all()),
  } };
  return { db, env };
}
function game(mode = 'computer', now = Date.now()) {
  return { ...newGameAnalytics(mode, { difficulty: 'tricky', room: 'orbital', device: 'mobile' }, now), shots: 1 };
}
const request = (body, origin = 'https://pool.test') => new Request('https://pool.test/api/analytics/game', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
test('ingestion validates shape and prevents client-authored online games and unbounded settings', () => {
  const g = game();
  assert.equal(validateGame(g).mode, 'computer');
  for (const patch of [{ mode: 'online' }, { id: 'x' }, { shots: 0 }, { shots: 1.5 }, { durationMs: -1 },
    { startedAt: 0 }, { finishedAt: Date.now(), outcome: 'cleared' }, { endedAt: Date.now(), endReason: 'arbitrary' },
    { version: Infinity }, { score: -2 }, { settingsChanges: '0' }]) assert.throws(() => validateGame({ ...g, ...patch }));
  const clean = validateGame({ ...g, visitor: 'private', settings: { room: 'private', token: 'private' } });
  assert.equal(clean.visitor, undefined); assert.equal(clean.settings.token, undefined); assert.equal(clean.settings.room, 'unknown');
});
test('duplicate, stale and reordered snapshots count once; terminal records cannot be reopened', async t => {
  const { env, db } = database(t), g = game();
  await writeGame(env, g); await writeGame(env, g);
  const finished = { ...g, version: 4, shots: 3, durationMs: 60000, finishedAt: Date.now(), outcome: 'player' };
  await writeGame(env, finished); await writeGame(env, { ...g, version: 2, shots: 2 });
  await writeGame(env, { ...g, version: 9, shots: 9 });
  const rows = db.prepare('SELECT * FROM games').all();
  assert.equal(rows.length, 1); assert.equal(rows[0].shots, 3); assert.equal(rows[0].outcome, 'player');
  const second = { ...finished, id: crypto.randomUUID() };
  await writeGame(env, second); await writeGame(env, { ...g, id: second.id });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM games WHERE finished_at IS NOT NULL').get().n, 2);
});
test('source, mode, start time and initial settings remain stable on updates', async t => {
  const { env, db } = database(t), g = game();
  await writeGame(env, g);
  await writeGame(env, { ...g, version: 2, mode: 'online', shots: 8 }, 'room');
  assert.equal(db.prepare('SELECT shots FROM games').get().shots, 1);
  await writeGame(env, { ...g, version: 3, startedAt: g.startedAt + 100, initialSettings: { room: 'corner' },
    settings: { ...g.settings, room: 'corner' }, settingsChanges: 1, shots: 2 });
  const row = db.prepare('SELECT * FROM games').get();
  assert.equal(row.started_at, g.startedAt); assert.equal(JSON.parse(row.initial_settings).room, 'orbital');
  assert.equal(JSON.parse(row.settings).room, 'corner'); assert.equal(row.settings_changes, 1);
});
test('reports group start cohorts, outcomes and initial settings, with mode and time filters', async t => {
  const { env } = database(t), now = Date.now(), day = 86400000;
  const records = [game('computer', now - day), game('local', now - day), game('free', now - 2 * day), game('local', now - 40 * day)];
  Object.assign(records[0], { finishedAt: now, outcome: 'player', durationMs: 60000, shots: 10, settingsChanges: 1 });
  Object.assign(records[1], { endedAt: now, endReason: 'page_exit' });
  for (const g of records) await writeGame(env, g);
  const result = await report(env, 7, 'all', now);
  assert.deepEqual(result.summary, { started: 3, finished: 1, ended: 1, shots: 12, avg_seconds: 60, settings_changes: 1 });
  assert.equal(result.daily.length, 2); assert.equal(result.settings.room[0].started, 3);
  assert.deepEqual(result.outcomes, [{ name: 'player', count: 1 }]);
  assert.equal((await report(env, 7, 'computer', now)).summary.started, 1);
  assert.equal((await report(env, 90, 'local', now)).summary.started, 2);
});
test('empty reports have zero counts and an unavailable average duration', async t => {
  const { env } = database(t);
  assert.deepEqual((await report(env)).summary, { started: 0, finished: 0, ended: 0, shots: 0, avg_seconds: null, settings_changes: 0 });
});
test('collector rejects foreign origins, malformed payloads, rate excess and public reporting', async t => {
  const { env } = database(t);
  assert.equal((await handleAnalytics(request(game(), 'https://elsewhere.test'), env)).status, 403);
  assert.equal((await handleAnalytics(request({}), env)).status, 400);
  assert.equal((await handleAnalytics(request(game()), env)).status, 204);
  assert.equal((await handleAnalytics(new Request('https://pool.test/api/analytics/report'), env)).status, 404);
  assert.equal((await handleAnalytics(request(game()), { ...env, ANALYTICS_RATE_LIMIT: { limit: async () => ({ success: false }) } })).status, 429);
});
test('streaming JSON body is bounded even without content-length', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3000)); controller.enqueue(new Uint8Array(3000)); controller.close(); } });
  const req = new Request('https://pool.test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' });
  await assert.rejects(readBoundedJSON(req), /Too large/);
  assert.deepEqual(await readBoundedJSON(request({ a: 1 })), { a: 1 });
});
