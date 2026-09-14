import * as THREE from 'three';
import { BALL_COLORS } from './ballcaps.js';
import { planetForBall } from './ball-sets.js';

export function aimPathColor(number, style, clairvoyant) {
  if (!clairvoyant) return number === 0 ? '#ffffff' : '#ffd27a';
  if (style === 'planets') return planetForBall(number).color;
  return number === 0 ? '#ffffff' : BALL_COLORS[(number - 1) % 8 + 1];
}

export function createPowerGuide(color) {
  // A ribbon gives real width on WebGL, where LineBasicMaterial's linewidth is ignored.
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: 0 }, outline: { value: 0 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      uniform float outline;
      varying vec2 vUv;
      void main() {
        float tip = 1.0 - smoothstep(0.85, 1.0, vUv.x);
        float edge = 1.0 - smoothstep(0.3, 0.5, abs(vUv.y - 0.5));
        vec3 ink = mix(color, vec3(0.9), outline * smoothstep(0.22, 0.42, abs(vUv.y - 0.5)));
        gl_FragColor = vec4(ink, opacity * tip * edge);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  return mesh;
}

// Each span follows sampled physics positions, including curved follow/draw and
// cushion rebounds. UV distance keeps the fade continuous across the whole path.
export function setPowerPath(mesh, points, z, power) {
  const clean = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 1e-5);
  mesh.visible = clean.length > 1;
  if (!mesh.visible) return;
  const strength = THREE.MathUtils.clamp(power, 0, 1);
  const width = (0.1 + 0.3 * Math.sqrt(strength)) / 2;
  const distances = [0];
  for (let i = 1; i < clean.length; i++) distances.push(distances[i - 1] + Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y));
  const total = distances.at(-1), positions = [], uv = [];
  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1], b = clean[i], length = distances[i] - distances[i - 1];
    const nx = -(b.y - a.y) / length * width, ny = (b.x - a.x) / length * width;
    for (const [point, sign, u] of [[a, -1, distances[i - 1]], [b, -1, distances[i]], [a, 1, distances[i - 1]],
      [a, 1, distances[i - 1]], [b, -1, distances[i]], [b, 1, distances[i]]]) {
      positions.push(point.x + sign * nx, point.y + sign * ny, z);
      uv.push(u / total, (sign + 1) / 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  mesh.geometry.dispose(); mesh.geometry = geometry;
  mesh.material.uniforms.opacity.value = 0.4 + 0.55 * Math.sqrt(strength);
}

// N bounces shows the outgoing path after contact N, up to contact N + 1.
// A clipped endpoint is an impact, never a predicted resting position.
export function limitCuePath(path, bounces) {
  if (!path || !Number.isFinite(bounces)) return path;
  const end = path.bounces?.[Math.max(0, Math.floor(bounces))];
  return end === undefined ? path : { ...path, points: path.points.slice(0, end + 1), stopped: false };
}
