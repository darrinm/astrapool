import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { projectPocketTargets, pocketAtPointer, completesPocketTap } from './pocket-call.js';

const pockets = [{ x: -40, y: 20 }, { x: 0, y: 20 }, { x: 40, y: 20 }, { x: -40, y: -20 }, { x: 0, y: -20 }, { x: 40, y: -20 }];
for (const [width, height, position] of [[1280, 800, [0, -100, 130]], [390, 844, [-180, 0, 230]], [844, 390, [90, 0, 150]]]) {
  test(`pocket targets follow the actual camera projection at ${width}×${height}`, () => {
    const camera = new PerspectiveCamera(48, width / height, 0.1, 800);
    camera.up.set(0, 0, 1); camera.position.set(...position); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const targets = projectPocketTargets(pockets, camera, width, height, 0, 2);
    assert.equal(new Set(targets.map(p => p.name)).size, 6);
    for (const [i, target] of targets.entries()) {
      const projected = new Vector3(pockets[i].x, pockets[i].y, 0).project(camera);
      assert.ok(target.visible); assert.ok(target.radius >= 22);
      assert.equal(target.x, (projected.x + 1) * width / 2);
      assert.equal(target.y, (1 - projected.y) * height / 2);
      assert.equal(pocketAtPointer(targets, { clientX: target.x, clientY: target.y }), i);
    }
    camera.lookAt(...position.map((n, i) => n + (i === 2 ? 10 : 0))); camera.updateMatrixWorld();
    assert.equal(projectPocketTargets(pockets, camera, width, height, 0, 2).some(t => t.visible), false);
  });
}
test('overlapping target margins choose the nearest pocket and never an invisible target', () => {
  const targets = [{ pocket: 0, x: 0, y: 0, radius: 22, visible: true }, { pocket: 1, x: 30, y: 0, radius: 22, visible: true }];
  assert.equal(pocketAtPointer(targets, { clientX: 20, clientY: 0 }), 1);
  assert.equal(pocketAtPointer(targets, { clientX: 80, clientY: 0 }), null);
  assert.equal(pocketAtPointer([{ ...targets[0], visible: false }], { clientX: 0, clientY: 0 }), null);
});
test('only a tap released on the same pocket commits a call', () => {
  const start = { pocket: 2, x: 100, y: 100, moved: false };
  assert.equal(completesPocketTap(start, { clientX: 104, clientY: 105 }, 2), true);
  assert.equal(completesPocketTap(start, { clientX: 115, clientY: 100 }, 2), false);
  assert.equal(completesPocketTap({ ...start, moved: true }, { clientX: 100, clientY: 100 }, 2), false);
  assert.equal(completesPocketTap(start, { clientX: 100, clientY: 100 }, 1), false);
  assert.equal(completesPocketTap(start, { clientX: 100, clientY: 100 }, null), false);
});
