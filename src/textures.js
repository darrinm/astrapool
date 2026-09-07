// Small procedural textures drawn on canvases: felt nap, wood grain, carpet. No external assets needed.
import * as THREE from 'three';

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
}
export const rnd = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; };

// Fine grain noise for a bump map (felt nap, carpet pile).
export function noiseBump(size = 512, repeat = 12, seed = 7) {
  const r = rnd(seed);
  return canvasTexture(size, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = 118 + r() * 60 | 0; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }, repeat);
}

// Felt colour with subtle mottling so the cloth doesn't read as flat paint.
export function feltMap(size = 512, repeat = 6, base = '#1e6a3f') {
  const r = rnd(3);
  return canvasTexture(size, (ctx, n) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + r() * 0.04})`;
      ctx.beginPath(); ctx.arc(r() * n, r() * n, 1 + r() * 3, 0, Math.PI * 2); ctx.fill();
    }
  }, repeat);
}

// Wood: layered grain lines with slow waviness, warm walnut tones.
export function woodMap(size = 1024, repeat = 1, seed = 11, tones = ['#4a2c15', '#5c3a1e', '#6b4526', '#3e2411']) {
  const r = rnd(seed);
  return canvasTexture(size, (ctx, n) => {
    ctx.fillStyle = tones[1]; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) {
      const y = r() * n, w = 1 + r() * 4, amp = 6 + r() * 18, freq = 0.002 + r() * 0.006, phase = r() * 6.28;
      ctx.strokeStyle = tones[r() * tones.length | 0]; ctx.globalAlpha = 0.25 + r() * 0.45; ctx.lineWidth = w;
      ctx.beginPath();
      for (let x = 0; x <= n; x += 8) { const yy = y + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 3.1 + phase) * amp * 0.3; x === 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, repeat);
}

// Carpet: dark, low-contrast speckle.
export function carpetMap(size = 512, repeat = 30, base = '#2a2530') {
  const r = rnd(5);
  return canvasTexture(size, (ctx, n) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < 20000; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '255,240,220' : '0,0,0'},${0.03 + r() * 0.05})`; ctx.fillRect(r() * n, r() * n, 1.5, 1.5); }
  }, repeat);
}

// Tangent-space normal map from a height field: fine noise plus a faint two-way weave, for cloth nap.
export function clothNormal(size = 512, repeat = 36, seed = 13, strength = 2.2) {
  const r = rnd(seed);
  const n = size, h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const weave = 0.5 + 0.5 * Math.sin(x * 0.35) * Math.sin(y * 0.35);
    h[y * n + x] = weave * 0.35 + r() * 0.65;
  }
  // light blur so the noise reads as fibres rather than pixels
  const b = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let s = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += h[((y + dy + n) % n) * n + ((x + dx + n) % n)];
    b[y * n + x] = s / 9;
  }
  return canvasTexture(size, (ctx) => {
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (b[y * n + ((x + 1) % n)] - b[y * n + ((x - 1 + n) % n)]) * strength;
      const dy = (b[((y + 1) % n) * n + x] - b[((y - 1 + n) % n) * n + x]) * strength;
      const len = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
      img.data[i] = 128 + (-dx / len) * 127; img.data[i + 1] = 128 + (-dy / len) * 127; img.data[i + 2] = 128 + (1 / len) * 127; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, repeat);
}

// Soft radial blob (alpha), for contact shadows under the balls.
export function radialShadow(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.45, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// One-directional dark-to-clear gradient (alpha), for occlusion strips where rails meet the felt.
export function gradientStrip(size = 64) {
  const c = document.createElement('canvas'); c.width = size; c.height = 4;
  const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, 4);
  const t = new THREE.CanvasTexture(c); return t;
}
