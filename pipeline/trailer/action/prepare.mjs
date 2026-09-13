// Generate a local capture-only module and pages from the current game.
// No production source files are changed or included in the site's build.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { endgameLayouts } from "../../../physics/computer-benchmark.js";
import { newMatch } from "../../../src/eight-ball.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = new URL("./", import.meta.url);
let source = await readFile(`${root}src/pool.js`, "utf8");
source = source.replace(
  /(from\s+['"])(\.\/|\.\.\/)([^'"]+)(['"])/g,
  (_, prefix, relative, path, quote) =>
    prefix + (relative === "./" ? "/src/" : "/") + path + quote,
);
source = source.replace(
  "new URL('./computer-worker.js', import.meta.url)",
  "new URL('/src/computer-worker.js', import.meta.url)",
);
source += `
export function captureSnapshot() {
  return {
    snapshot: world.takeSnapshot(), feltZ: FELT_Z,
    cushions: [...cushionHandles], blackHoleGravity: gravityActive(),
    handles: allBalls().filter(b => b.mesh.visible && b.body.isEnabled())
      .map(b => ({ number: numberOf(b), handle: b.body.handle })),
  };
}
export function capturePreparePlan(plan) { prepareComputerPlan(plan); }
`;
await writeFile(new URL("pool-capture.js", output), source);
const state = {
  ...newMatch(1),
  breaking: false,
  groups: ["stripes", "solids"],
  down: [4, 5, 6, 7, 12, 13, 14, 15],
};
await writeFile(
  new URL("searches.json", output),
  JSON.stringify(endgameLayouts(1234, 6).map((balls) => ({ balls, state }))),
);

const original = await readFile(`${root}index.html`, "utf8");
if (!original.includes("/src/startup.js"))
  throw new Error(
    "Game entry point changed; update the capture page generator.",
  );
const capture = original
  .replace("/src/startup.js", "/pipeline/trailer/action/capture.js")
  .replace(
    "</head>",
    `
<style>
body > *:not(canvas):not(#capture-panel):not(#mobile-capture) { display: none !important; }
body { background: #050b13 !important; }
canvas { width: 100vw !important; height: auto !important; position: static !important; display: block; }
#mobile-capture { position: fixed; left: -1000px; top: 0; width: 390px; height: 844px; border: 0; }
#capture-panel { position: fixed; z-index: 10000; bottom: 12px; left: 16px; background: #071321e8; color: white; padding: 12px 18px; border: 1px solid #567; font: 14px system-ui; border-radius: 10px; }
#capture-start { margin-right: 15px; padding: 8px 14px; }
</style></head>`,
  )
  .replace(
    '<script type="module"',
    `
<iframe id="mobile-capture" title="Mobile gameplay capture"></iframe>
<div id="capture-panel"><button id="capture-start" disabled>Render trailer footage</button><span id="capture-status">Loading capture scene…</span></div>
<script type="module"`,
  );
const mobile = original
  .replace("/src/startup.js", "/pipeline/trailer/action/engine.js")
  .replace(
    "</head>",
    `
<style>
body > #loading-screen, body > #welcome { display: none !important; }
body > canvas { position: fixed !important; inset: 0; }
#hud { display: grid !important; }
body { margin: 0; overflow: hidden; }
</style></head>`,
  );
await writeFile(new URL("capture.html", output), capture);
await writeFile(new URL("mobile.html", output), mobile);
console.log("Prepared capture pages, layout fixtures, and pool-capture.js");
