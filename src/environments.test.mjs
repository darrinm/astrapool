import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Scene, Vector3, Texture, Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { ENVIRONMENTS, buildEnvironment, environmentById, readEnvironment } from './environments.js';
import { RoomAmbience } from './ambient.js';

test('saved room choices accept known IDs and recover from stale or unavailable storage', () => {
  for (const { id } of ENVIRONMENTS) assert.equal(readEnvironment({ getItem: () => id }), id);
  assert.equal(readEnvironment({ getItem: () => 'old-room' }), 'minimal');
  assert.equal(readEnvironment({ getItem() { throw new Error('storage blocked'); } }), 'minimal');
  assert.equal(environmentById(null).id, 'minimal');
  assert.equal(readEnvironment({ getItem: () => null }), 'minimal');
  assert.equal(ENVIRONMENTS.length, 5);
});

test('shipped room models leave the table clear and release all their graphics resources', async () => {
  const original = globalThis.document;
  const paint = new Proxy({}, { get: (_, key) => ['createLinearGradient', 'createRadialGradient'].includes(key) ? () => ({ addColorStop() {} }) : () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => paint }) };
  try {
    const scene = new Scene();
    for (const theme of ENVIRONMENTS) {
      const room = buildEnvironment(theme, -30, {
        panorama: async () => new Texture(),
        furniture: async url => {
          const file = await readFile(new URL(`../public${url}`, import.meta.url));
          return (await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '')).scene;
        },
      });
      await room.ready; scene.add(room.group);
      const resources = new Set();
      room.group.traverse(mesh => { if (mesh.geometry) resources.add(mesh.geometry); if (mesh.material) resources.add(mesh.material); if (mesh.material?.map) resources.add(mesh.material.map); });
      assert.ok(resources.size > 0, 'the room must own graphics resources to exercise disposal');
      room.group.updateMatrixWorld(true);
      for (const x of [-44, 0, 44]) for (const y of [-24, 0, 24]) {
        const ray = new Raycaster(new Vector3(x, y, 200), new Vector3(0, 0, -1));
        const visibleHits = ray.intersectObject(room.group, true).filter(hit => hit.object.visible);
        assert.ok(visibleHits.every(hit => hit.point.z < 0), `${theme.id} scenery must leave the whole table clear`);
      }
      const released = new Set(); resources.forEach(resource => resource.addEventListener('dispose', () => released.add(resource)));
      room.dispose();
      assert.equal(scene.children.length, 0);
      assert.equal(released.size, resources.size, `${theme.id} should release all GPU resources`);
    }
  } finally { globalThis.document = original; }
});

test('each ambient room stops its sources and disconnects its graph when replaced', () => {
  for (const { id } of ENVIRONMENTS) {
    const nodes = [], sources = [];
    const node = () => {
      const result = { gain: {}, frequency: {}, Q: {}, connect() { return this; }, disconnect() { this.disconnected = true; }, start() { sources.push(this); }, stop() { this.stopped = true; } };
      nodes.push(result); return result;
    };
    const ctx = { sampleRate: 100, createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node, createBuffer: (_, size) => ({ getChannelData: () => new Float32Array(size) }) };
    const ambient = new RoomAmbience(ctx, {}, id);
    assert.equal(sources.length > 0, id !== 'minimal');
    if (id === 'minimal') assert.equal(nodes.length, 0, 'the original room has no ambient audio graph');
    ambient.dispose(); ambient.dispose();
    assert.ok(nodes.every(node => node.disconnected), id);
    assert.ok(sources.every(source => source.stopped), id);
  }
});

function delayedAssets() {
  const image = new Texture(), model = new Group();
  model.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  const resources = [image, model.children[0].geometry, model.children[0].material];
  const released = new Set();
  resources.forEach(resource => resource.addEventListener('dispose', () => released.add(resource)));
  let imageResolve, imageReject, modelResolve;
  const loaders = {
    panorama: () => new Promise((resolve, reject) => { imageResolve = resolve; imageReject = reject; }),
    furniture: () => new Promise(resolve => { modelResolve = resolve; }),
  };
  return { loaders, resources, released, finish() { imageResolve(image); modelResolve(model); }, fail() { imageReject(new Error('offline')); modelResolve(model); } };
}

test('cancelling a room before its downloads finish disposes late assets without mounting them', async () => {
  const pending = delayedAssets();
  const room = buildEnvironment(environmentById('desert'), -30, pending.loaders);
  room.dispose(); pending.finish(); await room.ready;
  assert.equal(room.group.children.length, 0);
  assert.equal(pending.released.size, pending.resources.length);
  room.dispose(); // disposal is idempotent
});

test('a failed room download releases its successfully downloaded companion model', async () => {
  const pending = delayedAssets();
  const room = buildEnvironment(environmentById('tokyo'), -30, pending.loaders);
  pending.fail(); await assert.rejects(room.ready, /offline/);
  assert.equal(pending.released.size, 2);
  assert.equal(room.group.children.length, 0);
});
