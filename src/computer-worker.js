import RAPIER from '@dimforge/rapier3d-compat';
import { hardComputerShot, gravityComputerShot } from './hard-computer.js';
import { trickyComputerShot } from './tricky-computer.js';
import { simulateShotSteps } from './shot-simulation.js';
import { AimWorkerRunner } from './aim-worker-runner.js';
import { newMatch } from './eight-ball.js';
const ready = RAPIER.init();
const aimRunner = new AimWorkerRunner(function* ({ table, shot }) {
  const result = yield* simulateShotSteps(table, newMatch(), shot, true, { aimPreview: true, yieldEvery: 64, maxCueBounces: shot.lookAhead ?? Infinity });
  return { paths: result.paths, settled: result.settled };
}, result => self.postMessage(result));
self.onmessage = async ({ data }) => {
  try {
    await ready;
    if (data.cancelAim) { aimRunner.cancel(); return; }
    if (data.aimPreview) { aimRunner.request(data); return; }
    const preview = data.previews ? preview => self.postMessage({ preview }) : undefined;
    const shot = data.difficulty === 'tricky'
      ? trickyComputerShot(data.balls, data.state, data.table, preview, data.arcade, { solo: data.solo })
      : data.table.blackHoleGravity && ['easy', 'medium'].includes(data.difficulty)
        ? gravityComputerShot(data.balls, data.state, data.table, data.difficulty, preview)
        : hardComputerShot(data.balls, data.state, data.table, preview, { solo: data.solo });
    self.postMessage({ shot });
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
