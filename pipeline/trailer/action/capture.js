import { film, retake } from "./engine.js";
import { rackPositions } from "/src/table-state.js";
const searches = await (await fetch("./searches.json")).json();
const status = document.getElementById("capture-status"),
  button = document.getElementById("capture-start");
const out = document.createElement("canvas");
out.width = 1920;
out.height = 1080;
const ctx = out.getContext("2d");
let frame = 0;
let manifest = { fps: 30, shots: [], sounds: [], cuts: [] };
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const smooth = (t) => t * t * (3 - 2 * t);
async function complete(manifest) {
  const response = await fetch("http://127.0.0.1:5174/complete", {
    method: "POST",
    body: JSON.stringify(manifest),
  });
  if (!response.ok) throw Error("Capture manifest could not be saved.");
}
async function save(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.95));
  const r = await fetch(
    `http://127.0.0.1:5174/frame/${String(frame).padStart(5, "0")}`,
    { method: "POST", body: blob },
  );
  if (!r.ok) throw Error("Could not save frame");
  frame++;
  if (frame % 30 === 0)
    status.textContent = `Action cut · ${frame} frames rendered`;
}
async function shot(
  name,
  duration,
  camera,
  { steps = 16, search, ui = false, engine = film, draw } = {},
) {
  manifest.cuts.push({ name, start: frame / 30, duration });
  for (let i = 0; i < duration * 30; i++) {
    const t = i / (duration * 30 - 1),
      pos = camera(t, i / 30);
    engine.pose(pos.from, pos.target, pos.fov || 48);
    const canvas = await engine.render({
      steps,
      at: frame / 30,
      search: search?.(t),
      ui,
    });
    if (draw) {
      await draw(canvas, t);
      await save(out);
    } else await save(canvas);
  }
}
const camera =
  (from, to, target, fov = 48) =>
  (t) => ({ from: lerp(from, to, smooth(t)), target, fov });
const follow =
  (n, offset, end, fov = 48) =>
  (t) => {
    const p = film.ball(n).mesh.position;
    return {
      from: [
        p.x + lerp(offset, end, t)[0],
        p.y + lerp(offset, end, t)[1],
        Math.max(0, p.z) + lerp(offset, end, t)[2],
      ],
      target: [p.x, p.y, Math.max(-1.65, p.z)],
      fov,
    };
  };
function record(name) {
  manifest.shots.push({ name, end: frame / 30, result: film.stats() });
}
await film.setup();
film.pose([16, -10, 7], [23, 0, -0.5], 42);
await film.render({ steps: 0 });
button.disabled = false;
status.textContent = "Ready · 49-second action trailer";
button.onclick = async () => {
  button.disabled = true;
  try {
    if (!retake) {
      await film.setup();
      const eight = film.ball(8).mesh.position;
      await shot(
        "black-hole-macro",
        0.6,
        camera(
          [eight.x - 5, -9, 5],
          [eight.x + 2, -8, 4],
          [eight.x, eight.y, -0.5],
          38,
        ),
      );
      await shot(
        "sun-macro",
        0.6,
        camera([-25, -7, 4], [-22, -6, 3], [-19.5, 0, -0.5], 38),
      );
      await shot(
        "rack-sweep",
        0.8,
        camera([9, -19, 13], [18, -15, 9], [23, 0, -0.5], 42),
      );
      film.shoot({ dir: { x: 1, y: 0 }, speed: 310 });
      await shot(
        "break-impact",
        0.6,
        camera([9, -21, 14], [18, -25, 16], [23, 0, -0.55], 45),
        { steps: 8 },
      );
      await shot(
        "break-overhead",
        1.2,
        camera([0, -35, 64], [12, -24, 58], [12, 0, -1], 50),
      );
      await shot(
        "chase-the-sun",
        1.2,
        follow(0, [-13, -20, 12], [-6, -22, 16], 52),
      );
      await shot(
        "break-wide",
        1,
        camera([-46, -62, 38], [-22, -64, 45], [0, 0, -3], 50),
      );
      await shot(
        "opening-title",
        1,
        camera([-78, -66, 35], [-64, -70, 40], [0, 0, -4], 50),
      );
      record("break");
    } else {
      frame = 210;
      manifest = await (await fetch("./render/capture.json")).json();
      manifest.sounds = manifest.sounds.filter(
        (s) => s.time < 7 || s.time >= 16,
      );
      manifest.cuts = manifest.cuts.filter((c) => c.start < 7 || c.start >= 16);
      manifest.shots = manifest.shots.filter(
        (s) => !["three-rail-bank", "bank-shot"].includes(s.name),
      );
    }
    // Genuine recorded search candidates, replayed at an editorial cadence, then the selected plan.
    await film.setup({
      env: "tokyo",
      style: "balls",
      positions: searches[1].balls,
    });
    status.textContent = "Recording the live computer search…";
    const bank = await film.search(searches[1].state);
    manifest.bank = bank;
    if (!bank.shot.expected.pocketed.length)
      throw Error(
        "The computer did not find a bank-shot pot for this game revision; adjust the layout before recording.",
      );
    await shot(
      "computer-search",
      3.5,
      camera([-8, -36, 66], [8, -34, 60], [0, 0, -1], 50),
      {
        steps: 0,
        search: (t) =>
          bank.previews[
            Math.min(
              bank.previews.length - 1,
              Math.floor(t * bank.previews.length),
            )
          ],
      },
    );
    film.capturePreparePlan(bank.shot);
    const chosen = {
      target: bank.shot.target,
      pocket: bank.shot.pocket,
      label: bank.shot.label,
      paths: bank.result.paths,
    };
    await shot(
      "computer-chosen",
      0.5,
      camera([8, -34, 60], [10, -33, 58], [0, 0, -1], 50),
      { steps: 0, search: () => chosen },
    );
    film.shoot(bank.shot);
    await shot(
      "bank-wide",
      1.4,
      camera([-2, -29, 62], [8, -25, 59], [0, 0, -1], 54),
    );
    await shot(
      "bank-ball-follow",
      1.6,
      follow(
        bank.shot.expected.pocketed[0].number,
        [-13, -18, 15],
        [-8, -17, 12],
        50,
      ),
    );
    const hole = [
      [-38.9, 19.4],
      [0, 20.3],
      [38.9, 19.4],
      [-38.9, -19.4],
      [0, -20.3],
      [38.9, -19.4],
    ][bank.shot.expected.pocketed[0].pocket];
    await shot(
      "bank-pocket-close",
      2,
      camera(
        [hole[0] * 0.7, hole[1] * 0.3, 13],
        [hole[0] * 0.78, hole[1] * 0.45, 10],
        [...hole, -1],
        49,
      ),
    );
    record("bank-shot");
    if (retake) {
      manifest.sounds.push(...film.sounds);
      manifest.cuts.sort((a, b) => a.start - b.start);
      await complete(manifest);
      status.textContent = "Bank close-up retake complete";
      return;
    }
    await film.setup({
      env: "corner",
      style: "balls",
      positions: searches[0].balls,
    });
    const carom = await film.search(searches[0].state);
    manifest.carom = carom;
    await shot(
      "carom-search",
      1.5,
      camera([9, -37, 66], [-6, -33, 62], [0, 0, -1], 52),
      {
        steps: 0,
        search: (t) =>
          carom.previews[
            Math.min(
              carom.previews.length - 1,
              Math.floor(t * carom.previews.length),
            )
          ],
      },
    );
    film.shoot(carom.shot);
    await shot(
      "carom-collision",
      0.8,
      follow(1, [-15, -20, 19], [-10, -21, 23], 56),
    );
    await shot(
      "carom-overhead",
      1.6,
      camera([5, -22, 68], [-8, -19, 68], [0, 0, -1], 54),
    );
    await shot(
      "carom-pocket",
      2.1,
      follow(
        carom.shot.expected.pocketed[0]?.number || carom.shot.target,
        [-11, -17, 12],
        [-7, -15, 10],
        53,
      ),
    );
    record("bank-carom");
    await film.setup({
      env: "desert",
      style: "balls",
      positions: searches[5].balls,
    });
    const kick = await film.search(searches[5].state);
    manifest.kick = kick;
    await shot(
      "kick-search",
      1,
      camera([-9, -35, 66], [3, -35, 63], [0, 0, -1], 50),
      {
        steps: 0,
        search: (t) =>
          kick.previews[
            Math.min(
              kick.previews.length - 1,
              Math.floor(t * kick.previews.length),
            )
          ],
      },
    );
    film.shoot(kick.shot);
    await shot(
      "kick-rails",
      1.5,
      camera([-8, -35, 66], [8, -34, 64], [0, 0, -1], 52),
    );
    await shot(
      "kick-follow",
      1.5,
      follow(3, [-12, -19, 15], [-6, -20, 16], 52),
    );
    await shot(
      "kick-finish",
      3,
      camera([-10, 8, 11], [-6, 11, 9], [0, 19.5, -1], 48),
    );
    record("kick");
    // A real 390x844 responsive viewport, rendered inside a phone composition.
    const iframe = document.getElementById("mobile-capture");
    await new Promise((resolve, reject) => {
      let timer;
      const timeout = setTimeout(() => {
        clearInterval(timer);
        reject(
          Error("Mobile capture did not finish loading within 60 seconds."),
        );
      }, 60000);
      iframe.onload = () => {
        timer = setInterval(() => {
          if (iframe.contentWindow.film) {
            clearInterval(timer);
            clearTimeout(timeout);
            resolve();
          }
        }, 30);
      };
      iframe.onerror = () => {
        clearTimeout(timeout);
        clearInterval(timer);
        reject(Error("Mobile capture could not load."));
      };
      iframe.src = "./mobile.html?mobile";
    });
    const m = iframe.contentWindow.film;
    await m.setup({ env: "orbital", style: "planets" });
    m.shoot({ dir: { x: 1, y: 0 }, speed: 285 });
    const phoneDraw = async (canvas, t) => {
      ctx.fillStyle = "#030b16";
      ctx.fillRect(0, 0, 1920, 1080);
      const g = ctx.createRadialGradient(1390, 490, 10, 1300, 500, 800);
      g.addColorStop(0, "#123d4d");
      g.addColorStop(1, "#030b16");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1920, 1080);
      const w = 404,
        h = 874,
        x = 1230 - 50 * t,
        y = 100 - 18 * t;
      ctx.save();
      ctx.shadowColor = "#57ddec66";
      ctx.shadowBlur = 50;
      ctx.fillStyle = "#111c25";
      ctx.beginPath();
      ctx.roundRect(x - 13, y - 13, w + 26, h + 26, 48);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 36);
      ctx.clip();
      ctx.drawImage(canvas, x, y, w, h);
      ctx.restore();
      ctx.fillStyle = "#07111a";
      ctx.beginPath();
      ctx.roundRect(x + w / 2 - 50, y + 7, 100, 15, 8);
      ctx.fill();
      ctx.fillStyle = "#91e4ef";
      ctx.font = "bold 26px Arial";
      ctx.fillText("ON YOUR PHONE", 140, 326);
      ctx.fillStyle = "#fff4dd";
      ctx.font = "bold 112px Arial";
      ctx.fillText("BIG GAME.", 130, 470);
      ctx.fillText("SMALL SCREEN.", 130, 591);
      ctx.font = "32px Arial";
      ctx.fillStyle = "#b9cbd0";
      ctx.fillText("The full table. Right in your browser.", 140, 689);
    };
    await shot(
      "mobile-portrait",
      3,
      camera([-91, 0, 58], [-85, 4, 54], [0, 0, -1.65], 48),
      { engine: m, ui: true, draw: phoneDraw },
    );
    iframe.style.width = "844px";
    iframe.style.height = "390px";
    await new Promise((r) => setTimeout(r, 100));
    m.size(844, 390, 2);
    await m.setup({ env: "coast", style: "balls" });
    m.shoot({ dir: { x: 1, y: 0 }, speed: 300 });
    await shot(
      "mobile-landscape",
      3,
      camera([-98, -52, 40], [-83, -61, 41], [-2, 0, -2], 48),
      {
        engine: m,
        ui: true,
        draw: async (canvas, t) => {
          ctx.fillStyle = "#040c16";
          ctx.fillRect(0, 0, 1920, 1080);
          ctx.fillStyle = "#93e3f0";
          ctx.font = "bold 26px Arial";
          ctx.fillText("TURN IT. TAKE THE SHOT.", 130, 116);
          const x = 210 - 20 * t,
            y = 225,
            w = 1500,
            h = 693;
          ctx.fillStyle = "#25343e";
          ctx.beginPath();
          ctx.roundRect(x - 13, y - 13, w + 26, h + 26, 47);
          ctx.fill();
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(x, y, w, h, 34);
          ctx.clip();
          ctx.drawImage(canvas, x, y, w, h);
          ctx.restore();
        },
      },
    );
    manifest.sounds.push(...m.sounds);
    for (const [env, from, to] of [
      ["coast", [-75, -55, 28], [-64, -63, 34]],
      ["riad", [-75, -57, 32], [-61, -64, 36]],
      ["glasshouse", [-72, -58, 30], [-58, -64, 36]],
    ]) {
      await film.setup({ env, style: "balls" });
      film.shoot({ dir: { x: 1, y: 0 }, speed: 290 });
      await shot(`room-${env}`, 1, camera(from, to, [0, 0, -4], 50));
    }
    const grav = rackPositions().map((p, i) =>
      p.number === 0
        ? { number: 0, x: -13, y: -4 }
        : p.number === 8
          ? { number: 8, x: 2, y: 0 }
          : { number: p.number, x: i < 8 ? -30 : 30, y: -14 + (i % 7) * 4 },
    );
    await film.setup({
      env: "orbital",
      style: "planets",
      positions: grav,
      gravity: true,
    });
    film.shoot({ dir: { x: 1, y: 0 }, speed: 21 });
    await shot(
      "gravity-orbit",
      2,
      camera([-6, -25, 29], [6, -26, 26], [0, 0, -0.55], 47),
    );
    await shot("gravity-close", 2, follow(0, [-10, -17, 11], [1, -17, 14], 48));
    await film.setup();
    film.shoot({ dir: { x: 1, y: 0 }, speed: 330 });
    await shot(
      "final-break",
      0.6,
      camera([11, -24, 13], [20, -25, 16], [23, 0, -0.5], 47),
      { steps: 8 },
    );
    await shot(
      "final-rush",
      1.2,
      camera([10, -34, 60], [-20, -37, 45], [12, 0, -1], 52),
    );
    await shot(
      "final-orbit",
      1.2,
      camera([-40, -56, 32], [-68, -38, 32], [0, 0, -3], 52),
    );
    await shot(
      "end-card",
      4,
      camera([-68, -38, 32], [-79, -52, 37], [0, 0, -3], 48),
    );
    manifest.sounds.push(...film.sounds);
    manifest.frames = frame;
    manifest.duration = frame / 30;
    await complete(manifest);
    status.textContent = `Complete · ${frame} frames · ${frame / 30}s`;
  } catch (e) {
    status.textContent = `Capture failed: ${e.message}`;
    console.error(e);
    button.disabled = false;
  }
};
