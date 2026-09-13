import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScoreCounter } from './score-counter.js';

function fixture(t) {
  const frames = new Map(), animations = [];
  let id = 0;
  t.mock.method(globalThis, 'requestAnimationFrame', callback => { frames.set(++id, callback); return id; });
  t.mock.method(globalThis, 'cancelAnimationFrame', key => frames.delete(key));
  const element = { textContent: '', setAttribute() {}, animate() {
    const a = { cancel() { this.cancelled = true; } }; animations.push(a); return a;
  } };
  const counter = new ScoreCounter(element);
  const advance = elapsed => {
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(performance.now() + elapsed);
  };
  return { counter, element, animations, frames, advance };
}

// Node has no browser frame scheduler; install replaceable stubs for each test.
globalThis.requestAnimationFrame = () => {};
globalThis.cancelAnimationFrame = () => {};

test('confirmed gains count upward once and finish at the exact score', t => {
  const { counter, element, animations, advance } = fixture(t);
  counter.update(100, 'rack1', 1);
  counter.update(1338, 'rack1', 2);
  assert.equal(element.textContent, '100');
  counter.update(1338, 'rack1', 2);
  assert.equal(animations.length, 1);
  advance(300);
  const intermediate = Number(element.textContent.replaceAll(',', ''));
  assert.ok(intermediate > 100 && intermediate < 1338);
  advance(1000);
  assert.equal(element.textContent, (1338).toLocaleString());
});

test('joins, missed shots, different rooms, and rack resets establish a quiet baseline', t => {
  const { counter, element, animations } = fixture(t);
  counter.update(900, 'room1:rack1', 4);
  counter.update(1300, 'room1:rack1', 7);
  counter.update(1500, 'room2:rack1', 8);
  counter.update(0, 'room2:rack2', 0);
  assert.equal(animations.length, 0);
  assert.equal(element.textContent, '0');
});

test('reduced motion, hidden scores and resets cancel an in-flight count', t => {
  const { counter, element, frames, animations } = fixture(t);
  counter.update(0, 'rack1', 0);
  counter.update(500, 'rack1', 1);
  counter.update(500, 'rack1', 1, false);
  assert.equal(frames.size, 0);
  assert.equal(animations[0].cancelled, true);
  assert.equal(element.textContent, '500');
  counter.update(800, 'rack1', 2, false);
  assert.equal(animations.length, 1);
  counter.update(900, 'rack1', 3);
  counter.update(0, 'rack2', 0);
  assert.equal(frames.size, 0);
  assert.equal(element.textContent, '0');
});

test('a newer gain replaces the previous count and missing scores never animate', t => {
  const { counter, element, animations, frames, advance } = fixture(t);
  counter.update(null, 'rack1', 0);
  counter.update(100, 'rack1', 1);
  assert.equal(animations.length, 0);
  counter.update(300, 'rack1', 2);
  counter.update(700, 'rack1', 3);
  assert.equal(frames.size, 1);
  assert.equal(animations[0].cancelled, true);
  advance(1000);
  assert.equal(element.textContent, '700');
});
