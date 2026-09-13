import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Raycaster, Scene, Vector3, Texture, Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { ENVIRONMENTS, buildEnvironment, environmentById, readEnvironment } from './environments.js';

test('saved room choices accept known IDs and recover from stale or unavailable storage', () => {
  for (const { id } of ENVIRONMENTS) assert.equal(readEnvironment({ getItem: () => id }), id);
  assert.equal(readEnvironment({ getItem: () => 'old-room' }), 'orbital');
  assert.equal(readEnvironment({ getItem() { throw new Error('storage blocked'); } }), 'orbital');
  assert.equal(environmentById(null).id, 'orbital');
  assert.equal(readEnvironment({ getItem: () => null }), 'orbital');
  assert.equal(ENVIRONMENTS.length, 9);
});

test('shipped room models leave the table clear and release all their graphics resources', async () => {
  const original = globalThis.document, originalSelf = globalThis.self;
  globalThis.self = globalThis;
  const paint = new Proxy({}, { get: (_, key) => ['createLinearGradient', 'createRadialGradient'].includes(key) ? () => ({ addColorStop() {} }) : () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => paint }) };
  try {
    const scene = new Scene();
    for (const theme of ENVIRONMENTS) {
      const room = buildEnvironment(theme, -30, {
        panorama: async () => new Texture(),
        shadow: async url => {
          const png = await readFile(new URL(`../public${url}`, import.meta.url));
          assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
          const mobile = url.includes('-mobile');
          assert.equal(png.readUInt32BE(16), mobile ? 1024 : 2048);
          assert.equal(png.readUInt32BE(20), mobile ? 512 : 1024);
          return new Texture();
        },
        furniture: async url => {
          const file = await readFile(new URL(`../public${url}`, import.meta.url));
          const loader = new GLTFLoader().register(parser => {
            // Node has no image decoder. Validate each embedded PNG at the decoding
            // boundary; keep GLTFLoader's material, sampler, UV and buffer parsing.
            parser.textureLoader = { load(url, onLoad, _, onError) {
              fetch(url).then(response => response.arrayBuffer()).then(buffer => {
                const png = Buffer.from(buffer);
                assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
                const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
                assert.equal(width, 512); assert.equal(height, 512);
                onLoad(new Texture({ width, height }));
              }).catch(onError);
            } };
            return { name: 'node-png-decoder' };
          });
          const gltf = await loader.parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
          let surfaces = 0;
          gltf.scene.traverse(mesh => {
            if (!mesh.material?.userData.surface) return;
            surfaces++;
            const mat = mesh.material;
            assert.ok(mat.map && mat.normalMap && mat.roughnessMap && mat.metalnessMap, `${theme.id}: ${mat.name} must retain its PBR maps`);
            const uv = mesh.geometry.getAttribute('uv');
            assert.ok(uv?.count > 0 && uv.array.every(Number.isFinite), `${theme.id}: ${mat.name} needs valid texture coordinates`);
          });
          assert.ok(surfaces > 0, `${theme.id} must contain textured surfaces`);
          return gltf.scene;
        },
      });
      await room.ready; scene.add(room.group);
      if (theme.id !== 'minimal') assert.ok(room.group.getObjectByName('furniture-floor-shadow'), `${theme.id} should use its baked furniture silhouette`);
      const resources = new Set();
      room.group.traverse(mesh => {
        if (mesh.geometry) resources.add(mesh.geometry);
        for (const mat of [mesh.material].flat().filter(Boolean)) {
          resources.add(mat);
          for (const value of Object.values(mat)) if (value?.isTexture) resources.add(value);
        }
      });
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
  } finally { globalThis.document = original; globalThis.self = originalSelf; }
});

function delayedAssets() {
  const image = new Texture(), shadow = new Texture(), model = new Group();
  model.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
  const resources = [image, model.children[0].geometry, model.children[0].material, shadow];
  const released = new Set();
  resources.forEach(resource => resource.addEventListener('dispose', () => released.add(resource)));
  let imageResolve, imageReject, modelResolve, shadowResolve, shadowReject;
  const loaders = {
    panorama: () => new Promise((resolve, reject) => { imageResolve = resolve; imageReject = reject; }),
    furniture: () => new Promise(resolve => { modelResolve = resolve; }),
    shadow: () => new Promise((resolve, reject) => { shadowResolve = resolve; shadowReject = reject; }),
  };
  return { loaders, resources, released, finish() { imageResolve(image); modelResolve(model); shadowResolve(shadow); }, fail() { imageReject(new Error('offline')); modelResolve(model); shadowResolve(shadow); }, failShadow() { imageResolve(image); modelResolve(model); shadowReject(new Error('offline')); } };
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
  assert.equal(pending.released.size, 3);
  assert.equal(room.group.children.length, 0);
});


test('a failed shadow download keeps the room usable with fallback contact patches', async () => {
  const original = globalThis.document;
  const paint = new Proxy({}, { get: (_, key) => key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
  globalThis.document = { createElement: () => ({ getContext: () => paint }) };
  try {
    const pending = delayedAssets();
    const room = buildEnvironment(environmentById('orbital'), -30, pending.loaders);
    pending.failShadow(); await room.ready;
    assert.ok(room.environmentMap);
    assert.ok(room.group.getObjectByName('table-floor-shadow'));
    assert.equal(room.group.getObjectByName('furniture-floor-shadow'), undefined);
    room.dispose();
    assert.equal(pending.released.size, 3);
  } finally { globalThis.document = original; }
});
