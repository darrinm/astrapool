import * as THREE from 'three';
import { P, cushionPolygons, tableShape } from '../physics/poolphysics.js';

export function createCushionShadows(surfaceZ) {
  // Include both angled jaws as well as the long nose of each cushion. Taking
  // the nearest edge gives a continuous soft contour without overlapping strips.
  const edges = cushionPolygons().flatMap(points => points.slice(0, 3).map((a, i) => {
    const b = points[i + 1];
    return new THREE.Vector4(a[0], a[1], b[0], b[1]);
  }));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      edges: { value: edges },
      halfSize: { value: new THREE.Vector2(P.HW, P.HH) },
      width: { value: 0.9 },
      opacity: { value: 0.48 }, // previous gradient alpha 0.6 × strip opacity 0.8
    },
    transparent: true, depthWrite: false,
    vertexShader: `
      varying vec2 feltPosition;
      void main() {
        feltPosition = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec4 edges[${edges.length}];
      uniform vec2 halfSize;
      uniform float width;
      uniform float opacity;
      varying vec2 feltPosition;
      void main() {
        // Most of the felt is too far from a cushion to receive contact shade.
        if (all(lessThan(abs(feltPosition), halfSize - vec2(width)))) discard;
        float distanceToCushion = width;
        for (int i = 0; i < ${edges.length}; i++) {
          vec2 a = edges[i].xy, delta = edges[i].zw - a;
          float t = clamp(dot(feltPosition - a, delta) / dot(delta, delta), 0.0, 1.0);
          distanceToCushion = min(distanceToCushion, length(feltPosition - a - t * delta));
        }
        float alpha = opacity * (1.0 - smoothstep(0.0, width, distanceToCushion));
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Use the actual perforated bed: shadow fragments never span pocket holes.
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(tableShape(), 40), material);
  mesh.position.z = surfaceZ + 0.012;
  return mesh;
}
