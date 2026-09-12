import * as THREE from 'three';
import { P, pocketCenters } from '../physics/constants.js';
import { ARCADE_COLORS as C } from './arcade-effects.js';

const pockets = pocketCenters(), MAX_POINTS = 96;

// Two reusable glimpses of the worker's actual practice shots. New results
// replace old ones immediately; presentation never schedules or holds a shot.
export class ComputerThoughts {
  constructor({ scene, camera, feltZ, settings }) {
    Object.assign(this, { scene, camera, feltZ, settings });
    this.slots = []; this.cursor = 0; this.point = new THREE.Vector3();
  }
  ensure() {
    if (this.group) return;
    this.group = new THREE.Group(); this.group.name = 'computer-thoughts'; this.scene.add(this.group);
    this.ringGeometry = new THREE.RingGeometry(P.R + 0.3, P.R + 0.45, 40);
    this.ghostGeometry = new THREE.SphereGeometry(P.R, 16, 10);
    const material = color => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, toneMapped: false });
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group(); group.visible = false; this.group.add(group);
      const lines = [C.cream, C.gold].map(color => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(MAX_POINTS), 1).setUsage(THREE.DynamicDrawUsage));
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color, dashSize: 0.8, gapSize: 0.55, transparent: true, depthWrite: false, toneMapped: false }));
        line.frustumCulled = false; group.add(line); return line;
      });
      const halo = new THREE.Mesh(this.ringGeometry, material(C.gold));
      const pocket = new THREE.Mesh(this.ringGeometry, material(C.gold)); pocket.scale.setScalar(1.9);
      const ghost = new THREE.Mesh(this.ghostGeometry, material(C.cream));
      group.add(halo, pocket, ghost);
      this.slots.push({ group, lines, halo, pocket, ghost, active: false });
    }
    this.label = document.createElement('div'); this.label.id = 'computer-thought'; this.label.hidden = true;
    this.label.setAttribute('aria-hidden', 'true'); document.body.append(this.label);
  }
  clear() {
    this.current = null;
    for (const slot of this.slots) { slot.active = false; slot.group.visible = false; }
    if (this.group) this.group.visible = false;
    if (this.label) this.label.hidden = true;
  }
  show(preview, chosen = false) {
    if (!this.settings().enabled || document.hidden) { this.clear(); return; }
    this.ensure();
    if (chosen) this.clear();
    const slot = this.slots[this.cursor++ % this.slots.length], now = performance.now();
    if (this.current) this.current.replaced = now;
    Object.assign(slot, { active: true, chosen, start: now, replaced: null });
    this.current = slot;
    const cue = preview.paths.find(p => p.number === 0)?.points || [];
    const object = preview.paths.find(p => p.number === preview.target)?.points || [];
    slot.cue = cue;
    for (const [i, points] of [cue, object].entries()) {
      const line = slot.lines[i], positions = line.geometry.attributes.position, distances = line.geometry.attributes.lineDistance;
      const length = Math.min(MAX_POINTS, points.length);
      let distance = 0;
      for (let j = 0; j < length; j++) {
        const p = points[j];
        if (j) distance += Math.hypot(p.x - points[j - 1].x, p.y - points[j - 1].y);
        positions.setXYZ(j, p.x, p.y, this.feltZ + 0.09); distances.setX(j, distance);
      }
      line.geometry.setDrawRange(0, length); positions.needsUpdate = true; distances.needsUpdate = true;
    }
    slot.target = object[0] || cue[0];
    slot.halo.visible = !!slot.target;
    if (slot.target) slot.halo.position.set(slot.target.x, slot.target.y, this.feltZ + 0.1);
    const pocket = pockets[preview.pocket]; slot.pocket.visible = !!pocket;
    if (pocket) slot.pocket.position.set(pocket.x, pocket.y, this.feltZ + 0.12);
    this.label.textContent = chosen ? 'Aha!' : 'Hmm…';
    this.label.classList.toggle('chosen', chosen);
  }
  choose(shot, balls) {
    this.show({ target: shot.target, pocket: shot.pocket,
      paths: balls.filter(b => b.number === 0 || b.number === shot.target).map(b => ({ number: b.number, points: [{ x: b.x, y: b.y }] })) }, true);
  }
  frame() {
    if (!this.group || !this.current) return;
    const { enabled, reduced } = this.settings();
    if (!enabled || document.hidden) { this.clear(); return; }
    const now = performance.now(), blocked = !!document.querySelector('dialog[open]:not(#welcome)');
    this.group.visible = !blocked;
    for (const slot of this.slots) {
      const age = now - slot.start;
      // A stalled or hidden search never leaves a stale path on the felt.
      if (!slot.active || age > 900 || slot.replaced !== null && (reduced || now - slot.replaced >= 100)) { slot.group.visible = false; continue; }
      slot.group.visible = true;
      const fade = slot.replaced === null ? 1 : 1 - (now - slot.replaced) / 100;
      for (const line of slot.lines) { line.visible = !reduced && !slot.chosen; line.material.opacity = fade * 0.58; }
      slot.halo.material.opacity = fade * 0.85; slot.pocket.material.opacity = fade * 0.6;
      slot.halo.scale.setScalar(reduced ? 1 : 1 + Math.sin(Math.min(1, age / 160) * Math.PI) * 0.1);
      slot.ghost.visible = !reduced && !slot.chosen && slot.cue.length > 1 && age < 220;
      if (slot.ghost.visible) {
        const progress = Math.min(1, age / 180) * (slot.cue.length - 1), i = Math.min(slot.cue.length - 2, Math.floor(progress));
        const from = slot.cue[i], to = slot.cue[i + 1], t = progress - i;
        slot.ghost.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, this.feltZ + P.R);
        slot.ghost.material.opacity = fade * 0.18;
      }
    }
    const current = this.current;
    this.label.hidden = blocked || !current?.group.visible || !current.target;
    if (this.label.hidden) return;
    this.point.set(current.target.x, current.target.y, this.feltZ + P.R * 2).project(this.camera);
    const x = (this.point.x + 1) * innerWidth / 2, y = (1 - this.point.y) * innerHeight / 2;
    const width = this.label.offsetWidth, height = this.label.offsetHeight;
    const welcome = document.querySelector('#welcome[open] .welcome-inner');
    const header = welcome ? { bottom: 0 } : document.querySelector('.topbar').getBoundingClientRect();
    const footer = (welcome || document.querySelector('.bottom-hud')).getBoundingClientRect();
    const left = THREE.MathUtils.clamp(x + 9, 8, innerWidth - width - 8), top = y - height - 10;
    const overFooter = left < footer.right && left + width > footer.left;
    this.label.hidden = this.point.z < -1 || this.point.z > 1 || top < header.bottom + 4 || top + height > (overFooter ? footer.top - 4 : innerHeight - 8);
    this.label.style.transform = `translate(${left}px, ${top}px)`;
  }
  dispose() {
    this.clear(); if (!this.group) return;
    for (const slot of this.slots) {
      for (const line of slot.lines) { line.geometry.dispose(); line.material.dispose(); }
      for (const mesh of [slot.halo, slot.pocket, slot.ghost]) mesh.material.dispose();
    }
    this.ringGeometry.dispose(); this.ghostGeometry.dispose(); this.group.removeFromParent(); this.label.remove();
    this.group = null; this.label = null; this.slots = [];
  }
}
