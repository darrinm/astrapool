import * as THREE from 'three';

// A bounded light-path integration for the miniature ball, rather than separate
// decorative disk/arc meshes. Uses the Schwarzschild orbit acceleration in a
// fixed observer frame; finite steps and a finite disk thickness are deliberate
// real-time approximations. The table/background itself is not refracted.
export function createBlackHoleMaterial(time) {
  return new THREE.ShaderMaterial({
    uniforms: { time }, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `varying vec2 screenPosition; varying vec3 diskNormal; varying vec3 diskAxis;
      void main() {
        diskNormal = normalize(mat3(modelViewMatrix) * vec3(0.0, 1.0, 0.0));
        diskAxis = normalize(mat3(modelViewMatrix) * vec3(1.0, 0.0, 0.0));
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float scale = length(modelViewMatrix[0].xyz);
        center.xy += position.xy * scale;
        // Render in front of the dark sphere, but keep ordinary depth testing
        // against nearer balls. The aiming cap is drawn afterward.
        center.z += 1.5 * 1.015 * scale;
        screenPosition = position.xy / 1.5;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `uniform float time;
      varying vec2 screenPosition; varying vec3 diskNormal; varying vec3 diskAxis;
      const float horizon = 0.385;
      // A compact, stylized emitting region, including the plunging flow.
      const float innerDisk = 0.88;
      const float outerDisk = 1.40;

      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)),
          dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7)),
          dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7)),
          dot(i + vec2(1.0), vec2(127.1, 311.7)))) * 43758.5453);
        return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
      }
      float erf(float x) {
        float t = 1.0 / (1.0 + 0.3275911 * abs(x));
        return sign(x) * (1.0 - (((((1.061405429 * t - 1.453152027) * t)
          + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-x * x));
      }
      vec3 acceleration(vec3 p, float angularMomentum2) {
        float r2 = dot(p, p);
        return -1.5 * horizon * angularMomentum2 * p / (r2 * r2 * sqrt(r2));
      }
      void main() {
        vec3 normal = normalize(diskNormal);
        vec3 axis = normalize(diskAxis);
        vec3 across = normalize(cross(normal, axis));
        vec3 p = vec3(screenPosition, 7.0), velocity = vec3(0.0, 0.0, -1.0);
        float momentum2 = dot(screenPosition, screenPosition);
        vec3 light = vec3(0.0);
        float transmission = 1.0;
        for (int i = 0; i < 192; i++) {
          float radius = length(p);
          if (radius < horizon * 1.03 || radius > 8.0) break;
          float stepSize = clamp(radius * 0.04, 0.016, 0.20);
          vec3 old = p;
          velocity += acceleration(p, momentum2) * stepSize * 0.5;
          p += velocity * stepSize;
          velocity += acceleration(p, momentum2) * stepSize * 0.5;
          float before = dot(old, normal), after = dot(p, normal);
          bool crossed = before * after < 0.0;
          vec3 hit = crossed ? mix(old, p, before / (before - after)) : (old + p) * 0.5;
          float radial = length(hit - normal * dot(hit, normal));
          if (radial > innerDisk && radial < outerDisk) {
            // Finite thickness keeps the front band visible exactly edge-on.
            float thickness = 0.022 + 0.012 * (radial - innerDisk);
            float delta = abs(after - before);
            float coverage = delta > 0.0001
              ? 0.886227 * stepSize / delta * abs(erf(after / thickness) - erf(before / thickness))
              : exp(-pow((after + before) * 0.5 / thickness, 2.0)) * stepSize / thickness;
            if (coverage > 0.003) {
              float r = (radial - innerDisk) / (outerDisk - innerDisk);
              float angle = atan(dot(hit, across), dot(hit, axis));
              float orbit = angle - time * 0.45 / pow(radial, 1.5);
              // Periodic coordinates prevent an angular seam. Broad noise
              // shears into wisps without drawing regular concentric stripes.
              vec2 flow = vec2(cos(orbit), sin(orbit)) * (3.0 + r * 4.0);
              float grain = 0.30 + 0.70 * noise(flow + vec2(r * 3.0, -r * 2.0));
              grain *= 0.65 + 0.35 * noise(flow * 3.0 + vec2(r * 13.0));
              float edge = smoothstep(0.0, 0.07, r) * (1.0 - smoothstep(0.65, 1.0, r));
              float opacity = 1.0 - exp(-coverage * edge * grain * 0.8);
              vec3 heat = mix(vec3(3.8, 2.3, 0.85), vec3(1.8, 0.36, 0.045), pow(r, 0.7));
              vec3 tangent = normalize(cross(normal, hit));
              float beaming = 0.85 + 0.3 * dot(tangent, -normalize(velocity));
              light += transmission * opacity * heat * beaming * (0.7 + 0.6 * grain);
              transmission *= 1.0 - opacity;
            }
          }
          if (transmission < 0.025) break;
        }
        float impact = length(screenPosition);
        float glow = exp(-pow((impact - 1.015) / 0.025, 2.0)) * 0.05;
        light += vec3(1.0, 0.5, 0.12) * glow;
        float shadow = 1.0 - smoothstep(0.995, 1.008, impact);
        float alpha = max(1.0 - transmission * (1.0 - shadow), glow);
        if (alpha < 0.003) discard;
        // Local highlight compression gives hot cream/gold instead of clipping
        // the whole effect to white, without a full-screen bloom pass.
        vec3 color = 1.0 - exp(-light / max(alpha, 0.001));
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
  });
}
