import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameplayAnalytics, analyticsSettings, sendGameAnalytics } from './game-analytics.js';

function fixture(send) {
  let time = 1700000000000, settings = { difficulty: 'tricky', room: 'orbital', sound: 'on' };
  const sent = [];
  const analytics = new GameplayAnalytics({ send: send || ((record, beacon) => { sent.push({ ...record, beacon }); return true; }),
    settings: () => settings, now: () => time });
  return { analytics, sent, advance: ms => { time += ms; }, configure: next => { settings = { ...settings, ...next }; } };
}
test('menu visits, attract shots and online client shots never start browser games', () => {
  const { analytics: a, sent } = fixture();
  a.shot(); a.select(null); a.shot(); a.select('online'); a.shot(); a.select('computer');
  assert.equal(sent.length, 0);
  a.enabled = false; a.shot(); assert.equal(sent.length, 0);
});
test('first shot starts one rack; cumulative updates retain starting settings and finish once', () => {
  const { analytics: a, sent, advance, configure } = fixture();
  a.select('computer'); a.shot();
  assert.equal(sent.length, 1); assert.equal(sent[0].shots, 1);
  advance(1000); a.shot(); assert.equal(sent.length, 1);
  configure({ difficulty: 'hard' }); a.settingsChanged();
  advance(60000); a.finish('player', 250.4); a.finish('computer'); a.end('page_exit'); a.shot();
  assert.equal(sent.length, 2);
  const last = sent[1]; assert.equal(last.id, sent[0].id); assert.equal(last.shots, 2);
  assert.equal(last.durationMs, 61000); assert.equal(last.outcome, 'player'); assert.equal(last.score, 250);
  assert.equal(last.initialSettings.difficulty, 'tricky'); assert.equal(last.settings.difficulty, 'hard');
  assert.equal(last.settingsChanges, 1); assert.equal(last.endedAt, null);
});
test('switches and restarts end a rack without calling it finished, with a fresh ID for the next', () => {
  const { analytics: a, sent, advance } = fixture();
  a.select('local'); a.shot(); advance(3000); a.select('free');
  assert.equal(sent[1].endReason, 'switch'); assert.equal(sent[1].finishedAt, null);
  a.shot(); assert.notEqual(sent[2].id, sent[0].id);
  a.end('restart'); a.select('free'); a.shot(); a.finish('cleared');
  assert.equal(sent.at(-1).outcome, 'cleared'); assert.notEqual(sent.at(-1).id, sent[2].id);
});
test('page exit sends a beacon; background checkpoints leave the rack open', () => {
  const { analytics: a, sent, advance } = fixture();
  a.select('local'); a.shot(); advance(35000); a.checkpoint();
  assert.equal(sent.at(-1).endedAt, null); assert.equal(sent.at(-1).finishedAt, null);
  a.end('page_exit', true); assert.equal(sent.at(-1).beacon, true); assert.equal(sent.at(-1).endReason, 'page_exit');
});
test('failed analytics cannot interrupt a shot and can retry the cumulative snapshot', async () => {
  const sent = []; let fail = true;
  const { analytics: a, advance } = fixture(record => { if (fail) throw new Error('offline'); sent.push(record); return true; });
  a.select('computer'); assert.doesNotThrow(() => a.shot());
  fail = false; advance(35000); a.checkpoint();
  assert.equal(sent.length, 1); assert.equal(sent[0].shots, 1);
  a.send = async () => false; a.finish('player'); await Promise.resolve();
  assert.equal(a.dirty, true); a.send = record => { sent.push(record); return true; }; advance(35000); a.flush();
  assert.equal(sent.at(-1).outcome, 'player');
});
test('settings contain only known, bounded categories', () => {
  const settings = analyticsSettings({ room: 'https://secret', difficulty: 'tricky', token: 'secret', device: 'mobile' });
  assert.equal(settings.room, 'unknown'); assert.equal(settings.difficulty, 'tricky');
  assert.equal(settings.token, undefined); assert.equal(settings.device, 'mobile');
});

for (const reason of ['switch', 'restart']) test(`failed ${reason} delivery retries after selecting another rack`, async () => {
  const attempts = []; let resolveEnd;
  const { analytics: a, advance } = fixture(record => {
    attempts.push(record);
    if (record.endReason && !resolveEnd) return new Promise(resolve => { resolveEnd = resolve; });
    return true;
  });
  a.select('local'); a.shot(); await Promise.resolve();
  if (reason === 'restart') a.end('restart');
  a.select('computer'); a.shot();
  resolveEnd(false); await Promise.resolve();
  const ended = attempts.find(record => record.endReason);
  assert.equal(ended.endReason, reason);
  a.flush(); assert.equal(attempts.filter(record => record.id === ended.id).length, 2);
  advance(30000); a.flush(); await Promise.resolve();
  assert.equal(attempts.filter(record => record.id === ended.id).length, 3);
  assert.equal(attempts.at(-1).endedAt, ended.endedAt);
  assert.equal(a.pending.has(ended.id), false);
  advance(30000); a.flush(); assert.equal(attempts.filter(record => record.id === ended.id).length, 3);
});

test('an old request failure cannot dirty a successfully delivered terminal snapshot', async () => {
  let rejectStart;
  const { analytics: a } = fixture(record => record.finishedAt ? true : new Promise((resolve, reject) => { rejectStart = reject; }));
  a.select('computer'); a.shot(); a.finish('player'); await Promise.resolve();
  rejectStart(new Error('late failure')); await Promise.resolve();
  assert.equal(a.dirty, false); assert.equal(a.pending.size, 0);
});

test('retired racks retry while no new game is selected and the outage buffer stays bounded', async () => {
  const attempts = [];
  const { analytics: a, advance } = fixture(record => { attempts.push(record); return false; });
  for (let i = 0; i < 25; i++) { a.select('local'); a.shot(); }
  a.select(null); await Promise.resolve();
  assert.equal(a.pending.size, 20);
  const before = attempts.length; advance(30000); a.flush();
  assert.equal(attempts.length - before, 20);
  assert.ok(attempts.slice(-20).every(record => record.endReason === 'switch'));
});

test('a queued beacon stays pending until a later fetch confirms delivery', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); let beacons = 0, requests = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: () => { beacons++; return true; } } });
  t.after(() => Object.defineProperty(globalThis, 'navigator', descriptor));
  t.mock.method(globalThis, 'fetch', async () => { requests++; return { ok: true }; });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const { analytics: a, advance } = fixture(sendGameAnalytics);
  a.select('computer'); a.shot(); await settle();
  advance(1000); a.checkpoint(); a.flush(true, true); await settle();
  assert.equal(beacons, 1); assert.equal(requests, 1); assert.equal(a.pending.size, 1);
  assert.equal(a.dirty, true); // The tab can return from the background and confirm through fetch.
  advance(30000); a.flush(); await settle();
  assert.equal(requests, 2); assert.equal(a.pending.size, 0);
});
