import * as THREE from 'three';
import { renderer, scene, camera, world, eventQueue, syncMeshes, snapshotPoses, heads } from './core.js';
import pool from './pool.js';
import { connectPointerInput } from './pointer-input.js';
import { connectHud } from './hud.js';
import { connectEnvironmentPicker } from './environment-picker.js';
import { connectWelcome } from './welcome.js';
import { stepPhysics } from './physics-step.js';
import { finishLoading } from './loading.js';

const current = pool;
const STEP = 1 / current.stepRate;   // 480 Hz: see the note on stepRate in pool.js
let accumulator = 0;
world.timestep = STEP;
const environmentReady = current.enter();
connectHud(current);
connectEnvironmentPicker(current);

// ---------- input ----------
connectPointerInput(renderer.domElement, current);
addEventListener('keydown', (e) => {
  if (!document.getElementById('loading-screen').hidden) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.target.closest('input, textarea, select, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'm') { toggleSound(); return; }
  if (document.querySelector('dialog[open]')) return;
  current.key(k);
});
function toggleSound() {
  window.playful.mute = !window.playful.mute;
  for (const button of document.querySelectorAll('[data-sound-toggle]')) {
    button.setAttribute('aria-pressed', String(!window.playful.mute));
    if (button.hasAttribute('aria-label')) button.setAttribute('aria-label', window.playful.mute ? 'Sound off' : 'Sound on');
    button.querySelector('[data-sound-state]').textContent = window.playful.mute ? 'off' : 'on';
  }
  current.audio.setMuted(window.playful.mute || document.hidden);
}
document.querySelectorAll('[data-sound-toggle]').forEach(button => button.addEventListener('click', toggleSound));
document.addEventListener('visibilitychange', () => current.audio.setMuted(!!window.playful?.mute || document.hidden));
document.getElementById('reset-view').addEventListener('click', () => current.key('c'));
document.getElementById('rerack').addEventListener('click', () => current.key('r'));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  current.resize();
});

// ---------- loop ----------
let last = performance.now();
const perf = { frames: 0, worst: 0, step: 0, render: 0, steps: 0, slow: 0, gaps: 0, reset() { this.frames = this.worst = this.step = this.render = this.steps = this.slow = this.gaps = 0; } };
function tick() { snapshotPoses(); return stepPhysics(current, world, eventQueue); }
window.playful = { heads, world, renderer, camera, scene3: scene, THREE, tick, scene: () => current, perf, mute: false }; // debug handle
let firstFrame;
const rendered = new Promise(resolve => { firstFrame = resolve; });
function animate(now) {
  requestAnimationFrame(animate);
  const t0 = performance.now();
  if (now - last > 25) perf.gaps++;   // long gap between frames = a visible hitch, whatever caused it
  accumulator += Math.min((now - last) / 1000, 0.05); last = now;
  while (accumulator >= STEP) { if (tick()) perf.steps++; accumulator -= STEP; }
  const t1 = performance.now();
  syncMeshes(accumulator / STEP);
  current.frame();
  renderer.render(scene, camera);
  if (firstFrame) { firstFrame(); firstFrame = null; }
  const t2 = performance.now();
  perf.frames++; perf.step += t1 - t0; perf.render += t2 - t1; perf.worst = Math.max(perf.worst, t2 - t0); if (t2 - t0 > 12) perf.slow++;
}
requestAnimationFrame(animate);
export const ready = environmentReady.then(() => rendered).then(() => {
  document.getElementById('hud').inert = false;
  finishLoading();
  connectWelcome(current);
});
