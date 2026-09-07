import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Scene, Vector3 } from 'three';
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

test('switching rooms releases every owned geometry, material, and texture', () => {
  const original = globalThis.document;
  const paint = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => paint }) };
  try {
    const scene = new Scene();
    for (const theme of ENVIRONMENTS) {
      const room = buildEnvironment(theme, -30); scene.add(room.group);
      const resources = new Set();
      room.group.traverse(mesh => { if (mesh.geometry) resources.add(mesh.geometry); if (mesh.material) resources.add(mesh.material); if (mesh.material?.map) resources.add(mesh.material.map); });
      assert.ok(resources.size > 0, 'the room must own graphics resources to exercise disposal');
      room.setCameraHeight(200); room.group.updateMatrixWorld(true);
      const ray = new Raycaster(new Vector3(0, 0, 200), new Vector3(0, 0, -1));
      const visibleHits = ray.intersectObject(room.group, true).filter(hit => hit.object.visible);
      assert.ok(visibleHits.every(hit => hit.point.z < 0), 'room scenery must not cover the table from overhead');
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
