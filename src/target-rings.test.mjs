import test from 'node:test';
import assert from 'node:assert/strict';
import { Object3D } from 'three';
import { newMatch } from './eight-ball.js';
import { TargetRings } from './target-rings.js';

function fixture(t) {
  const rings = new TargetRings({ radius: 1.1, feltZ: -1.65, numberOf: ball => ball.number });
  t.after(() => rings.dispose());
  const balls = Array.from({ length: 16 }, (_, number) => {
    const mesh = new Object3D(); mesh.position.set(number * 2, 3, -0.55);
    return { number, mesh, body: { isEnabled: () => true } };
  });
  const shown = () => rings.visible ? rings.children.flatMap((r, i) => r.visible ? [i + 1] : []) : [];
  return { rings, balls, shown };
}

test('aiming highlights the current player’s remaining group, then only the 8', t => {
  const { rings, balls, shown } = fixture(t);
  const match = { ...newMatch(), breaking: false, groups: ['solids', 'stripes'], down: [1, 9] };
  rings.update(balls, match, { aiming: true });
  assert.deepEqual(shown(), [2, 3, 4, 5, 6, 7]);
  rings.update(balls, { ...match, turn: 1 }, { aiming: true });
  assert.deepEqual(shown(), [10, 11, 12, 13, 14, 15]);
  rings.update(balls, { ...match, down: [1, 2, 3, 4, 5, 6, 7] }, { aiming: true });
  assert.deepEqual(shown(), [8]);
  rings.update(balls, match, { aiming: false });
  assert.deepEqual(shown(), [], 'release or cancellation hides every ring');
});

test('open table, break and Free Play use their own legal object balls', t => {
  const { rings, balls, shown } = fixture(t);
  rings.update(balls, { ...newMatch(), breaking: false }, { aiming: true });
  assert.deepEqual(shown(), [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]);
  rings.update(balls, newMatch(), { aiming: true });
  assert.deepEqual(shown(), Array.from({ length: 15 }, (_, i) => i + 1));
  const won = { ...newMatch(), winner: 0, groups: ['solids', 'stripes'] };
  rings.update(balls, won, { aiming: true });
  assert.deepEqual(shown(), []);
  rings.update(balls, won, { aiming: true, free: true });
  assert.equal(shown().length, 15, 'Free Play has no group or winner restriction');
});

test('rings follow live balls on the felt and exclude hidden, disabled and sunken balls', t => {
  const { rings, balls, shown } = fixture(t);
  balls[1].mesh.visible = false;
  balls[2].body.isEnabled = () => false;
  balls[3].mesh.position.z = -3;
  balls[4].mesh.position.set(-12, 8, -0.55);
  rings.update(balls, newMatch(), { aiming: true });
  assert.deepEqual(shown(), Array.from({ length: 12 }, (_, i) => i + 4));
  assert.equal(rings.children[3].position.x, -12);
  assert.equal(rings.children[3].position.y, 8);
  assert.ok(Math.abs(rings.children[3].position.z - (-1.65 + 0.04)) < 1e-10);
  balls[4].mesh.position.x = 20;
  rings.update(balls, newMatch(), { aiming: true });
  assert.equal(rings.children[3].position.x, 20);
  const hits = [];
  rings.children[3].raycast(null, hits);
  assert.deepEqual(hits, [], 'decorations cannot intercept aiming input');
});
