import test from 'node:test';
import assert from 'node:assert/strict';
import { flingVelocity, pushSample } from '../src/fling.js';

const sample = (t, x, y = 0) => ({ t, x, y });
const stroke = [sample(0, 0), sample(40, 4), sample(80, 8)];

test('a brief pause and duplicate release position preserve throw momentum', () => {
  for (const delay of [0, 20, 80, 120, 140]) {
    const releasedAt = 80 + delay;
    assert.deepEqual(flingVelocity([...stroke, sample(releasedAt, 8)]), { x: 100, y: 0 });
  }
});

test('stationary mouse events do not erase recent movement', () => {
  assert.deepEqual(flingVelocity([...stroke, sample(100, 8), sample(140, 8), sample(200, 8)]), { x: 100, y: 0 });
});

test('stationary samples do not extend momentum beyond the last movement', () => {
  const samples = [sample(0, 0), sample(40, 40), sample(80, 80), sample(120, 80)];
  for (const releasedAt of [380, 400]) {
    assert.deepEqual(flingVelocity([...samples, sample(releasedAt, 80)]), { x: 0, y: 0 });
  }
});

test('momentum fades during a longer pause and a deliberate hold places the ball', () => {
  const velocity = (delay) => flingVelocity([...stroke, sample(80 + delay, 8)]).x;
  assert.equal(velocity(220), 50);
  assert.equal(velocity(300), 0);
  assert.equal(velocity(1000), 0);
});

test('a very short flick retains momentum instead of failing a minimum-duration check', () => {
  assert.deepEqual(flingVelocity([sample(0, 0), sample(4, 1), sample(5, 1)]), { x: 125, y: 0 });
});

test('sparse events keep the segment crossing the velocity window', () => {
  assert.deepEqual(flingVelocity([sample(0, 0), sample(160, 16), sample(180, 16)]), { x: 100, y: 0 });
});

test('a new flick after holding uses its own speed and direction', () => {
  const samples = [...stroke, sample(500, 8), sample(540, 4, 4), sample(580, 0, 8), sample(600, 0, 8)];
  assert.deepEqual(flingVelocity(samples), { x: -100, y: 100 });
});

test('clicking without moving never flings a ball', () => {
  assert.deepEqual(flingVelocity([sample(0, 3), sample(50, 3)]), { x: 0, y: 0 });
});

test('a hand that slows before the button comes up keeps the speed of the throw', () => {
  // 100 px/s for 80 ms, then a 100 ms deceleration tail down to a crawl before release.
  const tail = [sample(100, 8.6), sample(120, 8.9), sample(140, 9.05), sample(160, 9.1), sample(180, 9.12)];
  assert.deepEqual(flingVelocity([...stroke, ...tail, sample(190, 9.12)]), { x: 100, y: 0 });
});

test('sub-pixel jitter while the hand rests neither counts as a throw nor hides one', () => {
  const rest = (t) => sample(t, 8 + 0.1 * Math.sin(t), 0.1 * Math.cos(t));
  const jitter = [rest(100), rest(120), rest(140), rest(160), rest(180), rest(200)];
  const v = flingVelocity([...stroke, ...jitter]);
  assert.ok(Math.abs(v.x - 100) < 1 && Math.abs(v.y) < 1, `expected ~{100, 0}, got ${JSON.stringify(v)}`);
  const still = flingVelocity([sample(0, 8), ...jitter]);
  assert.ok(Math.hypot(still.x, still.y) < 20, `jitter alone should not fling: ${JSON.stringify(still)}`);
});

test('a throw that fades during a long tail still places the ball after a full hold', () => {
  const tail = [sample(100, 8.6), sample(120, 8.9), sample(140, 9.05)];
  assert.equal(flingVelocity([...stroke, ...tail, sample(440, 9.05)]).x, 0);   // 300 ms after the last movement
  const faded = flingVelocity([...stroke, ...tail, sample(300, 9.05)]).x;
  assert.ok(faded > 30 && faded < 70, `expected a faded throw, got ${faded}`);
});

test('the sample history keeps only what a throw can depend on', () => {
  const samples = [];
  for (let t = 0; t <= 1000; t += 100) pushSample(samples, sample(t, t));
  assert.ok(samples.length < 8 && samples[0].t <= 600 && samples.at(-1).t === 1000, JSON.stringify(samples.map((s) => s.t)));
});
