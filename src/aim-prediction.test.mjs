import test from 'node:test';
import assert from 'node:assert/strict';
import { AimPrediction } from './aim-prediction.js';
function fixture() {
  const messages = [], workers = []; let snapshots = 0;
  const prediction = new AimPrediction(() => {
    const worker = { postMessage: m => messages.push(m), terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  }, () => ({ snapshot: ++snapshots }));
  return { prediction, messages, workers };
}
test('warm worker starts before aiming and latest aim is sent immediately without copying the table again', () => {
  const { prediction: p, messages, workers } = fixture();
  p.warm(); p.warm(); assert.equal(workers.length, 1); assert.equal(messages.length, 0);
  p.update({ speed: 10 }); p.update({ speed: 15 }); p.update({ speed: 20 });
  assert.equal(messages.length, 3);
  assert.equal(messages[0].table.snapshot, 1);
  assert.equal(messages[1].table, undefined);
  assert.equal(messages[2].table, undefined);
  workers[0].onmessage({ data: { id: messages[0].id, paths: ['old'] } });
  assert.equal(p.result, null);
  const data = { id: messages[2].id, paths: ['new'] };
  workers[0].onmessage({ data });
  assert.deepEqual(p.update({ speed: 20 }), data);
  assert.equal(messages.length, 3);
});
test('cancel invalidates old results and a new gesture sends a fresh table', () => {
  const { prediction: p, messages, workers } = fixture();
  p.update({ speed: 10 }); p.clear(); p.update({ speed: 10 });
  assert.equal(messages[1].cancelAim, true);
  workers[0].onmessage({ data: { id: messages[0].id, paths: ['cancelled'] } });
  assert.equal(p.result, null);
  assert.equal(messages[2].table.snapshot, 2);
  workers[0].onmessage({ data: { id: messages[2].id, paths: ['current'] } });
  assert.deepEqual(p.result.paths, ['current']);
  p.dispose(); assert.ok(workers[0].terminated);
});
test('worker errors and disposed worker messages cannot display a false endpoint', () => {
  const { prediction: p, messages, workers } = fixture();
  p.update({ speed: 10 }); workers[0].onerror();
  assert.equal(p.update({ speed: 20 }), null);
  assert.ok(workers[0].terminated);
  p.clear(); p.update({ speed: 20 });
  workers[0].onmessage({ data: { id: messages.at(-1).id, paths: ['late'] } });
  assert.equal(p.result, null);
  workers[1].onmessage({ data: { id: messages.at(-1).id, paths: ['valid'] } });
  assert.deepEqual(p.result.paths, ['valid']);
});
