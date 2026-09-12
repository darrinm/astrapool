import * as THREE from 'three';

export const ARCADE_COLORS = { gold: '#ffe08a', mint: '#a8e8be', coral: '#f28c78', plum: '#bd8bce', amber: '#f4bd67', cream: '#fff3dc' };
const PARTICLES = 128, RINGS = 12, LABELS = 8;
const clamp = THREE.MathUtils.clamp;

// A bounded presentation layer. All positions are table/world coordinates; only
// the readable labels are projected into the HUD. Nothing writes to physics.
export class ArcadeEffects {
  constructor({ scene, camera, feltZ, sound }) {
    Object.assign(this, { scene, camera, feltZ, sound });
    this.enabled = false; this.reduced = false; this.queue = []; this.pieces = [];
    this.labels = []; this.rings = []; this.cursor = 0; this.ringCursor = 0;
    this.point = new THREE.Vector3(); this.transform = new THREE.Object3D();
    this.lastTrail = 0; this.lastFrame = 0; this.lastMetrics = 0;
  }
  configure(enabled, reduced) {
    if (enabled !== this.enabled || reduced !== this.reduced) this.clear();
    this.enabled = enabled; this.reduced = reduced;
    if (enabled) this.ensure();
  }
  ensure() {
    if (this.group) return;
    this.group = new THREE.Group(); this.group.name = 'arcade-effects'; this.scene.add(this.group);
    const shape = new THREE.Shape();
    shape.moveTo(-0.25, -0.5); shape.lineTo(0.25, -0.5); shape.quadraticCurveTo(0.4, -0.5, 0.4, -0.35);
    shape.lineTo(0.4, 0.35); shape.quadraticCurveTo(0.4, 0.5, 0.25, 0.5); shape.lineTo(-0.25, 0.5);
    shape.quadraticCurveTo(-0.4, 0.5, -0.4, 0.35); shape.lineTo(-0.4, -0.35); shape.quadraticCurveTo(-0.4, -0.5, -0.25, -0.5);
    this.particleGeometry = new THREE.ShapeGeometry(shape);
    this.particleMaterial = new THREE.MeshBasicMaterial({ color: 'white', side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
    this.particles = new THREE.InstancedMesh(this.particleGeometry, this.particleMaterial, PARTICLES);
    this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.particles.frustumCulled = false;
    this.particles.visible = false;
    this.group.add(this.particles);
    for (let i = 0; i < PARTICLES; i++) { this.pieces.push({ alive: false }); this.transform.scale.setScalar(0); this.transform.updateMatrix(); this.particles.setMatrixAt(i, this.transform.matrix); this.particles.setColorAt(i, new THREE.Color('white')); }
    this.ringGeometry = new THREE.RingGeometry(0.8, 1, 36);
    this.swirlGeometry = new THREE.RingGeometry(0.66, 1, 36, 1, 0, Math.PI * 1.6);
    for (let i = 0; i < RINGS; i++) {
      const mesh = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      mesh.visible = false; this.group.add(mesh); this.rings.push({ mesh, life: 0 });
    }
    this.rackGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(17.6, 0, this.feltZ + 0.2), new THREE.Vector3(29, -6.1, this.feltZ + 0.2), new THREE.Vector3(29, 6.1, this.feltZ + 0.2)]);
    this.rackLine = new THREE.LineLoop(this.rackGeometry, new THREE.LineBasicMaterial({ color: ARCADE_COLORS.gold, transparent: true, depthWrite: false, toneMapped: false }));
    this.rackLine.visible = false; this.group.add(this.rackLine);
    this.overlay = document.createElement('div'); this.overlay.id = 'arcade-effects'; this.overlay.setAttribute('aria-hidden', 'true'); document.body.append(this.overlay);
    for (let i = 0; i < LABELS; i++) {
      const el = document.createElement('div'); el.className = 'arcade-float'; el.hidden = true;
      const amount = document.createElement('strong'), sub = document.createElement('span'); el.append(amount, sub); this.overlay.append(el);
      this.labels.push({ el, amount, sub, alive: false });
    }
  }
  clear() {
    this.queue.length = 0;
    for (const p of this.pieces) p.alive = false;
    if (this.particles) this.particles.visible = false;
    for (const r of this.rings) { r.mesh.visible = false; r.life = 0; r.start = 0; }
    for (const l of this.labels) { l.alive = false; l.el.hidden = true; }
    if (this.group) this.group.visible = false;
    if (this.rackLine) this.rackLine.visible = false;
  }
  ring(at, color = ARCADE_COLORS.gold, radius = 3, life = 0.45, delay = 0, inward = false) {
    if (!this.enabled || document.hidden) return;
    const r = this.rings[this.ringCursor++ % RINGS];
    Object.assign(r, { start: performance.now() / 1000 + delay, life, radius, inward });
    r.mesh.geometry = inward ? this.swirlGeometry : this.ringGeometry; r.mesh.rotation.z = 0;
    r.mesh.position.set(at.x, at.y, this.feltZ + 0.08); r.mesh.material.color.set(color); r.mesh.visible = false;
  }
  burst(at, color = ARCADE_COLORS.gold, count = 12, strength = 1, inward = false) {
    if (!this.enabled || this.reduced || document.hidden) return;
    if (count > 0) this.particles.visible = true;
    const now = performance.now() / 1000;
    for (let i = 0; i < count; i++) {
      const index = this.cursor++ % PARTICLES, p = this.pieces[index];
      const angle = Math.random() * Math.PI * 2, speed = (3 + Math.random() * 6) * strength;
      Object.assign(p, { alive: true, start: now, life: 0.45 + Math.random() * 0.25, x: at.x, y: at.y, z: Math.max(at.z ?? this.feltZ + 1, this.feltZ + 0.3),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, vz: 4 + Math.random() * 6, size: (0.45 + Math.random() * 0.45) * strength, spin: (Math.random() - 0.5) * 10 });
      if (inward) {
        const dx = Math.cos(angle) * speed * 0.6, dy = Math.sin(angle) * speed * 0.6;
        p.x += dx; p.y += dy; p.z += 2; p.vx = -dx / p.life; p.vy = -dy / p.life; p.vz = -2;
      }
      this.particles.setColorAt(index, new THREE.Color(i % 4 === 0 ? ARCADE_COLORS.cream : color));
    }
    this.particles.instanceColor.needsUpdate = true;
  }
  label(at, main, sub = '', { key = '', color = ARCADE_COLORS.gold, player = 0, down = false, pending = false, life = 1.35 } = {}) {
    if (!this.enabled || document.hidden) return;
    const now = performance.now() / 1000;
    const l = (key && this.labels.find(l => l.alive && l.key === key)) || this.labels.find(l => !l.alive) || this.labels.reduce((a, b) => a.start < b.start ? a : b);
    Object.assign(l, { alive: true, key, start: now, life, x: at.x, y: at.y, z: Math.max(at.z ?? this.feltZ + 1.4, this.feltZ + 1.4), down, dirty: true });
    l.amount.textContent = main; l.sub.textContent = sub;
    l.el.style.setProperty('--arcade-color', color); l.el.dataset.player = String(player);
    l.el.classList.toggle('pending', pending); l.el.classList.toggle('mishap', down); l.el.hidden = false;
  }
  voidPending(reason) {
    for (const l of this.labels) if (l.alive && l.el.classList.contains('pending')) {
      l.amount.textContent = 'VOID'; l.sub.textContent = reason; l.down = true; l.dirty = true;
      l.start = performance.now() / 1000; l.life = 0.8; l.el.classList.remove('pending'); l.el.style.setProperty('--arcade-color', ARCADE_COLORS.coral);
    }
  }
  confirmPending() {
    for (const l of this.labels) if (l.alive) l.el.classList.remove('pending');
  }
  impact(at, kind, strength = 1) {
    if (!this.enabled || document.hidden) return;
    const color = kind === 'rail' ? ARCADE_COLORS.mint : ARCADE_COLORS.cream;
    this.ring(at, color, kind === 'rail' ? 2.5 : 1.4, 0.24);
    this.burst(at, color, kind === 'rail' ? 4 : 3, clamp(strength, 0.3, 1));
  }
  launch(at) {
    this.queue.length = 0;
    if (this.rackLine) this.rackLine.visible = false;
    for (const l of this.labels) if (l.key === 'rack') { l.alive = false; l.el.hidden = true; }
    this.ring(at, ARCADE_COLORS.cream, 2, 0.25); this.burst(at, ARCADE_COLORS.cream, 8, 0.7);
  }
  pocket(at, main, sub, options = {}) {
    const color = options.color || ARCADE_COLORS.gold;
    this.ring(at, color, options.down ? 4 : 4.5, 0.6, 0, !!options.swirl);
    this.burst(at, color, options.down ? 12 : 18, 1, !!options.swirl);
    this.label(at, main, sub, options);
    if (this.enabled) this.sound(options.down ? 'fault' : 'pot', at);
  }
  rack(balls, free = false) {
    if (!this.enabled || document.hidden) return;
    this.clear(); this.rackStart = performance.now() / 1000; this.rackLine.visible = !this.reduced;
    for (const b of balls.filter(b => b.number !== 0)) this.queue.push({ at: b, due: this.rackStart + 0.15 + (b.x - 19.5) / 30 });
    const at = { x: 24, y: 0, z: this.feltZ + 2 };
    this.label(at, free ? 'READY!' : 'READY TO BREAK', '', { life: 0.85, key: 'rack' });
    this.queue.push({ at: balls.find(b => b.number === 0), due: this.rackStart + 0.58, cue: true });
    this.sound('rack', at);
  }
  frame(balls = []) {
    if (!this.enabled || !this.group) return;
    const now = performance.now() / 1000;
    if (document.hidden || now - this.lastFrame > 0.6 && this.lastFrame) this.clear();
    this.lastFrame = now; this.group.visible = !document.hidden;
    if (document.hidden) return;
    while (this.queue.length && this.queue[0].due <= now) {
      const item = this.queue.shift(); this.ring(item.at, item.cue ? ARCADE_COLORS.cream : ARCADE_COLORS.gold, item.cue ? 2.5 : 1.8, 0.35);
      if (!item.cue) this.burst(item.at, ARCADE_COLORS.gold, 3, 0.5, true);
    }
    if (this.rackLine.visible) {
      const age = now - this.rackStart; this.rackLine.material.opacity = Math.max(0, 1 - age / 0.8);
      if (age >= 0.8) this.rackLine.visible = false;
    }
    if (!this.reduced && now - this.lastTrail > 0.04) {
      this.lastTrail = now;
      for (const ball of balls) if (ball.mesh.visible && ball.body.isEnabled()) {
        const v = ball.body.linvel();
        if (Math.hypot(v.x, v.y) > 95 && ball.mesh.position.z > this.feltZ) {
          const p = this.pieces[this.cursor % PARTICLES]; this.burst(ball.mesh.position, ARCADE_COLORS.gold, 1, 0.4);
          Object.assign(p, { vx: 0, vy: 0, vz: 0, life: 0.13, size: 0.6 });
        }
      }
    }
    if (this.particles.visible) {
      const transform = this.transform;
      let alive = false;
      for (let i = 0; i < PARTICLES; i++) {
        const p = this.pieces[i], age = now - p.start;
        if (!p.alive || age > p.life) { p.alive = false; transform.scale.setScalar(0); }
        else {
          alive = true;
          transform.position.set(p.x + p.vx * age, p.y + p.vy * age, Math.max(this.feltZ + 0.1, p.z + p.vz * age - 10 * age * age));
          transform.quaternion.copy(this.camera.quaternion); transform.rotateZ(p.spin * age);
          transform.scale.setScalar(p.size * Math.min(1, (1 - age / p.life) * 3));
        }
        transform.updateMatrix(); this.particles.setMatrixAt(i, transform.matrix);
      }
      this.particles.instanceMatrix.needsUpdate = true;
      // Hide the empty pool until the next burst, including in Reduced effects.
      this.particles.visible = alive;
    }
    for (const r of this.rings) {
      const age = now - r.start, t = age / r.life;
      r.mesh.visible = age >= 0 && t < 1;
      if (!r.mesh.visible) continue;
      r.mesh.scale.setScalar(r.radius * (this.reduced ? 0.75 : r.inward ? 1 - t * 0.9 : 0.3 + 0.7 * (1 - (1 - t) ** 3)));
      if (r.inward && !this.reduced) r.mesh.rotation.z = t * Math.PI * 3;
      r.mesh.material.opacity = (1 - t) * 0.85;
    }
    if (!this.labels.some(l => l.alive)) return;
    if (!this.header || now - this.lastMetrics > 0.25) {
      this.lastMetrics = now;
      const welcome = document.querySelector('#welcome[open] .welcome-inner');
      this.header = document.querySelector(welcome ? '.welcome-heading' : '.topbar').getBoundingClientRect();
      this.footer = (welcome || document.querySelector('.bottom-hud')).getBoundingClientRect();
    }
    const placed = [];
    for (const l of this.labels) {
      const age = now - l.start, t = age / l.life;
      if (!l.alive || t >= 1) { l.alive = false; l.el.hidden = true; continue; }
      if (l.dirty) { l.width = l.el.offsetWidth || 160; l.height = l.el.offsetHeight || 60; l.dirty = false; }
      this.point.set(l.x, l.y, l.z).project(this.camera);
      const px = (this.point.x + 1) * innerWidth / 2, py = (1 - this.point.y) * innerHeight / 2;
      if (this.point.z < -1 || this.point.z > 1 || px < 0 || px > innerWidth || py < 0 || py > innerHeight) { l.el.hidden = true; continue; }
      const lift = this.reduced ? 24 : l.down ? 25 - t * 24 : 25 + t * 42;
      // Reserve space for the playful tilt and overshoot, not just the unscaled box.
      const side = 14 + l.width * 0.1;
      const x = clamp(px - l.width / 2, side, innerWidth - l.width - side);
      let y = py - lift - l.height;
      const overFooter = x < this.footer.right && x + l.width > this.footer.left;
      const bottom = overFooter ? this.footer.top - 6 : innerHeight - 14;
      y = Math.max(this.header.bottom + 4, Math.min(y, bottom - l.height));
      for (const prev of placed) if (x < prev.x + prev.w && x + l.width > prev.x && y < prev.y + prev.h + 4 && y + l.height > prev.y) y = prev.y - l.height - 5;
      if (y < this.header.bottom || Math.abs(y + l.height / 2 - py) > 130) { l.el.hidden = true; continue; }
      placed.push({ x, y, w: l.width, h: l.height }); l.el.hidden = false;
      const bounce = this.reduced ? 1 : 1 + 0.16 * Math.sin(Math.min(1, t * 4) * Math.PI) * (1 - t);
      l.el.style.transform = `translate(${x}px,${y}px) rotate(${l.down ? 5 : -4}deg) scale(${bounce})`;
      l.el.style.opacity = String(Math.min(1, (1 - t) * 4));
    }
  }
  dispose() {
    this.clear(); if (!this.group) return;
    this.group.removeFromParent(); this.overlay.remove();
    this.particleGeometry.dispose(); this.particleMaterial.dispose(); this.ringGeometry.dispose(); this.swirlGeometry.dispose();
    for (const r of this.rings) r.mesh.material.dispose();
    this.rackGeometry.dispose(); this.rackLine.material.dispose(); this.group = null;
    this.pieces = []; this.rings = []; this.labels = [];
  }
}
