import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { RoomAnalytics, roomAlarmTime } from './room-analytics.js';
import { newGameAnalytics, updateGameAnalytics } from '../src/game-analytics.js';

function sqlStorage(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  return { exec(query, ...args) { const rows = db.prepare(query).all(...args); return { toArray: () => rows }; } };
}
test('failed final records survive room reconstruction and a rematch', async t => {
  const sql = sqlStorage(t), final = newGameAnalytics('online', {});
  final.finishedAt = Date.now(); final.outcome = 'player1';
  const first = new RoomAnalytics(sql, async () => { throw new Error('D1 unavailable'); });
  first.enqueue(final); await first.flush(); assert.equal(first.pending, true);
  const sent = [], restored = new RoomAnalytics(sql, async record => { sent.push(record); });
  const rematch = newGameAnalytics('online', {}); restored.enqueue(rematch);
  await restored.flush();
  assert.deepEqual(new Set(sent.map(record => record.id)), new Set([final.id, rematch.id]));
  assert.equal(sent.find(record => record.id === final.id).outcome, 'player1');
  assert.equal(restored.pending, false);
});
test('delivery is awaited and concurrent flushes share one write', async t => {
  const sql = sqlStorage(t); let release, writes = 0, completed = false;
  const outbox = new RoomAnalytics(sql, async () => { writes++; await new Promise(resolve => { release = resolve; }); });
  outbox.enqueue(newGameAnalytics('online', {}));
  const one = outbox.flush().then(() => { completed = true; }), two = outbox.flush();
  await Promise.resolve(); assert.equal(completed, false); assert.equal(writes, 1);
  release(); await Promise.all([one, two]); assert.equal(outbox.pending, false);
  await outbox.flush(); await outbox.flush(); assert.equal(writes, 1);
});
test('a newer final snapshot cannot be removed by an in-flight start acknowledgement', async t => {
  const sql = sqlStorage(t); let release; const sent = [];
  const outbox = new RoomAnalytics(sql, async record => {
    sent.push(record); if (sent.length === 1) await new Promise(resolve => { release = resolve; });
  });
  const start = newGameAnalytics('online', {}); outbox.enqueue(start);
  const flushing = outbox.flush();
  const final = { ...start, version: start.version + 1, finishedAt: Date.now(), outcome: 'player2' };
  outbox.enqueue(final); release(); await flushing;
  assert.equal(sent.length, 2); assert.equal(sent[1].outcome, 'player2'); assert.equal(outbox.pending, false);
});
test('online peer snapshots do not inflate settings-change counts', () => {
  const one = { room: 'orbital', device: 'desktop' }, two = { room: 'tokyo', device: 'mobile' };
  const record = newGameAnalytics('online', one);
  for (let i = 0; i < 12; i++) updateGameAnalytics(record, i % 2 ? two : one, Date.now(), { countSettingsChanges: false });
  assert.equal(record.settingsChanges, 0); assert.equal(record.initialSettings.room, 'orbital'); assert.equal(record.settings.room, 'tokyo');
  const local = newGameAnalytics('local', one); updateGameAnalytics(local, two); assert.equal(local.settingsChanges, 1);
});
test('retry alarms preserve the shot timeout and room expiry deadlines', () => {
  const now = 1700000000000, room = { updated: now, pending: { started: now } };
  assert.equal(roomAlarmTime(room, true, now), now + 60000);
  assert.equal(roomAlarmTime(room, true, now + 60000), now + 90000);
  assert.equal(roomAlarmTime(room, false, now + 95000), now + 95000);
  room.pending = null;
  assert.equal(roomAlarmTime(room, false, now), now + 86400000);
  assert.equal(roomAlarmTime(room, true, now + 86400000), now + 86460000);
});
