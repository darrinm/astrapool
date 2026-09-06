import RAPIER from '@dimforge/rapier3d-compat';
import { hardComputerShot } from './hard-computer.js';
const ready = RAPIER.init();
self.onmessage = async ({ data }) => {
  try {
    await ready;
    self.postMessage({ shot: hardComputerShot(data.balls, data.state, data.table) });
  } catch (error) { self.postMessage({ error: error.message }); }
};
