import * as THREE from 'three';
import { carpetMap, rnd as random } from './textures.js';

export const ENVIRONMENTS = [
  { id: 'minimal', name: 'Minimal', time: 'ORIGINAL · DEFAULT', description: 'Green felt, dark walnut, a quiet room. Just you and the table.', sound: 'Table sounds only', sky: '#0a0a0d', hemi: 0.12, exposure: 0.9 },
  { id: 'corner', name: 'The Corner Pocket', time: '12:42 AM · AFTER HOURS', description: 'Burgundy cloth, warm walnut, and a little neon. Stay for one more rack.', sound: 'Soft lounge chords', felt: '#481422', wood: ['#24120c', '#352015', '#492b1c', '#21120c'], trim: '#20140d', floor: '#252022', sky: '#100f19', lamp: '#fff1d6', accent: '#e7bd7d', hemi: 0.28, exposure: 0.95 },
  { id: 'desert', name: 'Desert Modern', time: '5:18 PM · GOLDEN HOUR', description: 'Sage cloth, pale oak, and mountains beyond the glass. A slower kind of afternoon.', sound: 'Desert breeze', felt: '#365b40', wood: ['#8d6541', '#b6905f', '#c6a474', '#a47f52'], trim: '#72543b', floor: '#bea58b', sky: '#eab584', lamp: '#fff7df', accent: '#f3c58e', hemi: 1.25, exposure: 0.85 },
  { id: 'tokyo', name: 'Tokyo Rooftop', time: '11:06 PM · RAIN IN THE CITY', description: 'Midnight-blue cloth above a neon skyline. Rain taps against the canopy.', sound: 'Rain on the roof', felt: '#102f52', wood: ['#080e18', '#101827', '#172438', '#0a1020'], trim: '#0d1724', floor: '#152638', sky: '#091224', lamp: '#e9f5ff', accent: '#6de4ee', hemi: 0.48, exposure: 1.0 },
  { id: 'orbital', name: 'Orbital Lounge', time: '03:27 UTC · EARTHRISE', description: 'Deep teal, brushed titanium, and a planet in the window. Your quiet corner of the universe.', sound: 'Observatory hum', felt: '#10474c', wood: ['#4c626c', '#71858b', '#88999d', '#5a7079'], trim: '#253e4c', floor: '#172c3a', sky: '#030916', lamp: '#e5f7ff', accent: '#93e3f0', hemi: 0.55, exposure: 0.95 },
];
export const environmentById = id => ENVIRONMENTS.find(environment => environment.id === id) || ENVIRONMENTS[0];
export function readEnvironment(storage) {
  try { return environmentById(storage.getItem('pool.environment')).id; } catch { return ENVIRONMENTS[0].id; }
}

function texture(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; return map;
}

// A continuous painted panorama sits outside the room's architecture. It is
// generated once per room, with no image downloads or per-frame texture work.
function panorama(theme) {
  return texture(2048, 768, (c, w, h) => {
    const r = random(49), gradient = c.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, theme.sky); gradient.addColorStop(1, theme.id === 'desert' ? '#f8d8a9' : '#182034');
    c.fillStyle = gradient; c.fillRect(0, 0, w, h);
    if (theme.id === 'desert') {
      c.fillStyle = '#fff0bc'; c.beginPath(); c.ellipse(1300, 330, 15, 68, 0, 0, Math.PI * 2); c.fill();
      for (let layer = 0; layer < 3; layer++) {
        c.fillStyle = ['#b88b86', '#a37b79', '#8c6e70'][layer]; c.beginPath(); c.moveTo(0, h);
        for (let x = 0; x <= w; x += 48) c.lineTo(x, 470 + layer * 65 - r() * (170 - layer * 35));
        c.lineTo(w, h); c.closePath(); c.fill();
      }
      for (const x of [160, 680, 1490, 1850]) {
        c.strokeStyle = '#3d5148'; c.lineWidth = 9; c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + 20, 480, x + 40, 365); c.stroke();
        for (let i = 0; i < 9; i++) { const a = i * Math.PI * 2 / 9; c.lineWidth = 13; c.beginPath(); c.moveTo(x + 40, 365); c.quadraticCurveTo(x + 40 + Math.cos(a) * 62, 365 + Math.sin(a) * 32, x + 40 + Math.cos(a) * 103, 395 + Math.sin(a) * 48); c.stroke(); }
      }
    } else if (theme.id === 'tokyo') {
      for (let x = 0; x < w; x += 47) {
        const roof = 240 + r() * 300; c.fillStyle = r() > 0.5 ? '#101c32' : '#0b1426'; c.fillRect(x, roof, 43, h - roof);
        for (let y = roof + 15; y < h; y += 19) for (let dx = 6; dx < 40; dx += 11) if (r() > 0.35) { c.fillStyle = r() > 0.65 ? '#d68bba' : '#578fba'; c.fillRect(x + dx, y, 4, 8); }
        if (r() > 0.65) { c.fillStyle = r() > 0.5 ? '#ec5cac' : '#62cfe0'; c.fillRect(x + 5, roof + 30, 7, 70); }
      }
      c.strokeStyle = '#b0d7ee22'; c.lineWidth = 1;
      for (let i = 0; i < 650; i++) { const x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 5, y + 24); c.stroke(); }
    } else if (theme.id === 'orbital') {
      for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(210,232,255,${0.2 + r() * 0.7})`; c.fillRect(r() * w, r() * h, 1 + r(), 1 + r()); }
      const x = 1200, y = 480, radius = 280;
      c.save(); c.translate(x, y); c.scale(0.22, 1); c.translate(-x, -y);
      c.save(); c.shadowBlur = 35; c.shadowColor = '#66c7ff'; c.fillStyle = '#3977ad'; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.fill(); c.restore();
      c.save(); c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.clip();
      for (let i = 0; i < 110; i++) { c.fillStyle = i % 3 ? '#638a7b' : '#b0cbbe'; c.beginPath(); c.ellipse(x - 260 + r() * 500, y - 260 + r() * 500, 12 + r() * 55, 4 + r() * 20, -0.3, 0, Math.PI * 2); c.fill(); }
      for (let i = 0; i < 50; i++) { c.strokeStyle = '#e3f4f580'; c.lineWidth = 2 + r() * 10; c.beginPath(); c.ellipse(x - 220 + r() * 440, y - 240 + r() * 480, 35 + r() * 110, 6 + r() * 20, -0.2, 0, Math.PI); c.stroke(); }
      const shade = c.createLinearGradient(x - radius, 0, x + radius, 0); shade.addColorStop(0, '#00000a00'); shade.addColorStop(0.5, '#00000a22'); shade.addColorStop(1, '#00000af0'); c.fillStyle = shade; c.fillRect(x - radius, y - radius, radius * 2, radius * 2); c.restore(); c.restore();
    } else {
      c.fillStyle = '#211a20'; c.fillRect(0, 400, w, 368);
      for (let x = 0; x < w; x += 64) { c.fillStyle = '#70523933'; c.fillRect(x, 402, 2, 366); }
      for (let x = 70; x < w; x += 420) {
        c.fillStyle = '#080e19'; c.fillRect(x, 220, 280, 260);
        c.strokeStyle = '#87604b'; c.lineWidth = 8; c.strokeRect(x, 220, 280, 260);
        c.fillStyle = '#b9895466'; for (let j = 0; j < 12; j++) c.fillRect(x + 18 + j * 20, 320 + r() * 100, 5, 30);
      }
      c.save(); c.textAlign = 'center'; c.font = '600 56px Georgia'; c.shadowColor = '#f8759c'; c.shadowBlur = 18; c.fillStyle = '#ef9eb3'; c.fillText('THE CORNER POCKET', 1110, 180); c.font = '22px sans-serif'; c.fillStyle = '#e6c691'; c.fillText('BILLIARDS  •  OPEN LATE', 1110, 222); c.restore();
    }
  });
}

export function buildEnvironment(theme, floorZ) {
  const group = new THREE.Group(); group.name = `environment-${theme.id}`;
  const materials = new Set(), geometries = new Set(), maps = new Set(), roof = [];
  function mesh(geometry, material, x, y, z) {
    geometries.add(geometry); materials.add(material); if (material.map) maps.add(material.map);
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z); group.add(item); return item;
  }
  function result() {
    return { group, setCameraHeight(z) { roof.forEach(beam => { beam.visible = z < floorZ + 80; }); }, dispose() { group.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); maps.forEach(t => t.dispose()); } };
  }
  if (theme.id === 'minimal') {
    // Preserve the original room, including its texture and lighting conventions.
    const floor = mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: carpetMap(512, 30, '#121014'), roughness: 1 }), 0, 0, floorZ);
    floor.receiveShadow = true;
    const wall = new THREE.MeshStandardMaterial({ color: '#121116', roughness: 1, side: THREE.DoubleSide });
    const base = new THREE.MeshStandardMaterial({ color: '#0d0c0f', roughness: 0.7 });
    const wallGeometry = new THREE.PlaneGeometry(320, 140), baseGeometry = new THREE.BoxGeometry(320, 0.6, 2.2);
    for (const [x, y, angle] of [[0, 160, 0], [0, -160, Math.PI], [160, 0, -Math.PI / 2], [-160, 0, Math.PI / 2]]) {
      const panel = mesh(wallGeometry, wall, x, y, floorZ + 70);
      panel.rotation.set(Math.PI / 2, 0, 0); panel.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), angle); panel.receiveShadow = true;
      mesh(baseGeometry, base, x, y, floorZ + 1.1).rotation.z = angle;
    }
    return result();
  }
  const floorMap = texture(512, 512, (c, w, h) => {
    const r = random(17); c.fillStyle = theme.floor; c.fillRect(0, 0, w, h);
    if (theme.id === 'desert') {
      for (let i = 0; i < 1300; i++) { c.fillStyle = ['#e4cbb0', '#806e60', '#a08778'][i % 3]; c.fillRect(r() * w, r() * h, 1 + r() * 4, 1 + r() * 4); }
    } else if (theme.id === 'corner') {
      c.strokeStyle = '#aa79551c'; for (let x = 0; x < w; x += 32) { c.strokeRect(x, 0, 31, h); }
      for (let i = 0; i < 3000; i++) { c.fillStyle = '#c6a17d10'; c.fillRect(r() * w, r() * h, 1, 20); }
    } else {
      c.strokeStyle = theme.id === 'tokyo' ? '#55758855' : '#759aab55'; c.lineWidth = 2; c.strokeRect(2, 2, w - 4, h - 4);
      if (theme.id === 'orbital') { c.fillStyle = '#a9d8df44'; c.fillRect(20, 20, 50, 3); c.fillRect(w - 70, h - 23, 50, 3); }
    }
  });
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping; floorMap.repeat.set(14, 14); floorMap.anisotropy = 4;
  const floor = mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: floorMap, roughness: theme.id === 'tokyo' ? 0.28 : 0.85, metalness: theme.id === 'orbital' ? 0.3 : 0 }), 0, 0, floorZ); floor.receiveShadow = true;
  const horizon = mesh(new THREE.CylinderGeometry(215, 215, 110, 96, 1, true), new THREE.MeshBasicMaterial({ map: panorama(theme), side: THREE.BackSide, toneMapped: false }), 0, 0, floorZ + 55); horizon.rotation.x = Math.PI / 2; horizon.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), -Math.PI * 0.67);
  const frame = new THREE.MeshStandardMaterial({ color: theme.id === 'desert' ? '#69594b' : theme.trim, roughness: 0.5, metalness: theme.id === 'orbital' ? 0.65 : 0.15 });
  const glow = new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false });
  // Architecture stays well outside the playing surface, even in overhead view.
  if (theme.id === 'orbital') {
    const postGeometry = new THREE.BoxGeometry(2, 2, 110);
    const ringGeometry = new THREE.TorusGeometry(150, 2, 6, 96), glowGeometry = new THREE.TorusGeometry(147.5, 0.24, 6, 96);
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      mesh(postGeometry, frame, Math.cos(angle) * 150, Math.sin(angle) * 150, floorZ + 55);
    }
    for (const z of [floorZ + 3, floorZ + 95]) {
      mesh(ringGeometry, frame, 0, 0, z);
      mesh(glowGeometry, glow, 0, 0, z);
    }
  } else {
    const postGeometry = new THREE.BoxGeometry(2, 2, 95), beamGeometry = new THREE.BoxGeometry(280, 1.5, 2);
    for (const x of [-140, 140]) for (const y of [-140, 0, 140]) mesh(postGeometry, frame, x, y, floorZ + 47.5);
    for (const y of [-140, 140]) for (const z of [floorZ + 3, floorZ + 90]) mesh(beamGeometry, frame, 0, y, z);
    if (theme.id === 'tokyo') {
      const canopyGeometry = new THREE.BoxGeometry(1, 280, 1);
      for (let x = -140; x <= 140; x += 35) roof.push(mesh(canopyGeometry, frame, x, 0, floorZ + 90));
    }
  }
  // A frame around the play area gives each room a signature from above too.
  const borderGeometry = new THREE.BoxGeometry(114, 0.3, 0.05);
  for (const y of [-47, 47]) {
    mesh(borderGeometry, glow, 0, y, floorZ + 0.03);
    if (theme.id === 'corner' || theme.id === 'desert') {
      const seat = new THREE.MeshStandardMaterial({ color: theme.id === 'corner' ? '#502632' : '#b77852', roughness: 0.9 });
      mesh(new THREE.BoxGeometry(36, 9, 8), seat, 34, y * 1.8, floorZ + 4);
      mesh(new THREE.BoxGeometry(36, 2, 13), seat, 34, y * 1.8 + Math.sign(y) * 4, floorZ + 9);
    }
  }
  if (theme.id === 'tokyo') {
    const neonGeometry = new THREE.BoxGeometry(115, 0.6, 0.2);
    for (const [y, color] of [[-65, '#ec65b2'], [65, '#65d8ee']]) {
      const neon = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      mesh(neonGeometry, neon, 0, y, floorZ + 0.1);
      const light = new THREE.PointLight(color, 130, 110, 2); light.position.set(0, y, floorZ + 15); group.add(light);
    }
  }
  return result();
}
