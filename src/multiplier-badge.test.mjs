import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplierBadge } from './multiplier-badge.js';

function fixture() {
  const label = {}, animations = [];
  const element = { dataset: {}, querySelector: () => label, setAttribute() {}, animate(frames) {
    let finish;
    const animation = { frames, finished: new Promise(resolve => { finish = resolve; }), finish: () => finish(), cancel() { this.cancelled = true; } };
    animations.push(animation); return animation;
  } };
  return { badge: new MultiplierBadge(element), element, label, animations };
}
test('a lost streak shows one broken-chain transition then returns to the ordinary multiplier', async () => {
  const { badge, element, label, animations } = fixture();
  badge.update(2, 'rack1', 2); assert.equal(element.dataset.hot, 'true');   // a live streak takes the player's colour
  badge.update(1, 'rack1', 3); badge.update(1, 'rack1', 3);
  assert.equal(element.dataset.hot, undefined);
  assert.equal(animations.length, 1); assert.equal(element.dataset.reset, 'true'); assert.equal(label.textContent, '×1');
  animations[0].finish(); await animations[0].finished;
  assert.equal(element.dataset.reset, undefined);
});
test('joining, rack resets, skipped snapshots, hidden Arcade, and settings do not replay a lost streak', () => {
  const { badge, animations } = fixture();
  badge.update(3, 'rack1', 3); badge.update(1, 'rack1', 6);
  badge.update(3, 'rack1', 7); badge.update(1, 'rack2', 0);
  badge.update(2, 'rack2', 2); badge.update(1, 'rack2', 3, { visible: false });
  badge.update(1, 'rack2', 3);
  assert.equal(animations.length, 0);
});
test('reduced motion keeps the broken-chain cue without movement, and old completions cannot clear a new reset', async () => {
  const { badge, animations, element } = fixture();
  badge.update(2, 'rack1', 2); badge.update(1, 'rack1', 3, { reduced: true });
  assert.ok(animations[0].frames.every(frame => frame.transform === 'none'));
  badge.update(2, 'rack1', 4); badge.update(1, 'rack1', 5);
  animations[0].finish(); await animations[0].finished;
  assert.equal(element.dataset.reset, 'true');
  badge.update(1, 'rack1', 5, { silent: true });
  assert.equal(element.dataset.reset, undefined);
});
