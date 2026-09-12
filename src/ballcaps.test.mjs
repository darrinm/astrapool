// Which texture each ball shows.
//
// These two decisions shipped a visible regression: removing public/heads from the
// repository left every numbered ball on the flat placeholder colour core.js gives
// a head before its photograph loads. The numbered ball is generated from scratch
// and never needed that photograph, but it was produced inside a branch guarded on
// the photograph having loaded, so with no photographs it was never produced.
//
// The repair then introduced a second fault worth pinning: the game writes its own
// generated texture onto the same material, so "a map with pixels" is not a test
// for "the head has arrived". Baking a cap onto the generated ball stored a capped
// ball as the head, and the real head, landing afterwards, was never displaced.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseBallMap, loadedHead } from './ballcaps.js';

const entry = (over = {}) => ({ ball: { id: 'ball' }, capped: null, ...over });
const loaded = { id: 'head', image: { width: 2048, height: 1024 } };

test('numbered balls do not depend on a head texture', () => {
  // The public build: no head ever loads, and the ball must still have its texture.
  assert.equal(chooseBallMap(entry(), 'balls').id, 'ball');
});

test('heads style falls back to the numbered ball when no head has loaded', () => {
  assert.equal(chooseBallMap(entry(), 'heads').id, 'ball');
});

test('heads style uses the capped head once it exists', () => {
  const e = entry({ capped: { id: 'capped' } });
  assert.equal(chooseBallMap(e, 'heads').id, 'capped');
});

test('balls style keeps the numbered ball even when a capped head exists', () => {
  const e = entry({ capped: { id: 'capped' } });
  assert.equal(chooseBallMap(e, 'balls').id, 'ball');
});

test('the generated ball is never mistaken for a loaded head', () => {
  const e = entry();
  // e.ball has pixels, so a test of "has an image" would wrongly accept it here.
  e.ball.image = { width: 1024, height: 512 };
  assert.equal(loadedHead(e.ball, e), null);
});

test('a capped head we produced is never mistaken for a fresh head', () => {
  const e = entry({ capped: { id: 'capped', image: { width: 2048, height: 1024 } } });
  assert.equal(loadedHead(e.capped, e), null);
});

test('a texture the loader supplied is recognised as the head', () => {
  assert.equal(loadedHead(loaded, entry()), loaded);
});

test('a map with no decoded image yet is not the head', () => {
  assert.equal(loadedHead({ id: 'pending', image: undefined }, entry()), null);
  assert.equal(loadedHead({ id: 'zero', image: { width: 0 } }, entry()), null);
  assert.equal(loadedHead(null, entry()), null);
});
