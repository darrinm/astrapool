import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRack, rackPose, RACK_HOLD, RACK_DURATION } from './rack-animation.js';
import { rackPositions, canPlace } from './table-state.js';
import { P } from '../physics/constants.js';

function random(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

test('racking preserves every ball already on the table and returns only missing balls', () => {
  const current = [{ number: 0, x: -15, y: 8, onTable: true }, { number: 8, x: 3, y: -5, onTable: true },
    { number: 1, x: 25, y: 18, onTable: false }];
  const plan = planRack(current, random(5));
  assert.equal(plan.length, 16);
  assert.deepEqual(plan.find(p => p.number === 0).from, { x: -15, y: 8 });
  assert.deepEqual(plan.find(p => p.number === 8).from, { x: 3, y: -5 });
  assert.equal(plan.filter(p => p.returned).length, 14);
  const starts = plan.map(p => ({ number: p.number, ...p.from }));
  for (const p of plan.filter(p => p.returned)) assert.ok(canPlace(p.from, starts, p.number));
  assert.equal(current[2].onTable, false, 'planning must not mutate the old table');
});

test('an empty table receives sixteen distinct clear random positions', () => {
  const first = planRack([], random(12)), second = planRack([], random(13));
  const starts = first.map(p => ({ number: p.number, ...p.from }));
  assert.equal(new Set(first.map(p => p.number)).size, 16);
  assert.ok(first.every(p => p.returned && canPlace(p.from, starts, p.number)));
  assert.notDeepEqual(first.map(p => p.from), second.map(p => p.from));
});

test('crowded samples fall back to clear positions without an unbounded retry loop', () => {
  let calls = 0;
  const plan = planRack([], () => { calls++; return 0.5; });
  const starts = plan.map(p => ({ number: p.number, ...p.from }));
  assert.ok(plan.every(p => canPlace(p.from, starts, p.number)));
  assert.ok(calls <= 16 * 97);
});

test('off-table and invalid positions do not become animation origins', () => {
  const plan = planRack([{ number: 0, x: 100, y: 0, onTable: true }, { number: 8, x: NaN, y: 0, onTable: true }], random(3));
  assert.ok(plan.every(p => p.returned));
});

test('all balls appear before gathering, then finish at the exact canonical rack', () => {
  const plan = planRack([], random(41));
  for (const p of plan) {
    for (const time of [0, RACK_HOLD]) {
      const pose = rackPose(p, time); assert.deepEqual({ x: pose.x, y: pose.y }, p.from); assert.equal(pose.progress, 0);
    }
    let previous = 0;
    for (let time = 0; time < RACK_DURATION; time += 0.02) {
      const pose = rackPose(p, time);
      assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y));
      assert.ok(Math.abs(pose.x) < P.HW && Math.abs(pose.y) < P.HH);
      assert.ok(pose.progress >= previous && pose.progress <= 1); previous = pose.progress;
    }
    const final = rackPose(p, RACK_DURATION + 1), target = rackPositions().find(b => b.number === p.number);
    assert.deepEqual({ x: final.x, y: final.y }, { x: target.x, y: target.y });
    assert.equal(final.progress, 1);
  }
});
