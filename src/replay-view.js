import * as THREE from 'three';
import { replayFrame } from './replay.js';

const clockText = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// Three's clone shares surface materials but omits custom shadow materials.
// Preserve both through the hierarchy so ring gaps cast the same replay shadow.
export function cloneReplayMesh(source) {
  const clone = source.clone(false);
  clone.customDepthMaterial = source.customDepthMaterial;
  clone.customDistanceMaterial = source.customDistanceMaterial;
  for (const child of source.children) clone.add(cloneReplayMesh(child));
  return clone;
}

export class ReplayView {
  constructor({ scene, exit }) {
    this.scene = scene; this.active = false; this.balls = []; this.layers = new Map();
    this.panel = document.getElementById('replay-controls');
    this.title = document.getElementById('replay-title');
    this.play = document.getElementById('replay-play');
    this.seek = document.getElementById('replay-seek');
    this.speed = document.getElementById('replay-speed');
    this.clock = document.getElementById('replay-clock');
    this.rotation = new THREE.Quaternion();
    this.panel.addEventListener('keydown', event => {
      // The game's global shortcuts skip form controls, including the timeline.
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); exit(); }
    });
    this.play.addEventListener('click', () => {
      if (this.time >= this.clip.duration) this.time = 0;
      this.paused = !this.paused; this.lastFrame = performance.now(); this.update();
    });
    this.seek.addEventListener('pointerdown', event => {
      if (!this.active || event.button !== 0 || event.isPrimary === false) return;
      // Freeze the thumb immediately, before the native range changes value,
      // so playback cannot move it away from a finger that is trying to grab it.
      this.paused = true; this.update();
    });
    this.seek.addEventListener('input', () => {
      this.time = Number(this.seek.value); this.paused = true; this.update();
    });
    document.getElementById('replay-restart').addEventListener('click', () => {
      this.time = 0; this.paused = false; this.lastFrame = performance.now(); this.update();
    });
    document.getElementById('replay-close').addEventListener('click', exit);
  }
  start(clip, balls) {
    this.stop();
    this.clip = clip; this.time = 0; this.paused = false; this.lastFrame = performance.now();
    this.group = new THREE.Group(); this.group.name = 'shot-replay'; this.scene.add(this.group);
    // Suppress live rendering with layers, not visibility: physics and online
    // bookkeeping use the originals' visibility and must remain untouched.
    this.balls = clip.numbers.map(number => {
      const source = balls.find(b => b.number === number), mesh = cloneReplayMesh(source.mesh);
      this.group.add(mesh);
      source.mesh.traverse(object => { this.layers.set(object, object.layers.mask); object.layers.mask = 0; });
      return { number, mesh };
    });
    this.active = true; this.panel.hidden = false; document.body.classList.add('replaying');
    this.title.textContent = `Replay · ${clip.metadata.label}`;
    this.seek.max = String(clip.duration); this.speed.value = '1';
    this.update(); this.play.focus();
  }
  stop() {
    for (const [object, mask] of this.layers) object.layers.mask = mask;
    this.layers.clear();
    // Clones borrow the game's geometries and materials; only remove the group.
    this.group?.removeFromParent(); this.group = null; this.balls = [];
    this.active = false; this.clip = null; this.panel.hidden = true;
    document.body.classList.remove('replaying');
  }
  frame() {
    if (!this.active) return;
    const now = performance.now(), elapsed = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    if (this.paused || document.hidden) return;
    this.time = Math.min(this.clip.duration, this.time + elapsed * Number(this.speed.value));
    if (this.time >= this.clip.duration) this.paused = true;
    this.update();
  }
  update() {
    const { from, to, mix } = replayFrame(this.clip, this.time);
    this.balls.forEach(({ mesh }, i) => {
      const n = i * 8;
      mesh.visible = !!from[n];
      if (!mesh.visible) return;
      // Hiding/respots are discrete events; do not draw a flying cue between them.
      const smooth = to[n] && Math.hypot(to[n + 1] - from[n + 1], to[n + 2] - from[n + 2], to[n + 3] - from[n + 3]) < 12;
      const t = smooth ? mix : 0;
      mesh.position.set(from[n + 1] + (to[n + 1] - from[n + 1]) * t, from[n + 2] + (to[n + 2] - from[n + 2]) * t, from[n + 3] + (to[n + 3] - from[n + 3]) * t);
      mesh.quaternion.set(from[n + 4], from[n + 5], from[n + 6], from[n + 7]);
      this.rotation.set(to[n + 4], to[n + 5], to[n + 6], to[n + 7]); mesh.quaternion.slerp(this.rotation, t);
    });
    this.seek.value = String(this.time);
    this.seek.setAttribute('aria-valuetext', `${clockText(this.time)} of ${clockText(this.clip.duration)}`);
    this.clock.textContent = `${clockText(this.time)} / ${clockText(this.clip.duration)}`;
    this.play.textContent = this.paused ? 'Play' : 'Pause';
  }
}
