import RAPIER from "@dimforge/rapier3d-compat";
import { trickyComputerShot } from "/src/tricky-computer.js";
import { simulateShot } from "/src/shot-simulation.js";
import { newArcade } from "/src/arcade-score.js";
const ready = RAPIER.init();
self.onmessage = async ({ data }) => {
  try {
    await ready;
    const previews = [];
    const shot = trickyComputerShot(
      data.balls,
      data.state,
      data.table,
      (p) => {
        previews.push(p);
        self.postMessage({ progress: previews.length });
      },
      newArcade(),
      { maxMs: Infinity, maxSimulations: 180 },
    );
    const result = simulateShot(data.table, data.state, shot, true, {
      arcade: true,
    });
    self.postMessage({ shot, previews, result, balls: data.balls });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
