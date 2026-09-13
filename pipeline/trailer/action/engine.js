import * as THREE from "three";
import {
  renderer,
  scene,
  camera,
  world,
  eventQueue,
  syncMeshes,
  snapshotPoses,
  heads,
} from "/src/core.js";
import pool, {
  ballNumber,
  captureSnapshot,
  capturePreparePlan,
} from "./pool-capture.js";
import { stepPhysics } from "/src/physics-step.js";
import { connectHud } from "/src/hud.js";
import { connectEnvironmentPicker } from "/src/environment-picker.js";
import { ComputerThoughts } from "/src/computer-thoughts.js";
export const mobile = new URLSearchParams(location.search).has("mobile");
export const retake = new URLSearchParams(location.search).has("retake");
let time = 20000,
  videoTime = 0;
const sounds = [];
Object.defineProperty(performance, "now", { value: () => time });
window.playful = { mute: true };
world.timestep = 1 / 480;
await pool.enter();
connectHud(pool);
connectEnvironmentPicker(pool);
pool.setGame("free");
pool.setArcade(true);
const controls = pool.controls();
controls.enabled = false;
controls.enableDamping = false;
controls.autoRotate = false;
const thoughts = new ComputerThoughts({
  scene,
  camera,
  feltZ: -1.65,
  settings: () => ({ enabled: true, reduced: false }),
});
const number = (b) =>
  b.number ??
  ballNumber(heads.indexOf(b) < 4 ? heads.indexOf(b) : heads.indexOf(b) + 1);
const ball = (n) => pool.balls().find((b) => number(b) === n);
for (const method of [
  "cueTip",
  "ballBall",
  "cushion",
  "pocket",
  "rattle",
  "arcade",
])
  pool.audio[method] = (...args) =>
    sounds.push({ time: videoTime, method, args });
const output = document.createElement("canvas"),
  ctx = output.getContext("2d");
let width = 1920,
  height = 1080,
  ratio = 1,
  hudImage = null;
function size(w = 1920, h = 1080, dpr = 1) {
  width = w;
  height = h;
  ratio = dpr;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  output.width = w * dpr;
  output.height = h * dpr;
  camera.aspect = w / h;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
size(mobile ? innerWidth : 1920, mobile ? innerHeight : 1080, mobile ? 2 : 1);
function step(n = 16) {
  for (let i = 0; i < n; i++) {
    time += 1000 / 480;
    snapshotPoses();
    stepPhysics(pool, world, eventQueue);
  }
  syncMeshes(1);
}
function pose(from, target, fov = 48) {
  camera.position.fromArray(from);
  controls.target.fromArray(target);
  camera.fov = fov;
  camera.updateProjectionMatrix();
}
async function setup({
  env = "orbital",
  style = "planets",
  positions,
  gravity = false,
} = {}) {
  thoughts.clear();
  pool.key("r");
  time += 4000;
  pool.frame();
  await pool.setEnvironment(env, false);
  await pool.setBallStyle(style);
  step(150);
  pool.frame();
  const t = document.getElementById("black-hole-gravity-toggle");
  if ((t.getAttribute("aria-pressed") === "true") !== gravity) t.click();
  if (positions)
    for (const b of pool.balls()) {
      const p = positions.find((p) => p.number === number(b));
      b.body.setEnabled(!!p);
      b.mesh.visible = !!p;
      if (p) {
        b.body.setTranslation({ ...p, z: -0.55 }, true);
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        b.mesh.position.set(p.x, p.y, -0.55);
      }
    }
  step(120);
  pool.frame();
  hudImage = null;
}
function shoot(shot) {
  thoughts.clear();
  pool.debugShot(shot.dir, shot.speed, shot.spin || { x: 0, y: 0 });
}
function preview(p, chosen = false) {
  thoughts.show(p, chosen);
}
function rounded(x, y, w, h, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function label(text, x, y, chosen = false) {
  ctx.font = "bold 24px Arial";
  const w = ctx.measureText(text).width + 30;
  rounded(
    Math.max(30, Math.min(width - w - 30, x)),
    Math.max(90, y),
    w,
    44,
    12,
    chosen ? "#a8e8be" : "#ffe08a",
  );
  ctx.fillStyle = "#30241b";
  ctx.fillText(
    text,
    Math.max(30, Math.min(width - w - 30, x)) + 15,
    Math.max(90, y) + 29,
  );
}
// Rasterize the actual responsive HUD, including its computed CSS, into a transparent layer.
async function mobileHud() {
  const root = document.getElementById("hud"),
    copy = root.cloneNode(true);
  copy.removeAttribute("hidden");
  copy.removeAttribute("inert");
  const original = [root, ...root.querySelectorAll("*")],
    clones = [copy, ...copy.querySelectorAll("*")];
  for (let i = 0; i < original.length; i++) {
    const s = getComputedStyle(original[i]);
    let css = "";
    for (const key of s) {
      let v = s.getPropertyValue(key);
      if (v.includes("url(")) v = "none";
      css += `${key}:${v};`;
    }
    clones[i].setAttribute("style", css);
  }
  const wrap = document.createElement("div");
  wrap.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrap.setAttribute(
    "style",
    `position:relative;width:${width}px;height:${height}px;font-family:Georgia,serif;`,
  );
  wrap.append(copy);
  const xml = new XMLSerializer().serializeToString(wrap);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xml}</foreignObject></svg>`;
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
  hudImage = img;
}
async function render({
  steps = 16,
  at = 0,
  search = null,
  chosen = false,
  ui = false,
} = {}) {
  videoTime = at;
  step(steps);
  pool.frame();
  if (search) preview(search, chosen);
  thoughts.frame();
  renderer.render(scene, camera);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(renderer.domElement, 0, 0);
  ctx.scale(ratio, ratio);
  if (ui) {
    if (!hudImage || Math.round(at * 30) % 15 === 0) await mobileHud();
    ctx.drawImage(hudImage, 0, 0, width, height);
  }
  if (search && !mobile) {
    const p = search.paths.find((p) => p.number === search.target)?.points[0];
    if (p) {
      const v = new THREE.Vector3(p.x, p.y, 3).project(camera);
      label(
        search.label || "Thinking…",
        ((v.x + 1) * width) / 2 + 20,
        ((1 - v.y) * height) / 2 - 70,
        chosen,
      );
    }
  }
  if (!mobile)
    for (const el of document.querySelectorAll(".arcade-float:not([hidden])")) {
      const xy = /translate\(([-.\d]+)px,\s*([-.\d]+)px\)/.exec(
        el.style.transform,
      );
      if (!xy) continue;
      const x = (Number(xy[1]) / innerWidth) * width,
        y = (Number(xy[2]) / innerHeight) * height;
      ctx.globalAlpha = Number(el.style.opacity || 1);
      ctx.fillStyle = el.style.getPropertyValue("--arcade-color") || "#ffe08a";
      ctx.font = "bold 42px Arial";
      ctx.fillText(el.querySelector("strong").textContent, x, y + 35);
      ctx.font = "bold 18px Arial";
      ctx.fillText(el.querySelector("span").textContent, x, y + 62);
      ctx.globalAlpha = 1;
    }
  return output;
}
async function search(state) {
  const w = new Worker(new URL("./search-worker.js", import.meta.url), {
    type: "module",
  });
  const balls = pool
    .balls()
    .filter((b) => b.mesh.visible)
    .map((b) => ({
      number: number(b),
      x: b.body.translation().x,
      y: b.body.translation().y,
    }));
  return new Promise((res, rej) => {
    w.onmessage = ({ data }) => {
      if (data.progress) {
        const s = document.getElementById("capture-status");
        if (s)
          s.textContent = `Computer search · ${data.progress} preview paths`;
        return;
      }
      w.terminate();
      data.error ? rej(Error(data.error)) : res(data);
    };
    w.onerror = (error) => {
      w.terminate();
      rej(Error(error.message || "Computer search worker failed"));
    };
    w.postMessage({ balls, state, table: captureSnapshot() });
  });
}
export const film = {
  search,
  capturePreparePlan,
  pool,
  ball,
  number,
  setup,
  shoot,
  pose,
  step,
  render,
  size,
  output,
  ctx,
  sounds,
  preview,
  thoughts,
  stats: () => pool.arcadeState(),
};
window.film = film;
