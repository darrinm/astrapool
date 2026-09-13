// Local-only cinematic capture harness. It uses the production renderer and physics.
import * as THREE from 'three';
import { renderer, scene, camera, world, eventQueue, syncMeshes, snapshotPoses } from '/src/core.js';
import pool from '/src/pool.js';
import { stepPhysics } from '/src/physics-step.js';
import { connectHud } from '/src/hud.js';
import { connectEnvironmentPicker } from '/src/environment-picker.js';

const status = document.getElementById('capture-status');
const button = document.getElementById('capture-start');
window.playful = { mute: true };
let filmClock = 10000;
Object.defineProperty(performance, 'now', { value: () => filmClock });
world.timestep = 1 / 480;
await pool.enter();
connectHud(pool); connectEnvironmentPicker(pool);
pool.setGame('free');
pool.setArcade(true);
renderer.setPixelRatio(1);
renderer.setSize(1920, 1080, false);
camera.aspect = 16 / 9;
camera.clearViewOffset();
camera.updateProjectionMatrix();
const controls = pool.controls();
controls.enabled = false; controls.enableDamping = false; controls.autoRotate = false;

const clips = [
  {name:'intro', duration:5, env:'orbital', style:'planets', from:[6,-31,22], to:[10,-35,25], target:[19,0,-0.5], fov:44},
  {name:'break', duration:6, env:'orbital', style:'planets', from:[-18,-82,73], to:[-8,-79,70], target:[0,0,-1.65], fov:48, shot:.3, speed:280},
  {name:'desert', duration:4, env:'desert', style:'balls', from:[-98,-59,38], to:[-89,-65,41], target:[0,0,-5], fov:48, shot:.25, speed:215},
  {name:'tokyo', duration:4, env:'tokyo', style:'balls', from:[-22,-88,56], to:[-8,-88,51], target:[0,0,-3], fov:49, shot:.25, speed:245},
  {name:'gravity', duration:6, env:'orbital', style:'planets', from:[-3,-37,42], to:[6,-40,45], target:[0,0,-.55], fov:44, shot:.45, speed:22, gravity:true},
  {name:'end', duration:5, env:'orbital', style:'planets', from:[-88,-66,40], to:[-82,-62,43], target:[0,0,-3], fov:48},
];
function view(clip, fraction=0) {
  const p = fraction * fraction * (3 - 2 * fraction);
  camera.position.fromArray(clip.from).lerp(new THREE.Vector3(...clip.to), p);
  controls.target.fromArray(clip.target);
  camera.fov = clip.fov; camera.updateProjectionMatrix();
}
function advance(steps=16) {
  for (let i=0;i<steps;i++) { filmClock += 1000/480; snapshotPoses(); stepPhysics(pool,world,eventQueue); }
  syncMeshes(1);
}
async function setup(clip) {
  status.textContent = `Preparing ${clip.name}…`;
  pool.key('r'); filmClock += 4000; pool.frame();
  await pool.setEnvironment(clip.env, false);
  await pool.setBallStyle(clip.style);
  const toggle = document.getElementById('black-hole-gravity-toggle');
  advance(100); pool.frame();
  if ((toggle.getAttribute('aria-pressed') === 'true') !== !!clip.gravity) toggle.click();
  if (clip.gravity) {
    const balls = pool.balls();
    for (let i=0;i<balls.length;i++) {
      const b=balls[i];
      const xy=b.number===0?[-14,-5]:b.number===8?[3,0]:[i<8?-29:29, -13+(i%7)*4];
      b.body.setTranslation({x:xy[0],y:xy[1],z:-.55},true);
      b.body.setLinvel({x:0,y:0,z:0},true); b.body.setAngvel({x:0,y:0,z:0},true);
      b.mesh.position.set(xy[0],xy[1],-.55);
    }
  }
  view(clip); advance(16); pool.frame(); renderer.render(scene,camera);
  status.textContent = `Ready: ${clip.name} · 1920 × 1080 · 30 fps`;
}
await setup(clips[0]);
button.disabled=false;
button.addEventListener('click', async () => {
  button.disabled=true;
  let frame=0;
  try {
    for (const clip of clips) {
      await setup(clip);
      let fired=false;
      for(let i=0;i<clip.duration*30;i++) {
        if(clip.shot!==undefined && !fired && i/30>=clip.shot) {
          pool.debugShot({x:1,y:0},clip.speed,{x:0,y:.15}); fired=true;
        }
        advance(); view(clip,i/(clip.duration*30-1)); pool.frame();
        renderer.render(scene,camera);
        const blob=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/jpeg',.95));
        const result=await fetch(`http://127.0.0.1:5174/frame/${String(frame).padStart(5,'0')}`,{method:'POST',body:blob});
        if(!result.ok) throw new Error(`Frame ${frame} could not be saved`);
        frame++;
        if(i%15===0) status.textContent=`Rendering ${clip.name} · ${frame} / 900 frames`;
      }
    }
    await fetch('http://127.0.0.1:5174/complete',{method:'POST',body:JSON.stringify({frames:frame,fps:30,width:1920,height:1080,clips})});
    status.textContent=`Complete · ${frame} frames saved`;
  } catch(error) {status.textContent=`Capture failed: ${error.message}`;console.error(error);button.disabled=false;}
});
