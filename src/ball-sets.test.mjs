import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_SETS, PLANETS, WORLDS, SUN, ballSetById, readBallSet, nextBallSet, planetForBall } from './ball-sets.js';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cloneReplayMesh } from './replay-view.js';
import { createPlanetSet, updatePlanetOrbits, updatePlanetCaps } from './planet-balls.js';

test('saved collections tolerate old/invalid values and unavailable storage; B visits every set', () => {
  assert.equal(readBallSet({ getItem: () => 'heads' }), 'balls');
  assert.equal(readBallSet({ getItem: () => 'planets' }), 'planets');
  assert.equal(readBallSet({ getItem() { throw Error('denied'); } }), 'balls');
  assert.equal(ballSetById('removed-set').id, 'balls');
  let id = 'balls'; const visited = new Set();
  for (let i = 0; i < BALL_SETS.length; i++) { visited.add(id); id = nextBallSet(id); }
  assert.equal(visited.size, BALL_SETS.length); assert.equal(id, 'balls');
});

test('catalog, saved selection, and cycling follow the available head textures', async () => {
  const source = readFileSync(new URL('./ball-sets.js', import.meta.url), 'utf8');
  for (const ids of [[], ['p01', 'p02']]) {
    const module = await import(`data:text/javascript;base64,${Buffer.from(
      `const __POOL_HEAD_TEXTURE_IDS__ = ${JSON.stringify(ids)};\n${source}`
    ).toString('base64')}`);
    assert.deepEqual(module.BALL_SETS.map(set => set.id), ids.length ? ['balls', 'planets', 'heads'] : ['balls', 'planets']);
    assert.equal(module.readBallSet({ getItem: () => 'heads' }), ids.length ? 'heads' : 'balls');
    assert.equal(module.nextBallSet('planets'), ids.length ? 'heads' : 'balls');
  }
});

test('all 15 object balls are distinct worlds and the cue is the Sun', () => {
  assert.equal(planetForBall(0), SUN);
  assert.equal(planetForBall(-1), null); assert.equal(planetForBall(16), null);
  assert.equal(planetForBall(8).id, 'black-hole');
  assert.equal(planetForBall(9).id, 'neptune'); assert.equal(planetForBall(15).id, 'pluto');
  assert.equal(new Set(Array.from({ length: 15 }, (_, n) => planetForBall(n + 1).id)).size, 15);
  assert.equal(WORLDS.length, 15);
  assert.deepEqual(PLANETS.filter(p => p.rings).map(p => p.id), ['jupiter', 'saturn', 'uranus', 'neptune']);
  assert.deepEqual(PLANETS.filter(p => !p.moons.length).map(p => p.id), ['mercury', 'venus']);
});

// These lifecycle checks use real Three.js materials/textures; only canvas
// painting is stubbed because Node has no browser canvas.
function mockCanvas(t) {
  const previous = globalThis.document;
  t.after(() => { globalThis.document = previous; });
  globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, {
    get: (_, key) => key === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }) : () => {},
  }) }) };
}
function deferredMaps(t) {
  mockCanvas(t);
  const pending = new Map(), downloaded = [];
  const set = createPlanetSet(url => new Promise((resolve, reject) => pending.set(url, { resolve, reject })));
  t.after(() => set.dispose());
  function arrive(url, width = 512) {
    const texture = new THREE.Texture({ width, height: width / 2 });
    let disposed = false; texture.addEventListener('dispose', () => { disposed = true; });
    downloaded.push(() => disposed);
    pending.get(url).resolve(texture); pending.delete(url);
    return texture.image;
  }
  return { set, pending, arrive, downloaded };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('planets render before downloads and upgrade shared live/replay textures independently', async t => {
  const { set, pending, arrive, downloaded } = deferredMaps(t);
  const earth = new THREE.Mesh(), pluto = new THREE.Mesh(), sun = new THREE.Mesh(), saturn = new THREE.Mesh();
  set.attach(earth, 3); set.attach(pluto, 15); set.attach(sun, 0); set.attach(saturn, 6);
  const clone = cloneReplayMesh(earth), map = earth.material.map;
  const ring = saturn.getObjectByName('saturn-rings').material.map, ringVersion = ring.version;
  assert.equal(map.image.width, 1);
  assert.equal(pending.size, 17);
  assert.ok([...pending.keys()].every(url => url.includes('/preview/')));
  assert.ok(!pending.has('/planets/preview/charon.webp'), 'companions wait for the rack');
  let allocationsReleased = 0; map.addEventListener('dispose', () => allocationsReleased++);
  earth.position.set(1, 2, 3); earth.rotation.set(.2, .3, .4);
  const rotation = earth.quaternion.clone(), decoration = earth.children[0];
  const preview = arrive('/planets/preview/earth.webp');
  await tick();
  assert.equal(map.image, preview);
  assert.equal(clone.material.map, map);
  assert.equal(earth.children[0], decoration);
  assert.deepEqual(earth.position.toArray(), [1, 2, 3]);
  assert.ok(earth.quaternion.equals(rotation));
  assert.equal(pluto.material.map.image.width, 1, 'an unfinished map does not hold up Earth');
  for (const url of [...pending.keys()]) arrive(url);
  await tick();
  assert.equal(pending.size, 8);
  assert.ok(ring.version > ringVersion, 'Saturn density map refreshes');
  for (const url of [...pending.keys()]) arrive(url);
  await set.ready;
  assert.equal(pluto.material.map.offset.x, .5);
  assert.equal(sun.material.map.wrapS, THREE.RepeatWrapping);
  assert.equal(earth.getObjectByName('planet-clouds').material.alphaMap.colorSpace, THREE.NoColorSpace);
  const details = set.loadDetails(); assert.equal(details, set.loadDetails());
  await tick();
  assert.equal(pending.size, 2, 'detail downloads are bounded');
  for (let i = 0; i < 20 && pending.size; i++) {
    for (const url of [...pending.keys()]) arrive(url, 2048);
    await tick();
    assert.ok(pending.size <= 2);
  }
  await details;
  assert.equal(map.image.width, 2048);
  assert.equal(allocationsReleased, 2, 'each resolution change releases immutable GPU storage');
  assert.equal(clone.material.map, map);
  assert.ok(downloaded.every(isDisposed => isDisposed()), 'temporary loader textures are released');
});

test('missing previews keep a fallback and can recover with a detailed map', async t => {
  const { set, pending, arrive } = deferredMaps(t);
  const mars = new THREE.Mesh(); set.attach(mars, 4);
  pending.get('/planets/preview/mars.webp').reject(new Error('offline'));
  pending.delete('/planets/preview/mars.webp');
  for (const url of [...pending.keys()]) arrive(url);
  await tick();
  for (const url of [...pending.keys()]) arrive(url);
  await set.ready;
  assert.equal(mars.material.map.image.width, 1);
  const details = set.loadDetails(); await tick();
  while (pending.size) {
    for (const url of [...pending.keys()]) arrive(url, 2048);
    await tick();
  }
  await details;
  assert.equal(mars.material.map.image.width, 2048);
});

test('disposing a collection releases late downloads and stops queued work', async t => {
  const { set, pending, arrive, downloaded } = deferredMaps(t);
  const earth = new THREE.Mesh(); set.attach(earth, 3);
  const map = earth.material.map, version = map.version;
  set.dispose(); set.dispose();
  assert.equal(earth.children.length, 0);
  for (const url of [...pending.keys()]) arrive(url);
  await set.ready; await set.loadDetails();
  assert.equal(pending.size, 0);
  assert.equal(map.version, version, 'late arrivals do not resurrect disposed textures');
  assert.ok(downloaded.every(isDisposed => isDisposed()));
});

test('moon orbits preserve their local plane through planet transforms and replay cloning', () => {
  const mesh = new THREE.Group(), system = new THREE.Group(), moon = new THREE.Group(), ring = new THREE.Group();
  system.name = 'planet-system'; mesh.add(system); system.add(moon, ring);
  moon.userData.planetOrbit = { phase: 0, radius: 3, height: .4, speed: Math.PI / 6 };
  mesh.position.set(10, 20, 30); mesh.scale.setScalar(2); mesh.rotation.set(.7, 1.2, -.3);
  updatePlanetOrbits([{ mesh }], 0);
  const initial = moon.position.clone();
  updatePlanetOrbits([{ mesh }], 3);
  assert.ok(moon.position.distanceTo(new THREE.Vector3(0, .4, 3)) < 1e-12);
  assert.ok(moon.getWorldPosition(new THREE.Vector3()).distanceTo(mesh.localToWorld(new THREE.Vector3(0, .4, 3))) < 1e-12);
  assert.deepEqual(ring.position.toArray(), [0, 0, 0]);
  const clone = mesh.clone(true), before = moon.position.clone();
  updatePlanetOrbits([{ mesh: clone }], 0);
  assert.ok(clone.getObjectByName('planet-system').children[0].position.distanceTo(initial) < 1e-12);
  assert.deepEqual(moon.position.toArray(), before.toArray());
  updatePlanetOrbits([{ mesh }], 3); // A paused replay clock leaves positions unchanged.
  assert.deepEqual(moon.position.toArray(), before.toArray());
  updatePlanetOrbits([{ mesh }], 12);
  assert.ok(moon.position.distanceTo(initial) < 1e-12);
});

test('aiming caps stay on world top without rotating planets or their systems', () => {
  const parent = new THREE.Group(), mesh = new THREE.Group(), root = new THREE.Group();
  const cap = new THREE.Group(), system = new THREE.Group(); cap.name = 'planet-cap';
  parent.add(mesh); mesh.add(root); root.add(cap, system);
  parent.rotation.set(.4, -.8, .3); root.rotation.set(-.1, .2, .5);
  for (const angles of [[0, 0, 0], [Math.PI, 0, 0], [.8, 1.4, -2.3]]) {
    mesh.rotation.set(...angles);
    const original = mesh.quaternion.clone(), systemOriginal = system.quaternion.clone();
    updatePlanetCaps([{ mesh }], true);
    const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(cap.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(normal.distanceTo(new THREE.Vector3(0, 0, 1)) < 1e-12);
    assert.ok(cap.visible);
    assert.deepEqual(mesh.quaternion.toArray(), original.toArray());
    assert.deepEqual(system.quaternion.toArray(), systemOriginal.toArray());
  }
  updatePlanetCaps([{ mesh }], false);
  assert.equal(cap.visible, false);
  const clone = mesh.clone(true);
  updatePlanetCaps([{ mesh: clone }], false);
  assert.equal(clone.getObjectByName('planet-cap').visible, false);
});

test('every world and companion has a shipped map matching its source manifest', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/planets/credits.json', import.meta.url)));
  const names = new Set([SUN, ...WORLDS].flatMap(world => [world.id, ...world.moons.map(([name]) => name.toLowerCase())]));
  names.delete('black-hole');
  for (const name of names) {
    const asset = manifest.assets.find(asset => asset.file === `${name}.jpg`);
    assert.ok(asset, `${name} needs a credited map`);
    const data = readFileSync(new URL(`../public/planets/${asset.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), asset.sha256, name);
  }
});

test('replay clones share ring shadow materials without owning or changing them', () => {
  const ball = new THREE.Mesh(), system = new THREE.Group(), ring = new THREE.Mesh();
  ball.add(system); system.add(ring);
  ring.customDepthMaterial = new THREE.MeshDepthMaterial({ alphaTest: .3 });
  ring.customDistanceMaterial = new THREE.MeshDistanceMaterial({ alphaTest: .3 });
  const clone = cloneReplayMesh(ball), replayRing = clone.children[0].children[0];
  assert.notEqual(replayRing, ring);
  assert.equal(replayRing.material, ring.material);
  assert.equal(replayRing.customDepthMaterial, ring.customDepthMaterial);
  assert.equal(replayRing.customDistanceMaterial, ring.customDistanceMaterial);
  assert.equal(ring.parent, system);
});
