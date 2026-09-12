import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_SETS, PLANETS, WORLDS, SUN, ballSetById, readBallSet, nextBallSet, planetForBall } from './ball-sets.js';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cloneReplayMesh } from './replay-view.js';
import { createPlanetSet, updatePlanetOrbits, updatePlanetCaps } from './planet-balls.js';

test('saved collections tolerate old/invalid values and unavailable storage; B visits every set', () => {
  assert.equal(readBallSet({ getItem: () => 'heads' }), 'heads');
  assert.equal(readBallSet({ getItem: () => 'planets' }), 'planets');
  assert.equal(readBallSet({ getItem() { throw Error('denied'); } }), 'balls');
  assert.equal(ballSetById('removed-set').id, 'balls');
  let id = 'balls'; const visited = new Set();
  for (let i = 0; i < BALL_SETS.length; i++) { visited.add(id); id = nextBallSet(id); }
  assert.equal(visited.size, BALL_SETS.length); assert.equal(id, 'balls');
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

test('a failed collection download releases successful maps, including late arrivals', async () => {
  const disposed = [], loaded = [];
  const result = createPlanetSet(async url => {
    if (url.includes('mars')) throw new Error('offline');
    await new Promise(resolve => setTimeout(resolve, url.includes('saturn') ? 10 : 0));
    loaded.push(url); return { dispose() { disposed.push(url); } };
  });
  await assert.rejects(result, /offline/);
  assert.equal(loaded.length, 24); assert.deepEqual(new Set(disposed), new Set(loaded));
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
