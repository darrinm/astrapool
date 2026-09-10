import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ReplayView } from './replay-view.js';

test('replay controls move only clones and restore live render layers without disposing shared assets', () => {
  const elements = new Map();
  let controlWrites = 0;
  globalThis.document = { body: { classList: { add() {}, remove() {} } }, hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: '1', events: {}, addEventListener(type, fn) { this.events[type] = fn; }, setAttribute() { controlWrites++; }, focus() {} });
      return elements.get(id);
    } };
  const scene = new THREE.Scene(), geometry = new THREE.SphereGeometry(1), material = new THREE.MeshBasicMaterial();
  const live = new THREE.Mesh(geometry, material), child = new THREE.Mesh(geometry, material);
  live.add(child); scene.add(live); child.layers.mask = 3;
  live.position.set(100, 100, 100); live.visible = false;
  let disposed = 0;
  geometry.addEventListener('dispose', () => disposed++); material.addEventListener('dispose', () => disposed++);
  const poses = (visible, x) => new Float32Array([visible, x, 0, 0, 0, 0, 0, 1]);
  const clip = { duration: 2, metadata: { label: 'Player 1' }, numbers: [0],
    frames: [{ time: 0, poses: poses(1, 0) }, { time: 1, poses: poses(1, 10) }, { time: 2, poses: poses(0, 10) }] };
  const view = new ReplayView({ scene, exit: () => view.stop() });
  view.start(clip, [{ number: 0, mesh: live }]);
  assert.equal(live.layers.mask, 0); assert.equal(child.layers.mask, 0);
  assert.equal(view.balls[0].mesh.visible, true, 'a potted ball appears at its recorded position');
  const seek = elements.get('replay-seek'); seek.value = '.5'; seek.events.input();
  assert.equal(view.paused, true); assert.equal(view.balls[0].mesh.position.x, 5);
  const writesAtPause = controlWrites;
  for (let i = 0; i < 60; i++) view.frame();
  assert.equal(controlWrites, writesAtPause, 'paused frames leave the controls alone');
  assert.deepEqual(live.position.toArray(), [100, 100, 100]); assert.equal(live.visible, false);
  seek.value = '2'; seek.events.input(); assert.equal(view.balls[0].mesh.visible, false);
  elements.get('replay-play').events.click(); assert.equal(view.time, 0); assert.equal(view.paused, false);
  view.time = 1.99; view.lastFrame -= 100; view.frame();
  assert.equal(view.time, 2); assert.equal(view.paused, true);
  assert.equal(view.balls[0].mesh.visible, false, 'the final advancing frame still renders the pocketed ball');
  assert.equal(elements.get('replay-play').textContent, 'Play');
  elements.get('replay-controls').events.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(view.active, false, 'Escape exits even when a replay form control is focused');
  view.start(clip, [{ number: 0, mesh: live }]);
  elements.get('replay-close').events.click();
  assert.equal(live.layers.mask, 1); assert.equal(child.layers.mask, 3);
  assert.equal(scene.children.length, 1); assert.equal(disposed, 0);
  assert.equal(view.clip, null); assert.equal(view.active, false);
  delete globalThis.document; geometry.dispose(); material.dispose();
});
