import * as THREE from 'three';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { carpetMap, radialShadow } from './textures.js';

export const ENVIRONMENTS = [
  { id: 'minimal', name: 'Minimal', time: 'ORIGINAL · DEFAULT', description: 'Green felt, dark walnut, a quiet room. Just you and the table.', sound: 'Table sounds only', sky: '#0a0a0d', hemi: 0.12, exposure: 0.9 },
  { id: 'corner', name: 'The Corner Pocket', time: '12:42 AM · AFTER HOURS', description: 'Oxblood leather, aged brass, and walnut under amber light. A private club after hours.', sound: 'Soft lounge chords', felt: '#702c40', wood: ['#42271a', '#64452e', '#785037', '#4b2d1e'], trim: '#20140d', floor: '#252022', sky: '#100f19', lamp: '#fff1d6', accent: '#e7bd7d', hemi: 0.42, exposure: 1.0 },
  { id: 'desert', name: 'Desert Modern', time: '5:18 PM · GOLDEN HOUR', description: 'Travertine, saddle leather, and mountains beyond the glass. The last light of the desert.', sound: 'Desert breeze', felt: '#688362', wood: ['#8d6541', '#b6905f', '#c6a474', '#a47f52'], trim: '#72543b', floor: '#bea58b', sky: '#eab584', lamp: '#fff7df', accent: '#f3c58e', hemi: 0.95, exposure: 1.0 },
  { id: 'tokyo', name: 'Tokyo Rooftop', time: '11:06 PM · RAIN IN THE CITY', description: 'A sheltered terrace above the city. Silver rain, dark stone, and a thousand distant windows.', sound: 'Rain on the roof', felt: '#315b80', wood: ['#080e18', '#101827', '#172438', '#0a1020'], trim: '#0d1724', floor: '#152638', sky: '#091224', lamp: '#e9f5ff', accent: '#6de4ee', hemi: 0.48, exposure: 1.0 },
  { id: 'orbital', name: 'Orbital Lounge', time: '03:27 UTC · EARTHRISE', description: 'Satin titanium and quiet ivory. A front-row seat to Earth, suspended in the dark.', sound: 'Observatory hum', felt: '#367c7f', wood: ['#4c626c', '#71858b', '#88999d', '#5a7079'], trim: '#253e4c', floor: '#172c3a', sky: '#030916', lamp: '#e5f7ff', accent: '#93e3f0', hemi: 0.65, exposure: 1.0 },
  { id: 'alpine', name: 'Alpine Lodge', time: '6:04 PM · WINTER DUSK', description: 'Snow beyond the glass, oak underfoot, and the warmth of a mountain lodge.', sound: 'Soft fireside hush', felt: '#576879', wood: ['#39281e', '#5a4130', '#76563d', '#463224'], trim: '#30251f', floor: '#504034', sky: '#182332', lamp: '#ffe2b8', accent: '#e8c69e', hemi: 0.58, exposure: 1.0 },
  { id: 'glasshouse', name: 'The Glasshouse', time: '8:16 AM · FIRST LIGHT', description: 'An iron-and-glass conservatory, lush palms, and sunlight through the leaves.', sound: 'Leaves in the breeze', felt: '#416e59', wood: ['#766044', '#a38a61', '#baa37b', '#8b744f'], trim: '#42594b', floor: '#b6b49d', sky: '#899c8b', lamp: '#fff4d8', accent: '#b9d4a3', hemi: 0.9, exposure: 1.0, fill: 1.5 },
  { id: 'coast', name: 'Amalfi Terrace', time: '4:32 PM · SEA BREEZE', description: 'Cream arches, weathered terracotta, and the Mediterranean stretching to the horizon.', sound: 'Distant surf', felt: '#397d8c', wood: ['#9a7248', '#bd9765', '#d0ad7d', '#aa8354'], trim: '#826345', floor: '#ae795a', sky: '#92b8c6', lamp: '#fff1d4', accent: '#a6dce3', hemi: 0.95, exposure: 1.0, fill: 1.6 },
  { id: 'riad', name: 'Atlas Courtyard', time: '7:48 PM · LANTERN HOUR', description: 'Rose plaster, emerald tile, and amber lanterns beneath carved cedar.', sound: 'Courtyard fountain', felt: '#325e53', wood: ['#4c2b1c', '#72432a', '#945f3a', '#5d3521'], trim: '#503520', floor: '#a88c69', sky: '#1d2546', lamp: '#ffdfae', accent: '#edbd77', hemi: 0.6, exposure: 1.0 },
];
export const environmentById = id => ENVIRONMENTS.find(environment => environment.id === id) || ENVIRONMENTS[0];
export function readEnvironment(storage) {
  try { return environmentById(storage.getItem('pool.environment')).id; } catch { return ENVIRONMENTS[0].id; }
}

// Every room owns its downloads and GPU resources. The caller keeps the current
// room visible until ready, then swaps atomically; stale requests can be disposed.
const assets = {
  panorama: url => new THREE.TextureLoader().loadAsync(url),
  furniture: async url => {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    return (await new GLTFLoader().loadAsync(url)).scene;
  },
};

export function buildEnvironment(theme, floorZ, loaders = assets) {
  const group = new THREE.Group(); group.name = `environment-${theme.id}`;
  const materials = new Set(), geometries = new Set(), maps = new Set();
  let disposed = false;
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
  ]).then(([image, model]) => {
    if (image.status === 'fulfilled') maps.add(image.value);
    if (model.status === 'fulfilled') own(model.value);
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
    // Backdrop only: never participate in aiming or room occlusion queries.
    sky.raycast = () => {};
    group.add(sky);

    const contact = mesh(new THREE.PlaneGeometry(118, 74), new THREE.MeshBasicMaterial({ map: radialShadow(), transparent: true, opacity: 0.4, depthWrite: false }), 0, 0, floorZ + 0.02);
    contact.renderOrder = -1;

    const furniture = model.value;
    furniture.rotation.x = Math.PI / 2; furniture.scale.setScalar(1 / 0.026); furniture.position.z = floorZ;
    furniture.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    group.add(furniture);
    // Broad room fill matches the window/sconce illumination baked into the art.
    // It has no sharp shadow: the overhead fixture still defines ball shadows.
    const fill = new THREE.DirectionalLight(theme.id === 'corner' ? '#ffdaad' : theme.lamp, theme.fill ?? (theme.id === 'desert' ? 1.6 : 1.1));
    fill.position.set(-100, -70, floorZ + 160); fill.target.position.set(0, 0, floorZ);
    group.add(fill, fill.target);
    // Contact under the Blender bench, pedestal and planter; these remain cheap
    // and stable when the shadow-casting table light does not reach the room edges.
    for (const [x, y, w, h] of [[.35, 2.15, 2, .9], [-.95, 2.15, .8, .8], [2.7, 1.75, .85, .85], ...[-.936, .936].flatMap(x => [-.481, .481].map(y => [x, y, .24, .24]))]) {
      mesh(new THREE.PlaneGeometry(w / .026, h / .026), new THREE.MeshBasicMaterial({ map: contact.material.map, transparent: true, opacity: .3, depthWrite: false }), x / .026, y / .026, floorZ + .03);
    }
  });
  return room;
}
