import * as THREE from 'three';

// An illustrated solar photosphere. Shared time keeps the surface, corona and
// prominences synchronized with replay pause/seek as well as live play.
export function createSunMaterials(time, map) {
  map.wrapS = THREE.RepeatWrapping;
  const surface = new THREE.MeshBasicMaterial({ map, toneMapped: false });
  surface.name = 'sun-photosphere';
  surface.onBeforeCompile = shader => {
    shader.uniforms.solarTime = time;
    shader.vertexShader = `uniform float solarTime;
      varying vec3 solarNormal; varying vec3 solarView;
      ${shader.vertexShader}`.replace('#include <uv_vertex>', `
      #include <uv_vertex>
      solarNormal = normalMatrix * normal;
      solarView = -(modelViewMatrix * vec4(position, 1.0)).xyz;
      float polarFade = smoothstep(0.0, 0.12, uv.y) * smoothstep(0.0, 0.12, 1.0 - uv.y);
      vMapUv += 0.002 * polarFade * vec2(
        sin(dot(position, vec3(7.0, 4.0, 3.0)) + solarTime * 0.23),
        cos(dot(position, vec3(3.0, 8.0, 5.0)) - solarTime * 0.19));
    `);
    shader.fragmentShader = `varying vec3 solarNormal; varying vec3 solarView;
      ${shader.fragmentShader}`.replace('#include <map_fragment>', `
      #include <map_fragment>
      float mu = max(dot(normalize(solarNormal), normalize(solarView)), 0.0);
      float heat = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = (diffuseColor.rgb * 1.25 + vec3(0.12, 0.09, 0.04) * heat)
        * (0.48 + 0.52 * sqrt(mu));
    `);
  };
  surface.customProgramCacheKey = () => 'solar-photosphere-v1';

  const corona = new THREE.ShaderMaterial({
    uniforms: { time }, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec2 solarPosition;
      void main() {
        vec4 center = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        center.xy += position.xy * length(modelViewMatrix[0].xyz);
        solarPosition = position.xy / 1.5;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `uniform float time; varying vec2 solarPosition;
      void main() {
        float radius = length(solarPosition);
        if (radius < 0.99 || radius > 1.28) discard;
        float angle = atan(solarPosition.y, solarPosition.x);
        float rays = 0.5 + 0.25 * sin(angle * 19.0 + sin(angle * 7.0) + time * 0.3)
          + 0.25 * sin(angle * 37.0 - time * 0.5);
        float height = max(0.0, radius - 1.0);
        float glow = exp(-height * 30.0) * 0.5;
        glow += exp(-height * (24.0 - rays * 10.0)) * pow(rays, 3.0) * 0.25;
        glow *= 1.0 - smoothstep(1.18, 1.28, radius);
        gl_FragColor = vec4(mix(vec3(1.0, 0.14, 0.015), vec3(1.0, 0.65, 0.18),
          exp(-height * 24.0)), glow);
        #include <colorspace_fragment>
      }`,
  });
  corona.name = 'sun-corona';
  const prominence = new THREE.ShaderMaterial({
    uniforms: { time }, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: `varying vec2 loopUv;
      void main() { loopUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; varying vec2 loopUv;
      void main() {
        float flow = 0.65 + 0.35 * sin(loopUv.x * 24.0 - time * 1.2);
        gl_FragColor = vec4(1.0, 0.24 + flow * 0.25, 0.035, flow * 0.7);
        #include <colorspace_fragment>
      }`,
  });
  prominence.name = 'sun-prominence';
  return { surface, corona, prominence };
}

// The scene owns one light; only the currently displayed cue drives it.
// Disable it below the cloth as a scratch drops out of view.
export function updateSunLight(light, mesh, enabled, feltZ) {
  if (!light) return;
  light.visible = !!(enabled && mesh?.visible);
  if (!light.visible) return;
  mesh.getWorldPosition(light.position);
  light.visible = light.position.z > feltZ;
}
