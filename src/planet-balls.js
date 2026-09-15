import * as THREE from 'three';
import { SUN, WORLDS, planetForBall } from './ball-sets.js';
import { capCanvas, CAP_DEG } from './ballcaps.js';
import { createBlackHoleMaterial } from './black-hole.js';
import { createSunMaterials } from './sun.js';

const BASE_RADIUS = 1.5; // The shared ball geometry, before the pool's scale.
const noRaycast = () => {}; // Decorations must never steal a shot or fling.
const capAngle = THREE.MathUtils.degToRad(CAP_DEG);
const capUp = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1));
const capParentRotation = new THREE.Quaternion();

// Only the cap counter-rotates. The surface, rings, and orbital planes retain
// the physics ball's orientation. Pool's vertical axis is world +Z.
export function updatePlanetCaps(balls, visible) {
  for (const { mesh } of balls) {
    const cap = mesh.getObjectByName('planet-cap');
    if (!cap) continue;
    cap.visible = visible;
    if (visible) {
      cap.parent.getWorldQuaternion(capParentRotation);
      cap.quaternion.copy(capParentRotation).invert().multiply(capUp);
    }
  }
}

// Stable textures let downloads improve live balls and replay clones in place.
// Collection creation never waits for the network.
export function createPlanetSet(load = url => new THREE.TextureLoader().loadAsync(url), { onUpdate = () => {} } = {}) {
  const maps = new Map(), materials = new Set(), geometries = new Set();
  const roots = new Set();
  let disposed = false, details;
  function dispose() {
    if (disposed) return;
    disposed = true;
    roots.forEach(root => {
      if (root.parent) {
        root.parent.receiveShadow = root.userData.originalReceiveShadow;
        root.parent.castShadow = root.userData.originalCastShadow;
      }
      root.removeFromParent();
    }); roots.clear();
    maps.forEach(map => map.dispose()); materials.forEach(mat => mat.dispose()); geometries.forEach(geo => geo.dispose());
  }
  const primaryIds = [SUN.id, ...WORLDS.map(p => p.id).filter(id => id !== 'black-hole'), 'clouds', 'saturn-ring'];
  const companionIds = [...new Set(WORLDS.flatMap(p => p.moons.map(([name]) => name.toLowerCase())))].filter(id => !primaryIds.includes(id));
  const ids = [...primaryIds, ...companionIds];
  const colors = new Map([SUN, ...WORLDS].map(p => [p.id, p.color]));
  for (const world of WORLDS) for (const [name, color] of world.moons) {
    if (!colors.has(name.toLowerCase())) colors.set(name.toLowerCase(), color);
  }

  function canvasMap(id, width, height, draw) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8; maps.set(id, map); return map;
  }
  for (const id of ids) {
    const map = canvasMap(id, 1, 1, ctx => {
      ctx.fillStyle = id === 'clouds' ? '#000000' : colors.get(id) || '#e3c58f';
      ctx.fillRect(0, 0, 1, 1);
    });
    if (id === 'clouds') map.colorSpace = THREE.NoColorSpace;
  }
  // Radial density strips stay crisp at close range and mipmap cleanly at
  // table scale. Saturn retains the source colors, with a clear main division.
  function paintRing(type, ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    if (type === 'saturn') ctx.drawImage(maps.get('saturn-ring').image, 0, 0, width, height);
    else { ctx.fillStyle = type === 'dust' ? '#b9a28c' : '#dad2bf'; ctx.fillRect(0, 0, width, height); }
    const pixels = ctx.getImageData(0, 0, width, height), data = pixels.data;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const r = x / (width - 1), i = (y * width + x) * 4;
      const grain = .78 + .14 * Math.sin(x * .31) + .08 * Math.sin(x * 1.13);
      const edge = Math.min(1, r * 45, (1 - r) * 45);
      const gap = type === 'saturn' && r > .675 && r < .72 ? .025 : 1;
      const density = type === 'dust' ? .26 * Math.sin(Math.PI * r) : type === 'saturn' ? 1 : .85;
      data[i + 3] *= grain * edge * gap * density;
    }
    ctx.putImageData(pixels, 0, 0);
  }
  for (const type of ['saturn', 'dust', 'fine', 'arcs']) {
    canvasMap(`ring-${type}`, 2048, 8, (ctx, width, height) => paintRing(type, ctx, width, height));
  }
  const time = { value: 0 };
  const sun = createSunMaterials(time, maps.get(SUN.id));
  Object.values(sun).forEach(mat => materials.add(mat));
  const coronaGeo = new THREE.PlaneGeometry(BASE_RADIUS * 2.56, BASE_RADIUS * 2.56);
  const loopGeo = new THREE.TorusGeometry(BASE_RADIUS * .105, BASE_RADIUS * .007, 8, 48, Math.PI);
  geometries.add(coronaGeo); geometries.add(loopGeo);
  const blackHole = createBlackHoleMaterial(time);
  materials.add(blackHole);
  const blackHoleGeo = new THREE.PlaneGeometry(BASE_RADIUS * 3.8, BASE_RADIUS * 3.8);
  geometries.add(blackHoleGeo);
  const saturation = { value: 1 };
  function material(options, graded = false) {
    const mat = new THREE.MeshPhysicalMaterial(options); materials.add(mat);
    if (graded) {
      mat.onBeforeCompile = shader => {
        shader.uniforms.planetSaturation = saturation;
        shader.fragmentShader = `uniform float planetSaturation;\n${shader.fragmentShader}`.replace('#include <map_fragment>', `
          #include <map_fragment>
          float luminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = max(vec3(0.0), mix(vec3(luminance), diffuseColor.rgb, planetSaturation));
        `);
      };
      mat.customProgramCacheKey = () => 'planet-saturation-v4';
    }
    return mat;
  }
  const surfaces = new Map(), capMaterials = new Map();
  // Same artwork and angular dimensions as Heads, projected onto a shallow
  // spherical patch so it can stay upright independently of the surface map.
  const capGeo = new THREE.SphereGeometry(BASE_RADIUS * 1.012, 64, 16, 0, Math.PI * 2, 0, capAngle);
  geometries.add(capGeo);
  const positions = capGeo.attributes.position, uv = capGeo.attributes.uv;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const planar = Math.hypot(x, z), angle = Math.atan2(planar, y);
    const scale = planar > 0 ? .5 * angle / capAngle / planar : 0;
    uv.setXY(i, .5 + x * scale, .5 - z * scale);
  }
  for (const [index, { id }] of WORLDS.entries()) {
    // The published Neptune map is strongly enhanced Voyager blue. A light
    // cyan mix pulls it back toward the blue-green visible-light planet.
    let map = maps.get(id);
    if (id === 'pluto') {
      // Retain the original NASA reference map's longitude alignment
      // for the approved artistic reconstruction.
      map.wrapS = THREE.RepeatWrapping; map.offset.x = .5;
    }
    const capMap = new THREE.CanvasTexture(capCanvas(index + 1));
    capMap.colorSpace = THREE.SRGBColorSpace; capMap.anisotropy = 8; maps.set(`${id}-cap`, capMap);
    const capMat = material({ map: capMap, roughness: .65, clearcoat: .18,
      transparent: true, depthWrite: false, emissiveMap: capMap, emissive: '#ffffff', emissiveIntensity: .035 });
    capMat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        #include <map_fragment>
        diffuseColor.a *= 1.0 - smoothstep(0.94, 1.0, length((vMapUv - 0.5) * 2.0));
      `);
    };
    capMat.customProgramCacheKey = () => 'planet-cap-feather-v1';
    capMaterials.set(id, capMat);
    const mat = id === 'black-hole' ? new THREE.MeshBasicMaterial({ color: '#010101', toneMapped: false }) : material({ map, roughness: id === 'earth' ? .54 : .7, clearcoat: .18,
      clearcoatRoughness: .4, envMapIntensity: .45, emissive: '#ffffff', emissiveMap: map,
      emissiveIntensity: id === 'moon' ? .08 : .035 }, true);
    materials.add(mat); surfaces.set(id, mat);
  }
  const sphere = new THREE.SphereGeometry(1, 20, 12); geometries.add(sphere);
  const cloudGeo = new THREE.SphereGeometry(BASE_RADIUS * 1.006, 48, 32); geometries.add(cloudGeo);
  const cloudMat = material({ color: '#ffffff', alphaMap: maps.get('clouds'), transparent: true,
    opacity: .85, depthWrite: false, roughness: 1, envMapIntensity: .1 });
  const moonMats = new Map();
  const ringMats = new Map();
  // Share both shadow passes across bands, collection switches, and replays.
  const ringShadowOptions = { map: maps.get('ring-saturn'), alphaTest: .3, side: THREE.DoubleSide };
  const ringDepth = new THREE.MeshDepthMaterial({ ...ringShadowOptions, depthPacking: THREE.RGBADepthPacking });
  const ringDistance = new THREE.MeshDistanceMaterial(ringShadowOptions);
  for (const mat of [ringDepth, ringDistance]) {
    // WebGLShadowMap copies alphaTest from the visible material. Keep the
    // denser shadow cutoff in the shader for both table and Sun lighting.
    mat.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.3) discard;');
    };
    mat.customProgramCacheKey = () => 'planet-ring-shadow-density-v1';
    materials.add(mat);
  }
  const ringGeometries = new Map();
  function ringGeometry(inner, outer, start = 0, length = Math.PI * 2) {
    const key = [inner, outer, start, length].join('/');
    if (ringGeometries.has(key)) return ringGeometries.get(key);
    const geometry = new THREE.RingGeometry(inner * BASE_RADIUS, outer * BASE_RADIUS, 128, 1, start, length);
    const p = geometry.attributes.position, uv = geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (Math.hypot(p.getX(i), p.getY(i)) / BASE_RADIUS - inner) / (outer - inner), .5);
    geometries.add(geometry); ringGeometries.set(key, geometry); return geometry;
  }
  function rings(planet, group) {
    if (!planet.rings || planet.rings === 'accretion') return;
    // SphereGeometry's poles are ±Y. Rings lie in the planet's XZ equator
    // and inherit its rotation naturally, including in rack/replay clones.
    const system = new THREE.Group(); system.rotation.x = Math.PI / 2;
    group.add(system);
    const type = planet.rings;
    if (!ringMats.has(type)) {
      const map = maps.get(`ring-${type}`);
      ringMats.set(type, material({ color: type === 'saturn' ? '#fff4dd' : '#e0d9cb', map,
        transparent: true, alphaTest: .02, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide,
        depthWrite: false, roughness: .95, envMapIntensity: .2,
        emissive: '#d9cbaa', emissiveMap: map, emissiveIntensity: .1 }));
    }
    const bands = type === 'saturn' ? [[1.17, 1.85], [1.92, 1.933]] : type === 'dust' ? [[1.22, 1.4]] :
      type === 'fine' ? [[1.14, 1.148], [1.18, 1.196], [1.24, 1.25], [1.29, 1.316]] : [[1.16, 1.168], [1.22, 1.23], [1.29, 1.32]];
    for (const [inner, outer] of bands) {
      const ring = new THREE.Mesh(ringGeometry(inner, outer), ringMats.get(type)); ring.name = `${planet.id}-rings`;
      ring.receiveShadow = true;
      // Only dense bands cast shadows; faint dust remains translucent.
      ring.castShadow = type === 'saturn';
      if (ring.castShadow) {
        ring.customDepthMaterial = ringDepth;
        ring.customDistanceMaterial = ringDistance;
      }
      system.add(ring);
    }
    if (type === 'arcs') {
      const arc = new THREE.Mesh(ringGeometry(1.29, 1.34, .2, .65), ringMats.get(type)); system.add(arc);
    }
  }
  async function loadMap(id, preview) {
    if (disposed) return;
    const url = preview ? `/planets/preview/${id}.webp` : `/planets/${id}.${id === 'saturn-ring' ? 'png' : 'jpg'}`;
    const downloaded = await load(url);
    try {
      if (disposed) return;
      let image = downloaded.image;
      if (id === 'neptune') {
        // Apply the same visible-light color correction at both resolutions.
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        ctx.globalAlpha = .62; ctx.fillStyle = '#83bdc7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        image = canvas;
      }
      const map = maps.get(id);
      // WebGL texture storage is immutable in size. Release that allocation
      // before changing resolution, while retaining the shared JS texture.
      if (map.image.width !== image.width || map.image.height !== image.height) map.dispose();
      map.image = image; map.needsUpdate = true;
      if (id === 'saturn-ring') {
        const ring = maps.get('ring-saturn'), canvas = ring.image;
        paintRing('saturn', canvas.getContext('2d'), canvas.width, canvas.height);
        ring.needsUpdate = true;
      }
      onUpdate();
    } finally { downloaded.dispose(); }
  }
  // Prioritize the rack itself; tiny companion moons follow. A missing map
  // keeps its fallback without preventing the game or other maps from loading.
  const ready = Promise.allSettled(primaryIds.map(id => loadMap(id, true)))
    .then(() => Promise.allSettled(companionIds.map(id => loadMap(id, true))));
  return {
    ready,
    loadDetails() {
      // Called once the room is visible. Two downloads at a time avoid a burst
      // of large transfers and GPU uploads while the player is taking a shot.
      return details ??= ready.then(async () => {
        const queue = [...ids];
        async function worker() {
          while (!disposed && queue.length) {
            const id = queue.shift();
            try { await loadMap(id, false); }
            catch (error) { if (!disposed) console.warn(`Could not load detailed ${id} texture`, error); }
          }
        }
        await Promise.all([worker(), worker()]);
      });
    },
    dispose,
    setTime(seconds) { time.value = seconds; },
    setSaturation(value) { saturation.value = THREE.MathUtils.clamp(value, 1, 1.7); },
    attach(mesh, number) {
      if (!planetForBall(number)) return;
      mesh.material = number === 0 ? sun.surface : surfaces.get(planetForBall(number).id);
      const root = new THREE.Group(); root.name = 'planet-decoration';
      root.userData.originalReceiveShadow = mesh.receiveShadow;
      root.userData.originalCastShadow = mesh.castShadow;
      mesh.receiveShadow = number !== 0;
      if (number === 0) mesh.castShadow = false;
      roots.add(root); mesh.add(root);
      if (number === 0) {
        const corona = new THREE.Mesh(coronaGeo, sun.corona); corona.name = 'sun-corona'; root.add(corona);
        for (const [index, direction] of [[.9, .3, .1], [-.5, .4, .8], [.15, -.8, -.55]].entries()) {
          const loop = new THREE.Mesh(loopGeo, sun.prominence); loop.name = 'sun-prominence';
          const radial = new THREE.Vector3(...direction).normalize();
          loop.position.copy(radial).multiplyScalar(BASE_RADIUS * 1.002);
          loop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
          loop.rotateY(index * 1.3); loop.scale.setScalar(1 - index * .16); root.add(loop);
        }
        root.traverse(object => { object.raycast = noRaycast; });
        return;
      }
      const planet = planetForBall(number), system = new THREE.Group(); system.name = 'planet-system'; root.add(system);
      rings(planet, system);
      const cap = new THREE.Mesh(capGeo, capMaterials.get(planet.id));
      cap.name = 'planet-cap'; cap.visible = false; cap.renderOrder = 1; root.add(cap);
      if (planet.id === 'black-hole') {
        const effect = new THREE.Mesh(blackHoleGeo, blackHole);
        effect.name = 'black-hole-accretion'; root.add(effect);
      }
      // Reserve a separate radial lane for each enlarged moon. Even when
      // faster moons lap slower ones, their surfaces and Saturn's rings clear.
      let orbitEdge = planet.id === 'saturn' ? 1.933 : 1.4;
      planet.moons.forEach(([name, color, size], index) => {
        if (!moonMats.has(name)) moonMats.set(name, material({ color: '#ffffff', map: maps.get(name.toLowerCase()),
          roughness: .92, emissive: '#ffffff', emissiveMap: maps.get(name.toLowerCase()), emissiveIntensity: .045, envMapIntensity: .25 }));
        const moon = new THREE.Mesh(sphere, moonMats.get(name)); moon.name = name;
        moon.castShadow = true; moon.receiveShadow = true;
        moon.scale.setScalar(BASE_RADIUS * size);
        if (name === 'Phobos' || name === 'Deimos') moon.scale.multiply(new THREE.Vector3(1.25, .82, 1));
        const angle = .5 + index * Math.PI * 2 / planet.moons.length + number * .63;
        const extent = Math.max(moon.scale.x, moon.scale.y, moon.scale.z) / BASE_RADIUS;
        const orbit = BASE_RADIUS * Math.max(1.55, orbitEdge + extent + .1);
        orbitEdge = orbit / BASE_RADIUS + extent;
        // A local orbit keeps its plane attached to the rolling planet. Store
        // serializable parameters so replay clones can animate independently.
        moon.userData.planetOrbit = { phase: angle, radius: orbit, height: BASE_RADIUS * .26,
          speed: (name === 'Triton' ? -1 : 1) * Math.PI * 2 / (10 + index * 3 + number * .35) };
        moon.position.set(Math.cos(angle) * orbit, BASE_RADIUS * .26, Math.sin(angle) * orbit);
        system.add(moon);
      });
      if (planet.id === 'earth') { const clouds = new THREE.Mesh(cloudGeo, cloudMat); clouds.name = 'planet-clouds'; clouds.receiveShadow = true; root.add(clouds); }
      root.traverse(object => { object.raycast = noRaycast; });
    },
    detach(mesh) {
      const root = mesh.getObjectByName('planet-decoration');
      if (root) {
        mesh.receiveShadow = root.userData.originalReceiveShadow;
        mesh.castShadow = root.userData.originalCastShadow;
        root.removeFromParent(); roots.delete(root);
      }
    },
  };
}

// Time-based (not frame-based) motion; replay uses its own clock, including pause/seek.
export function updatePlanetOrbits(balls, seconds) {
  for (const { mesh } of balls) {
    const system = mesh.getObjectByName('planet-system');
    if (!system) continue;
    for (const moon of system.children) {
      const orbit = moon.userData.planetOrbit;
      if (!orbit) continue;
      const angle = orbit.phase + seconds * orbit.speed;
      moon.position.set(Math.cos(angle) * orbit.radius, orbit.height, Math.sin(angle) * orbit.radius);
    }
  }
}
