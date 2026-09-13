import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry, Frustum, Line, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { setGuideLine } from './table-view.js';

for (const [width, height] of [[390, 844], [844, 390]]) {
  test(`aim and deflection lines stay visible after moving across the table at ${width} × ${height}`, () => {
    const camera = new PerspectiveCamera(48, width / height, 0.1, 200);
    const frustum = new Frustum();
    const lines = [20, 12, 7].map(length => ({
      length, line: new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3()])),
    }));
    // Reuse the same geometry across shots, as the game does. The camera follows the
    // current cue position while the previous shot's bounds fall outside the view.
    for (const x of [-35, 35, -35]) {
      camera.position.set(x, -8, 20);
      camera.lookAt(x, 0, 0); camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const { line, length } of lines) {
        setGuideLine(line, new Vector3(x, 0, 0), new Vector3(x, length, 0));
        assert.ok(frustum.intersectsObject(line), 'the renderer must retain the visible guide segment');
      }
    }
    for (const { line } of lines) { line.geometry.dispose(); line.material.dispose(); }
  });
}

test('a short initial guide can expand into view while its starting point stays offscreen', () => {
  const camera = new PerspectiveCamera(48, 390 / 844, 0.1, 200);
  camera.position.set(0, 0, 30); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const line = new Line(new BufferGeometry());
  setGuideLine(line, new Vector3(-35, 0, 0), new Vector3(-34, 0, 0));
  assert.equal(frustum.intersectsObject(line), false);
  setGuideLine(line, new Vector3(-35, 0, 0), new Vector3(10, 0, 0));
  assert.ok(frustum.intersectsObject(line));
  line.geometry.dispose(); line.material.dispose();
});
