import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPointerInput } from '../src/pointer-input.js';
import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function setup(withCamera = false) {
  const canvas = new EventTarget(), window = new EventTarget(), document = new EventTarget(), calls = [];
  class PointerEvent extends Event {
    constructor(type, { bubbles = true, ...init } = {}) { super(type, { bubbles, cancelable: true }); Object.assign(this, init); }
  }
  window.PointerEvent = PointerEvent;
  document.body = { style: {} }; document.defaultView = window;
  canvas.ownerDocument = document;
  canvas.style = {}; canvas.getRootNode = () => document;
  canvas.clientWidth = 390; canvas.clientHeight = 844;
  const captures = new Set();
  canvas.setPointerCapture = (id) => { captures.add(id); calls.push(['capture', id]); };
  canvas.hasPointerCapture = (id) => captures.has(id);
  canvas.releasePointerCapture = (id) => captures.delete(id);
  const camera = new PerspectiveCamera(48, 390 / 844, 0.1, 800);
  camera.position.set(0, 0, 50);
  const controls = withCamera ? new OrbitControls(camera, null) : null;
  const scene = {
    pointerdown: () => true,
    pointermove: () => false,
    pointerup: (e) => { calls.push(['release', e.pointerId]); if (controls) controls.enabled = true; },
    pointercancel: () => { calls.push(['cancel']); if (controls) controls.enabled = true; },
  };
  const disconnect = connectPointerInput(canvas, scene, controls);
  // EventTarget has no DOM capture phase: register the router first to model its capture priority.
  controls?.connect(canvas);
  const emit = (type, buttons = 0, pointerId = 7, extra = {}, target = canvas) => {
    const event = new PointerEvent(type, { pointerId, buttons, pointerType: 'mouse', button: 0, clientX: 100, clientY: 100, pageX: 100, pageY: 100, ...extra });
    target.dispatchEvent(event);
    if (target !== document && ['pointerup', 'pointermove', 'pointercancel'].includes(type)) document.dispatchEvent(event);
    return event;
  };
  return { canvas, window, document, scene, calls, emit, controls, camera, captures, disconnect, style: document.body.style };
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

test('touch capture loss cancels without shooting, even with no buttons held', () => {
  const { emit, calls, captures } = setup();
  emit('pointerdown', 1, 7, { pointerType: 'touch' });
  emit('lostpointercapture', 0, 7, { pointerType: 'touch' });
  emit('pointerup', 0, 7, { pointerType: 'touch' });
  assert.deepEqual(calls, [['capture', 7], ['cancel']]);
  assert.equal(captures.size, 0);
});

test('a release outside the canvas completes the cue gesture exactly once', () => {
  const { emit, calls, document } = setup();
  emit('pointerdown', 1);
  emit('pointerup', 0, 7, {}, document);
  emit('lostpointercapture');
  assert.deepEqual(calls, [['capture', 7], ['release', 7]]);
});

test('a fresh primary touch recovers a lost cue release without shooting', () => {
  const { emit, calls } = setup();
  const touch = { pointerType: 'touch', isPrimary: true };
  assert.equal(emit('pointerdown', 1, 7, touch).defaultPrevented, true);
  emit('pointerdown', 1, 8, touch);
  emit('pointerup', 0, 7, touch); // a late release cannot complete the new gesture
  emit('pointerup', 0, 8, touch);
  assert.deepEqual(calls, [['capture', 7], ['cancel'], ['capture', 8], ['release', 8]]);
});

for (const interruption of ['blur', 'pagehide', 'visibilitychange', 'lostpointercapture', 'pointercancel']) {
  test(`${interruption} clears camera touches before the next one-finger drag`, () => {
    const { emit, scene, window, document, controls, camera } = setup(true);
    scene.pointerdown = () => false;
    emit('pointerdown', 1, 7, { pointerType: 'touch', isPrimary: true });
    if (interruption === 'visibilitychange') {
      document.hidden = true; document.dispatchEvent(new Event(interruption));
    } else if (['blur', 'pagehide'].includes(interruption)) window.dispatchEvent(new Event(interruption));
    else emit(interruption, 0, 7, { pointerType: 'touch' });
    assert.deepEqual(controls._pointers, []);
    const before = camera.position.clone();
    emit('pointermove', 1, 7, { pointerType: 'touch', pageX: 160 });
    assert.ok(camera.position.equals(before), 'interrupted touch must no longer move the camera');
    emit('pointerdown', 1, 9, { pointerType: 'touch', isPrimary: true });
    emit('pointermove', 1, 9, { pointerType: 'touch', pageX: 160 });
    assert.ok(!camera.position.equals(before), 'a new one-finger orbit must work');
    assert.ok(controls.target.length() < 1e-10, 'a stale finger must not turn orbit into pan');
  });
}

test('two-finger pan returns to one-finger orbit and recovers a missing final up', () => {
  const { emit, scene, controls, camera } = setup(true);
  scene.pointerdown = () => false;
  emit('pointerdown', 1, 7, { pointerType: 'touch', isPrimary: true });
  emit('pointerdown', 1, 8, { pointerType: 'touch', pageX: 200 });
  emit('pointermove', 1, 8, { pointerType: 'touch', pageX: 230 });
  assert.ok(controls.target.length() > 0, 'two fingers pan');
  emit('pointerup', 0, 8, { pointerType: 'touch' });
  const target = controls.target.clone(), before = camera.position.clone();
  emit('pointermove', 1, 7, { pointerType: 'touch', pageX: 130 });
  assert.ok(controls.target.distanceTo(target) < 1e-10, 'remaining finger orbits without panning');
  assert.ok(!camera.position.equals(before));
  // No up for 7: the browser identifies 9 as a fresh primary touch.
  emit('pointerdown', 1, 9, { pointerType: 'touch', isPrimary: true });
  assert.deepEqual(controls._pointers, [9]);
  emit('pointerup', 0, 9, { pointerType: 'touch' });
  assert.deepEqual(controls._pointers, []);
});

test('claiming a cue gesture clears a previous camera gesture and ignores extra fingers', () => {
  const { emit, scene, controls, camera, calls } = setup(true);
  scene.pointerdown = () => false;
  emit('pointerdown', 1, 7, { pointerType: 'touch', isPrimary: true });
  scene.pointerdown = () => { controls.enabled = false; return true; };
  emit('pointerdown', 1, 8, { pointerType: 'touch' });
  emit('pointerdown', 1, 9, { pointerType: 'touch' });
  assert.deepEqual(controls._pointers, []);
  const before = camera.position.clone();
  emit('pointerup', 0, 8, { pointerType: 'touch' });
  emit('pointermove', 1, 9, { pointerType: 'touch', pageX: 160 });
  assert.ok(camera.position.equals(before));
  assert.deepEqual(calls.filter(c => c[0] === 'release'), [['release', 8]]);
});

test('disconnect cancels camera input and removes recovery listeners', () => {
  const { emit, scene, controls, disconnect, window, calls } = setup(true);
  scene.pointerdown = () => false;
  emit('pointerdown', 1, 7, { pointerType: 'touch' });
  disconnect();
  assert.deepEqual(controls._pointers, []);
  controls.disconnect();
  calls.length = 0;
  emit('pointerdown', 1); window.dispatchEvent(new Event('blur'));
  assert.deepEqual(calls, []);
});
