import test from 'node:test';
import assert from 'node:assert/strict';
import { P, pocketCenters, cushionPolygons } from './poolphysics.js';

const inches = value => value * 26 / 25.4;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);

test('all six pocket mouths, shelves and facing angles match their physical specifications', () => {
  const polys = cushionPolygons();
  for (const pocket of pocketCenters()) {
    // The two closest cushion-nose endpoints define this pocket's mouth.
    const jaws = polys.flatMap(([b0, n0, n1, b1]) => [{ nose: n0, back: b0, along: n1 }, { nose: n1, back: b1, along: n0 }])
      .sort((a, b) => distance(a.nose, [pocket.x, pocket.y]) - distance(b.nose, [pocket.x, pocket.y])).slice(0, 2);
    const side = pocket.x === 0;
    near(inches(distance(jaws[0].nose, jaws[1].nose)), side ? 5 : 4.5, 'mouth');
    const midpoint = [(jaws[0].nose[0] + jaws[1].nose[0]) / 2, (jaws[0].nose[1] + jaws[1].nose[1]) / 2];
    near(inches(distance(midpoint, [pocket.x, pocket.y]) - P.POCKET_R), side ? .125 : 1, 'shelf');
    for (const { nose, back, along } of jaws) {
      const a = [back[0] - nose[0], back[1] - nose[1]], b = [along[0] - nose[0], along[1] - nose[1]];
      const angle = Math.acos((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))) * 180 / Math.PI;
      near(angle, side ? 104 : 142, 'facing angle');
    }
  }
});

test('gentle and firm centre-line shots drop into each revised pocket', async () => {
  const { default: RAPIER } = await import('@dimforge/rapier3d-compat');
  const { practiceTable, simulateShot } = await import('../src/shot-simulation.js');
  const { newMatch } = await import('../src/eight-ball.js');
  await RAPIER.init();
  for (const [i, pocket] of pocketCenters().entries()) for (const speed of [20, 100]) {
    const dir = pocket.x === 0 ? { x: 0, y: Math.sign(pocket.y) }
      : { x: Math.sign(pocket.x) / Math.SQRT2, y: Math.sign(pocket.y) / Math.SQRT2 };
    const table = practiceTable([{ number: 0, x: pocket.x - 12 * dir.x, y: pocket.y - 12 * dir.y }]);
    const result = simulateShot(table, { ...newMatch(), breaking: false }, { dir, speed, spin: { x: 0, y: 0 } });
    assert.equal(result.settled, true);
    assert.deepEqual(result.report.pocketed, [{ number: 0, pocket: i }], `pocket ${i}, speed ${speed}`);
    assert.deepEqual(result.report.offTable, []);
  }
});
