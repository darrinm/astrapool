import * as THREE from 'three';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { carpetMap, radialShadow, softBoxShadow } from './textures.js';

export const ENVIRONMENTS = [
  { id: 'minimal', name: 'Minimal', time: 'ORIGINAL', description: 'Green felt, dark walnut, a quiet room. Just you and the table.', sky: '#0a0a0d', hemi: 0.12, exposure: 0.9 },
  { id: 'corner', name: 'The Corner Pocket', time: '12:42 AM · AFTER HOURS', description: 'Oxblood leather, aged brass, and walnut under amber light. A private club after hours.', felt: '#702c40', wood: ['#42271a', '#64452e', '#785037', '#4b2d1e'], trim: '#20140d', floor: '#252022', sky: '#100f19', lamp: '#fff1d6', accent: '#e7bd7d', hemi: 0.42, exposure: 1.0 },
  { id: 'desert', name: 'Desert Modern', time: '5:18 PM · GOLDEN HOUR', description: 'Travertine, saddle leather, and mountains beyond the glass. The last light of the desert.', felt: '#688362', wood: ['#8d6541', '#b6905f', '#c6a474', '#a47f52'], trim: '#72543b', floor: '#bea58b', sky: '#eab584', lamp: '#fff7df', accent: '#f3c58e', hemi: 0.95, exposure: 1.0 },
  { id: 'tokyo', name: 'Tokyo Rooftop', time: '11:06 PM · RAIN IN THE CITY', description: 'A sheltered terrace above the city. Silver rain, dark stone, and a thousand distant windows.', felt: '#315b80', wood: ['#080e18', '#101827', '#172438', '#0a1020'], trim: '#0d1724', floor: '#152638', sky: '#091224', lamp: '#e9f5ff', accent: '#6de4ee', hemi: 0.48, exposure: 1.0 },
  { id: 'orbital', name: 'Orbital Lounge', time: '03:27 UTC · EARTHRISE · DEFAULT', description: 'Satin titanium and quiet ivory. A front-row seat to Earth, suspended in the dark.', felt: '#367c7f', wood: ['#4c626c', '#71858b', '#88999d', '#5a7079'], trim: '#253e4c', floor: '#172c3a', sky: '#030916', lamp: '#e5f7ff', accent: '#93e3f0', hemi: 0.65, exposure: 1.0 },
  { id: 'alpine', name: 'Alpine Lodge', time: '6:04 PM · WINTER DUSK', description: 'Snow beyond the glass, oak underfoot, and the warmth of a mountain lodge.', felt: '#576879', wood: ['#39281e', '#5a4130', '#76563d', '#463224'], trim: '#30251f', floor: '#504034', sky: '#182332', lamp: '#ffe2b8', accent: '#e8c69e', hemi: 0.58, exposure: 1.0 },
  { id: 'glasshouse', name: 'The Glasshouse', time: '8:16 AM · FIRST LIGHT', description: 'An iron-and-glass conservatory, lush palms, and sunlight through the leaves.', felt: '#416e59', wood: ['#766044', '#a38a61', '#baa37b', '#8b744f'], trim: '#42594b', floor: '#b6b49d', sky: '#899c8b', lamp: '#fff4d8', accent: '#b9d4a3', hemi: 0.9, exposure: 1.0, fill: 1.5 },
  { id: 'coast', name: 'Amalfi Terrace', time: '4:32 PM · SEA BREEZE', description: 'Cream arches, weathered terracotta, and the Mediterranean stretching to the horizon.', felt: '#397d8c', wood: ['#9a7248', '#bd9765', '#d0ad7d', '#aa8354'], trim: '#826345', floor: '#ae795a', sky: '#92b8c6', lamp: '#fff1d4', accent: '#a6dce3', hemi: 0.95, exposure: 1.0, fill: 1.6 },
  { id: 'riad', name: 'Atlas Courtyard', time: '7:48 PM · LANTERN HOUR', description: 'Rose plaster, emerald tile, and amber lanterns beneath carved cedar.', felt: '#325e53', wood: ['#4c2b1c', '#72432a', '#945f3a', '#5d3521'], trim: '#503520', floor: '#a88c69', sky: '#1d2546', lamp: '#ffdfae', accent: '#edbd77', hemi: 0.6, exposure: 1.0 },
];
const DEFAULT_ENVIRONMENT = ENVIRONMENTS.find(environment => environment.id === 'orbital');
// The table lamp is the key light. Room fill, hemisphere and reflections run at this fraction of the
// values above, and the photographed room darkens with distance from the table, so the lit table is
// the brightest thing in every room.
export const ROOM_LIGHT = 0.7;
const BACKDROP_NEAR = 0.85, BACKDROP_FAR = 0.5;    // panorama brightness at the table and at the walls
const BACKDROP_FALLOFF = [40, 130];                // distance from the table centre over which it falls
export const environmentById = id => ENVIRONMENTS.find(environment => environment.id === id) || DEFAULT_ENVIRONMENT;
export function readEnvironment(storage) {
  try { return environmentById(storage.getItem('pool.environment')).id; } catch { return DEFAULT_ENVIRONMENT.id; }
}

// Every room owns its downloads and GPU resources. The caller keeps the current
// room visible until ready, then swaps atomically; stale requests can be disposed.
const assets = {
  panorama: url => new THREE.TextureLoader().loadAsync(url),
  shadow: url => new THREE.TextureLoader().loadAsync(url),
  furniture: async url => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    return (await new GLTFLoader().loadAsync(url)).scene;
  },
};

export function buildEnvironment(theme, floorZ, loaders = assets) {
  const group = new THREE.Group(); group.name = `environment-${theme.id}`;
  const materials = new Set(), geometries = new Set(), maps = new Set();
  let disposed = false;
  const mobile = globalThis.matchMedia?.('(max-width: 600px), (hover: none) and (pointer: coarse)').matches;
  function own(root) {
    root.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean)) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) maps.add(value);
      }
    });
    return root;
  }
  function mesh(geometry, material, x, y, z) {
    const item = new THREE.Mesh(geometry, material); item.position.set(x, y, z);
    group.add(own(item)); return item;
  }
  function tableShadows() {
    const floating = theme.id === 'orbital';
    const blur = floating ? 6 : 3.5, width = 88, height = 50;
    const contact = mesh(
      new THREE.PlaneGeometry(width + blur * 8, height + blur * 8),
      new THREE.MeshBasicMaterial({ map: softBoxShadow(width, height, blur, mobile ? 256 : 512), transparent: true, opacity: floating ? 0.48 : 0.315, depthWrite: false, toneMapped: false }),
      0, 0, floorZ + 0.02,
    );
    contact.name = 'table-floor-shadow'; contact.renderOrder = -1; contact.raycast = () => {};
    if (floating) return;
    // Match the actual foot blocks at (HW - 3, HH - 1), rather than a generic oval.
    const geometry = new THREE.PlaneGeometry(10, 10);
    const material = new THREE.MeshBasicMaterial({ map: softBoxShadow(3.6, 3.6, .8, 64), transparent: true, opacity: .465, depthWrite: false, toneMapped: false });
    for (const x of [-36, 36]) for (const y of [-18.5, 18.5]) {
      const foot = mesh(geometry, material, x, y, floorZ + .03);
      foot.name = 'table-foot-shadow'; foot.raycast = () => {};
    }
  }
  function release() {
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); maps.forEach(t => t.dispose());
    geometries.clear(); materials.clear(); maps.clear();
  }
  const room = {
    group, environmentMap: null, ready: Promise.resolve(),
    dispose() { disposed = true; group.removeFromParent(); release(); },
  };
  if (theme.id === 'minimal') {
    // Preserve the original room, including its texture and lighting conventions.
    const floor = mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ map: carpetMap(512, 30, '#121014'), roughness: 1 }), 0, 0, floorZ);
    floor.receiveShadow = true;
    tableShadows();
    const wall = new THREE.MeshStandardMaterial({ color: '#121116', roughness: 1, side: THREE.DoubleSide });
    const base = new THREE.MeshStandardMaterial({ color: '#0d0c0f', roughness: 0.7 });
    const wallGeometry = new THREE.PlaneGeometry(320, 140), baseGeometry = new THREE.BoxGeometry(320, 0.6, 2.2);
    for (const [x, y, angle] of [[0, 160, 0], [0, -160, Math.PI], [160, 0, -Math.PI / 2], [-160, 0, Math.PI / 2]]) {
      const panel = mesh(wallGeometry, wall, x, y, floorZ + 70);
      panel.rotation.set(Math.PI / 2, 0, 0); panel.rotateOnWorldAxis(new THREE.Vector3(0, 0, 1), angle); panel.receiveShadow = true;
      mesh(baseGeometry, base, x, y, floorZ + 1.1).rotation.z = angle;
    }
    return room;
  }
  // The projected floor gives nearby ground parallax while retaining photographic
  // architecture at the perimeter. Camera capture height is 1.6 m; 1 unit = 26 mm.
  room.ready = Promise.allSettled([
    loaders.panorama(`/environments/${theme.id}.webp`),
    loaders.furniture(`/environments/${theme.id}-furniture.glb`),
    loaders.shadow?.(`/environments/${theme.id}-shadows${mobile ? '-mobile' : ''}.png`),
  ]).then(([image, model, shadow]) => {
    if (image.status === 'fulfilled') maps.add(image.value);
    if (model.status === 'fulfilled') own(model.value);
    if (shadow.status === 'fulfilled' && shadow.value) maps.add(shadow.value);
    if (disposed) { release(); return; }
    const failure = [image, model].find(item => item.status === 'rejected');
    if (failure) { room.dispose(); throw failure.reason; }

    const map = image.value;
    map.colorSpace = THREE.SRGBColorSpace; map.mapping = THREE.EquirectangularReflectionMapping;
    map.anisotropy = 8;
    room.environmentMap = map;
    const height = 1.6 / 0.026;
    const sky = own(new GroundedSkybox(map, height, 380, 96));
    sky.rotation.x = Math.PI / 2; sky.position.z = floorZ + height;
    sky.material.toneMapped = false; sky.renderOrder = -10;
    sky.material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRoomXY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvRoomXY = (modelMatrix * vec4(transformed, 1.0)).xy;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vRoomXY;')
        .replace('#include <opaque_fragment>', `outgoingLight *= mix(${BACKDROP_NEAR.toFixed(3)}, ${BACKDROP_FAR.toFixed(3)},
          smoothstep(${BACKDROP_FALLOFF[0].toFixed(1)}, ${BACKDROP_FALLOFF[1].toFixed(1)}, length(vRoomXY)));
#include <opaque_fragment>`);
    };
    // Backdrop only: never participate in aiming or room occlusion queries.
    sky.raycast = () => {};
    group.add(sky);

    // The photographic floor cannot receive shadow maps. Overlay the static
    // silhouettes here while the existing scene lights handle dynamic shadows.
    tableShadows();
    if (shadow.status === 'fulfilled' && shadow.value) {
      shadow.value.anisotropy = 8;
      // Atlas bounds in meters: [-1.8, .8] to [4, 3.7]; see shadows.py.
      const floorShadow = mesh(new THREE.PlaneGeometry(5.8 / .026, 2.9 / .026), new THREE.MeshBasicMaterial({ map: shadow.value, transparent: true, opacity: .75, depthWrite: false, toneMapped: false }), 1.1 / .026, 2.25 / .026, floorZ + .025);
      floorShadow.name = 'furniture-floor-shadow'; floorShadow.renderOrder = -1;
      floorShadow.raycast = () => {};
    } else {
      // A failed cosmetic download must not keep the room from loading.
      const contactMap = radialShadow();
      for (const [x, y, w, h] of [[.35, 2.15, 2, .9], [-.95, 2.15, .8, .8], [2.7, 1.75, .85, .85]]) {
        mesh(new THREE.PlaneGeometry(w / .026, h / .026), new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, opacity: .225, depthWrite: false }), x / .026, y / .026, floorZ + .03);
      }
    }

    const furniture = model.value;
    furniture.rotation.x = Math.PI / 2; furniture.scale.setScalar(1 / 0.026); furniture.position.z = floorZ;
    furniture.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = true; object.receiveShadow = true;
      // Keep fine grain and weave legible at the normal oblique play angle.
      for (const material of [object.material].flat()) {
        for (const value of Object.values(material)) if (value?.isTexture) value.anisotropy = 8;
      }
    });
    group.add(furniture);
    // Broad room fill matches the window/sconce illumination baked into the art.
    // It has no sharp shadow: the overhead fixture still defines ball shadows.
    const fill = new THREE.DirectionalLight(theme.id === 'corner' ? '#ffdaad' : theme.lamp, ROOM_LIGHT * (theme.fill ?? (theme.id === 'desert' ? 1.6 : 1.1)));
    fill.position.set(-100, -70, floorZ + 160); fill.target.position.set(0, 0, floorZ);
    group.add(fill, fill.target);

  });
  return room;
}
