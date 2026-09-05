import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPointerInput } from '../src/pointer-input.js';

function setup() {
  const canvas = new EventTarget(), window = new EventTarget(), calls = [];
  canvas.ownerDocument = { body: { style: {} }, defaultView: window };
  canvas.setPointerCapture = (id) => calls.push(['capture', id]);
  const scene = {
    pointerdown: () => true,
    pointermove: () => false,
    pointerup: (e) => calls.push(['release', e.pointerId]),
    pointercancel: () => calls.push(['cancel']),
  };
  connectPointerInput(canvas, scene);
  const emit = (type, buttons = 0, pointerId = 7) => canvas.dispatchEvent(Object.assign(new Event(type), { pointerId, buttons }));
  return { canvas, window, scene, calls, emit, style: canvas.ownerDocument.body.style };
}

for (const order of [['lostpointercapture', 'pointerup'], ['pointerup', 'lostpointercapture']]) {
  test(`${order.join(' then ')} completes the gesture exactly once`, () => {
    const { emit, calls } = setup();
    // Repeat without reconnecting: event routing must remain valid after the first gesture.
    for (let i = 0; i < 3; i++) { emit('pointerdown', 1); for (const type of order) emit(type); }
    assert.deepEqual(calls, Array.from({ length: 3 }, () => [['capture', 7], ['release', 7]]).flat());
  });
}

test('losing capture while pressed cancels the gesture', () => {
  const { emit, calls } = setup();
  emit('pointerdown', 1); emit('lostpointercapture', 1); emit('pointerup');
  assert.deepEqual(calls, [['capture', 7], ['cancel']]);
});

test('pointercancel and window blur cancel only a gesture in progress', () => {
  const { emit, calls, window } = setup();
  emit('pointercancel'); window.dispatchEvent(new Event('blur'));
  assert.deepEqual(calls, []);
  emit('pointerdown', 1); window.dispatchEvent(new Event('blur'));
  assert.deepEqual(calls, [['capture', 7], ['cancel']]);
});

test('other pointers cannot move or complete the captured gesture', () => {
  const { emit, calls, scene } = setup();
  const moves = []; scene.pointermove = (e) => { moves.push(e.pointerId); return false; };
  emit('pointerdown', 1); emit('pointermove', 1, 9); emit('pointerup', 0, 9); emit('pointermove', 1); emit('pointerup');
  assert.deepEqual(moves, [7]);
  assert.deepEqual(calls, [['capture', 7], ['release', 7]]);
});

test('the cursor shows grabbing during a gesture and the hover state otherwise', () => {
  const { emit, scene, style } = setup();
  emit('pointerdown', 1); emit('pointermove', 1);
  assert.equal(style.cursor, 'grabbing');
  emit('pointerup');
  assert.equal(style.cursor, 'default');
  scene.pointermove = () => true; emit('pointermove');
  assert.equal(style.cursor, 'grab');
});
