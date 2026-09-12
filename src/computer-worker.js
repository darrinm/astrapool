import RAPIER from '@dimforge/rapier3d-compat';
import { hardComputerShot } from './hard-computer.js';
import { trickyComputerShot } from './tricky-computer.js';
const ready = RAPIER.init();
self.onmessage = async ({ data }) => {
  try {
    await ready;
    const preview = data.previews ? preview => self.postMessage({ preview }) : undefined;
    const shot = data.difficulty === 'tricky'
      ? trickyComputerShot(data.balls, data.state, data.table, preview, data.arcade, { solo: data.solo })
      : hardComputerShot(data.balls, data.state, data.table, preview, { solo: data.solo });
    self.postMessage({ shot });
  } catch (error) { self.postMessage({ error: error.message }); }
};
