import test from 'node:test';
import assert from 'node:assert/strict';
import { AimWorkerRunner } from './aim-worker-runner.js';

test('changing aim cancels obsolete physics after a batch and runs only the newest shot', async () => {
  const published = [], started = [], freed = []; let resume, clock = 0;
  const runner = new AimWorkerRunner(function* ({ id, table }) {
    started.push({ id, table });
    try { for (let i = 0; i < 3; i++) yield; return { paths: [id] }; }
    finally { freed.push(id); }
  }, data => published.push(data), { now: () => (clock += 7), pause: () => new Promise(resolve => { resume = resolve; }) });
  const table = { snapshot: 1 };
  runner.request({ id: 1, table });
  runner.request({ id: 2 }); runner.request({ id: 3 });
  for (let i = 0; i < 10 && runner.running; i++) { resume(); await Promise.resolve(); }
  assert.deepEqual(started, [{ id: 1, table }, { id: 3, table }]);
  assert.deepEqual(freed, [1, 3]);
  assert.deepEqual(published, [{ id: 3, paths: [3] }]);
});
test('cancelling a gesture frees its simulation without publishing a stopping circle', async () => {
  let resume, freed = false, clock = 0;
  const published = [];
  const runner = new AimWorkerRunner(function* () { try { yield; return {}; } finally { freed = true; } },
    data => published.push(data), { now: () => (clock += 7), pause: () => new Promise(resolve => { resume = resolve; }) });
  runner.request({ id: 1, table: {} }); runner.cancel(); resume(); await Promise.resolve();
  assert.equal(freed, true); assert.deepEqual(published, []); assert.equal(runner.running, false);
});
