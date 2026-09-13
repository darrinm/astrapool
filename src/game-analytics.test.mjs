import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameplayAnalytics, analyticsSettings } from './game-analytics.js';

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
