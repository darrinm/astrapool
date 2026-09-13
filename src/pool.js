// Pool, built like a game: a 7-foot table with real holes the heads fall through, physically based materials,
// an overhead lamp with shadows, an orbit camera, an aiming guide, and sampled impact sounds.
//
// Physics: gravity is -z (the table normal). The felt is a triangle mesh with six circular holes; pocket wells sit
// under the holes; cushions are segments with angled jaws. Felt friction gives slide-to-roll and spin behaviour
// through Rapier's contact solver; rolling resistance (which Rapier lacks) is applied per step.
// Scale: one head is a 57 mm ball, so 1 unit = 26 mm, g = 377, table 78 x 39 (7-foot bar table).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RAPIER, DEPTH, renderer, scene, camera, world, eventQueue, heads, lights, DEFAULT_LIGHTS, setBallDetail, resetHeads, placeHead, hideHead,
  setHeadRadius, addMesh, addBody, addStaticCollider, registerProp, clearProps, pointerToPlane, meshUnderPointer, ui } from './core.js';
import { noiseBump, feltMap, woodMap, clothNormal, radialShadow, gradientStrip } from './textures.js';
import { bakeCap, authenticBall, chooseBallMap, loadedHead, BALL_COLORS } from './ballcaps.js';
import { ballSetById, nextBallSet, planetForBall } from './ball-sets.js';
import { createPlanetSet, updatePlanetOrbits, updatePlanetCaps } from './planet-balls.js';
import { updateSunLight } from './sun.js';
import { buildBallSetPicker, updateBallSetPicker } from './ball-set-picker.js';
import { PoolAudio } from './sounds.js';
import { trackShadowChanges } from './shadow-updates.js';
import { buildEnvironment, environmentById, readEnvironment } from './environments.js';
import { flingVelocity, pushSample } from './fling.js';
import { OnlineRoom } from './online.js';
import { GameplayAnalytics, sendGameAnalytics } from './game-analytics.js';
import { groupLabel, playerName, playerText, turnStatus } from './match-copy.js';
import { setOverheadCamera, withinCueTarget, setGuideLine } from './table-view.js';
import { projectPocketTargets, pocketAtPointer, pocketTapMoved, completesPocketTap } from './pocket-call.js';
import { rackPositions, canPlace } from './table-state.js';
import { computerShot, computerPlacement } from './computer.js';
import { newMatch, targets, groupBalls, shotRecord, resolveShot, resolveSoloShot } from './eight-ball.js';
import { PoolArcade } from './arcade.js';
import { planRack, rackPose, RACK_DURATION } from './rack-animation.js';
import { ComputerThoughts } from './computer-thoughts.js';
import { setLoadingStage } from './loading.js';
import { ShotReplay } from './replay.js';
import { ReplayView } from './replay-view.js';
import { RackResults } from './rack-results.js';
import { RackResultsView } from './rack-results-view.js';
import { blackHoleGravity } from '../physics/black-hole-gravity.js';
import { P, ballBody, feltCollider, cushionColliders, cushionPolygons, pocketWellColliders, backstopColliders, pocketCenters, tableShape, strike, feltExtras } from '../physics/poolphysics.js';

const { R, G, MU_SLIDE, MU_BALL, E_BALL, HW, HH, RAIL_H, CUSH, POCKET_R } = P;   // table physics constants live in physics/poolphysics.js
const MAX_PULL = 24, MAX_SPEED = 24 * 0.44704 / 0.026;   // 24 mph in game units/s (1 unit = 26 mm), shared with flings
const SPEED_PER_PULL = MAX_SPEED / MAX_PULL;
const FELT_Z = -DEPTH, BALL_Z = FELT_Z + R;
const RAIL_W = 3.2, WELL_DEPTH = P.WELL_DEPTH;
let sunLight;
let cue, aiming = null, pockets = [], guide, cueStick, marker, pocketed = 0, shots = 0, spin = { x: 0, y: 0 }, spinEl, controls;
let lastViewport = { w: innerWidth, h: innerHeight }, refitPending = false;
// The three framings resetView() knows about. A change of shape needs a fresh camera, not just a
// cleared view offset: a landscape position leaves half the table off a portrait screen.
const viewShape = (w, h) => (h > w ? 'portrait' : h <= 600 ? 'short' : 'wide');
let pocketedSet = new Set(), respotAt = 0, pmrem, envTex, feltCol, lastStatus = '', contactShadows = [], fixture = [], fixtureFade = [0, 1];
const WHITE = new THREE.Color(0xffffff);
const capped = new Map();   // head -> { plain, capped, ball } textures; caps are baked lazily once the plain map has loaded
let capsOn = false;
let ballStyle = 'balls', rackStyle = 'balls', planetSet, planetLoading, styleRequest = 0;
const classicMaterials = new Map(heads.map(ball => [ball, ball.mesh.material]));
let planetSaturation = 1;
try { const value = Number(localStorage.getItem('pool.planetSaturation')); if (value >= 1 && value <= 1.7) planetSaturation = value; } catch {}
let interactionMode = 'cue', dragging = null;
const CUE_LEARNED = 'pool.cueLearned';
let cueLearned = false;
try { cueLearned = localStorage.getItem(CUE_LEARNED) === '1'; } catch {}
let gameMode = 'computer', match = newMatch(), activeShot = null, calledPocket = null;
let settledFor = 0, physicsTime = 0, placing = null, calling = null, pocketMarker;
let rackMotion = null;
let computerWait = 0, computerPlan = null, computerWorker = null;
let attractMode = false, attractWait = 0;
const COMPUTER_CUE_TIME = 0.18;
let difficulty = 'tricky', onlineShotSeq = null, onlineShooter = null;
let gravityEnabled = false;
const gravityActive = () => !attractMode && gravityEnabled && gameMode !== 'online';
let overhead = false, hudObserver;
const online = new OnlineRoom(receiveOnline, text => {
  document.getElementById('online-status').textContent = text;
  const invite = document.getElementById('invite-link');
  invite.value = online.id ? `${location.origin}/#room=${online.id}` : '';
  document.querySelector('.online-row').hidden = !online.id;
  document.getElementById('online-retry').hidden = !!online.id && online.connected.every(Boolean);
  if (gameMode === 'online') updateTurnStatus();
});
const remoteTurn = () => gameMode === 'online' && (!online.canAct || match.turn !== online.seat);
const computerTurn = () => (attractMode || gameMode === 'computer' && match.turn === 1) && match.winner === null;
const cushionHandles = new Set();
const arcadeRailIds = new Map(), beforeMotion = new Map(), lastArcadeImpact = new Map();
const numberOf = ball => ball.number ?? ballNumber(rackIndexOfHead(heads.indexOf(ball)));
// In Classic and Heads, the cue ball is plain white, and the plain black 8 sits at the centre of the rack. The 14 heads
// take the other numbers (1-7 and 9-15). `extras` holds the two plain balls; `objects()` is the rack order.
let extras = [];
const shadowsChanged = trackShadowChanges();
const rackIndexOfHead = (i) => (i < 4 ? i : i + 1);                 // the 8 occupies rack index 4 (centre of row 3)
const objects = () => { const eight = extras.find((e) => e.number === 8); return [...heads.slice(0, 4), eight, ...heads.slice(4)].filter(Boolean); };
const allBalls = () => [cue, ...objects()].filter(Boolean);
// Orientation at rack time: a plain ball shows its number (bottom pole of the texture, local -y) upward; a head in
// heads mode shows its face (texture centre, local +x) upward; a head in balls mode shows its number.
// Planets stand their north pole (local +y) upward, with equatorial rings parallel to the table.
// The number/face orientations end with a quarter turn about the table normal so that what should read as "up" (the crown of
// a head, the top of a digit) points away from the cue ball (+x): a player at the head of the table sees faces and
// numbers upright. Derivation: the crown is local +y; standing the face (local +x) up leaves +y pointing across the
// table (+y world). A digit's top in the cap is the texture's u = 0.25 direction, local +z; standing the bottom pole
// (local -y) up sends +z to world +y as well. Rz(-90 deg) then maps +y to +x.
const TOWARD_FAR_RAIL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
const NUMBER_UP = TOWARD_FAR_RAIL.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)));
const FACE_UP = TOWARD_FAR_RAIL.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)));
const POLE_UP = TOWARD_FAR_RAIL.clone().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)));
const rackRot = (ball) => {
  const q = rackStyle === 'planets' ? POLE_UP
    : heads.includes(ball) && rackStyle === 'heads' ? FACE_UP : NUMBER_UP;
  return { x: q.x, y: q.y, z: q.z, w: q.w };
};
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const saved = {};
let environmentId = readEnvironment(localStorage), room, pendingRoom, tableFinish, tableLights;
let environmentRequest = 0;
async function setEnvironment(id, applyBallDefault = true) {
  const theme = environmentById(id), request = ++environmentRequest, initialStyleRequest = styleRequest;
  pendingRoom?.dispose(); pendingRoom = null;
  if (!tableFinish) return false;
  if (room?.group.name === `environment-${theme.id}`) return true;
  const minimal = theme.id === 'minimal';
  const next = buildEnvironment(theme, FELT_Z - 1.2 - 4 - 24);
  pendingRoom = next;
  try { if (!minimal) await next.ready; }
  catch (error) {
    next.dispose();
    if (request === environmentRequest) {
      pendingRoom = null;
      rackStyle = ballStyle;
      if (rackMotion) for (const entry of rackMotion.entries) entry.rotationTo.copy(rackRot(entry.ball));
    }
    console.warn(`Could not load ${theme.name}`, error);
    return false;
  }
  if (request !== environmentRequest) { next.dispose(); return false; }
  pendingRoom = null;
  const atDefaultView = !overhead && camera.position.distanceTo(new THREE.Vector3(-HW * 1.6, 0, FELT_Z + 21)) < 0.1;
  environmentId = theme.id;
  endGesture();
  const original = tableFinish.original;
  tableFinish.legs.forEach(mesh => { mesh.visible = theme.id !== 'orbital'; });
  if (tableFinish.felt.map !== original.felt) tableFinish.felt.map.dispose();
  tableFinish.felt.map = minimal ? original.felt : feltMap(512, 6, theme.felt);
  if (!minimal) tableFinish.felt.map.colorSpace = THREE.SRGBColorSpace;
  tableFinish.felt.sheenColor.set(minimal ? '#2f8a55' : theme.felt);
  // Each finish needs independent UV transforms, but all share the same grain image.
  const grain = minimal ? null : woodMap(512, 1, 11, theme.wood);
  if (grain) grain.colorSpace = THREE.SRGBColorSpace;
  tableFinish.wood.forEach((material, index) => {
    const initial = original.wood[index], old = material.map;
    if (minimal) material.map = initial;
    else {
      const map = index === 0 ? grain : grain.clone();
      map.repeat.copy(initial.repeat); map.rotation = initial.rotation; map.center.copy(initial.center);
      material.map = map;
    }
    if (old !== initial) old.dispose();
    material.envMapIntensity = minimal ? 0.08 : 0.6;
    material.metalness = theme.id === 'orbital' ? 0.45 : 0;
    material.roughness = theme.id === 'tokyo' ? 0.3 : 0.6;
  });
  tableFinish.trim.color.set(minimal ? '#1a0d05' : theme.trim);
  tableFinish.shade.color.set(minimal || theme.id === 'corner' ? '#12301f' : theme.trim);
  tableLights.forEach((light, index) => {
    light.color.set(minimal ? original.lights[index] : theme.lamp);
    light.intensity = original.intensities[index] * (minimal ? 1 : 1.2);
  });
  lights.hemi.intensity = theme.hemi;
  renderer.toneMappingExposure = theme.exposure;
  scene.background = new THREE.Color(theme.sky); scene.fog = minimal ? new THREE.Fog(theme.sky, 140, 330) : null;
  scene.environment = minimal ? envTex : next.environmentMap;
  scene.environmentRotation.set(minimal ? 0 : Math.PI / 2, 0, 0);
  scene.environmentIntensity = minimal ? 0.5 : 0.8;
  room?.dispose(); room = next; scene.add(room.group);
  renderer.shadowMap.needsUpdate = true;
  document.documentElement.dataset.environment = theme.id;
  applyRoomAccent(theme);
  if (!minimal && atDefaultView) resetView();
  // A manual collection choice made while the room loads takes precedence.
  if (applyBallDefault && styleRequest === initialStyleRequest) {
    await setBallStyle(theme.id === 'orbital' ? 'planets' : 'balls');
  }
  return true;
}

// ---------- table ----------
function build() {
  clearProps();
  const registerCollider = (c) => registerProp(c);
  const rules = { friction: RAPIER.CoefficientCombineRule.Max, restitution: RAPIER.CoefficientCombineRule.Min };
  pockets = pocketCenters();

  // ---- felt with holes: visual slab + trimesh collider so heads really drop through ----
  const shape = tableShape();
  const feltGeo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false, curveSegments: 40 });
  feltGeo.translate(0, 0, FELT_Z - 1.2);
  const feltMat = new THREE.MeshPhysicalMaterial({
    map: feltMap(512, 6, '#0a3820'), normalMap: clothNormal(512, 40), normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 1.0, sheen: 0.18, sheenRoughness: 0.95, sheenColor: new THREE.Color('#2f8a55'), color: '#ffffff',
  });
  const slabWood = new THREE.MeshPhysicalMaterial({ map: woodMap(1024, 1, 11, ['#1f1007', '#2a170a', '#31200c', '#160b04']), roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.08 });
  const felt = addMesh(new THREE.Mesh(feltGeo, [feltMat, slabWood])); felt.receiveShadow = true;   // caps felt, sides wood
  feltCol = feltCollider(world, FELT_Z); registerCollider(feltCol);

  // ---- pocket wells: liner walls and a bottom, plus a leather rim ----
  const liner = new THREE.MeshStandardMaterial({ color: '#3a2a1d', roughness: 0.9, side: THREE.BackSide, bumpMap: noiseBump(256, 4, 9), bumpScale: 0.4 });
  const leather = new THREE.MeshStandardMaterial({ color: '#1e140c', roughness: 0.55, bumpMap: noiseBump(256, 3, 9), bumpScale: 0.35 });
  for (const p of pockets) {
    const cyl = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(POCKET_R + 0.2, POCKET_R + 0.2, WELL_DEPTH, 32, 1, true).rotateX(Math.PI / 2), liner));
    cyl.position.set(p.x, p.y, FELT_Z - WELL_DEPTH / 2 + 0.05);
    const bottom = addMesh(new THREE.Mesh(new THREE.CircleGeometry(POCKET_R + 0.2, 32), new THREE.MeshStandardMaterial({ color: '#2b1f15', roughness: 1 })));
    bottom.position.set(p.x, p.y, FELT_Z - WELL_DEPTH); bottom.receiveShadow = true;
    const rim = addMesh(new THREE.Mesh(new THREE.TorusGeometry(POCKET_R + 0.12, 0.2, 10, 48), leather));
    rim.position.set(p.x, p.y, FELT_Z + 0.02); rim.castShadow = true; rim.receiveShadow = true;
    // pocket casting: a thick leather collar at rail height that covers the notch in the rails
    const toward = Math.atan2(-p.y, -p.x);                          // direction from the pocket to the table centre
    const arc = Math.abs(p.x) < 1 ? Math.PI * 1.05 : Math.PI * 1.35; // side pockets show less collar than corners
    const casting = addMesh(new THREE.Mesh(new THREE.TorusGeometry(POCKET_R + 0.55, 0.5, 12, 40, arc), leather));
    casting.position.set(p.x, p.y, FELT_Z + RAIL_H * 0.55); casting.rotation.z = toward + Math.PI - arc / 2;
    casting.castShadow = true; casting.receiveShadow = true;
  }
  for (const c of pocketWellColliders(world, FELT_Z, true)) registerCollider(c);

  // ---- cushions: each is a top-view polygon (nose edge on the playing line, ends angled into the pockets),
  // extruded with a rounded top; the collider is the convex hull of the same polygon so the jaws exist in physics ----
  const cushionMat = feltMat;
  for (const pts of cushionPolygons()) {
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: RAIL_H - 0.3, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.28, bevelSegments: 3 });
    geo.translate(0, 0, FELT_Z - 0.02);
    const m = addMesh(new THREE.Mesh(geo, cushionMat)); m.receiveShadow = true; m.castShadow = true;
  }
  cushionHandles.clear();
  arcadeRailIds.clear();
  cushionColliders(world, FELT_Z, true).forEach((c, i) => { registerCollider(c); cushionHandles.add(c.handle); arcadeRailIds.set(c.handle, i); });
  // ---- rails, diamonds, apron, legs: dark walnut with a satin finish ----
  const walnut = ['#1f1007', '#2a170a', '#31200c', '#160b04'];   // dark walnut
  const woodTex = (seed, rx, ry, rot = 0) => { const t = woodMap(1024, 1, seed, walnut); t.repeat.set(rx, ry); t.rotation = rot; t.center.set(0.5, 0.5); return t; };
  const wood = (seed, rx, ry, rot) => new THREE.MeshPhysicalMaterial({ map: woodTex(seed, rx, ry, rot), roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.6, metalness: 0, envMapIntensity: 0.08 });   // satin; the environment carries the lamp at high intensity and would mirror it as a streak along the rounded edges
  const railLong = wood(11, 4, 0.3), railShort = wood(12, 0.3, 2, Math.PI / 2), apronWood = wood(13, 4, 0.5), apronWoodEnd = wood(13, 2, 0.5, Math.PI / 2), legWood = wood(14, 0.4, 1.2, Math.PI / 2);
  const rail = (w, h, x, y, mat) => {
    const sh = new THREE.Shape([new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(w / 2, h / 2), new THREE.Vector2(-w / 2, h / 2)]);
    // ExtrudeGeometry bevels both ends; the rail is sunk so the bottom chamfer sits inside the apron instead of
    // catching the lamp as a bright line along the base.
    const geo = new THREE.ExtrudeGeometry(sh, { depth: RAIL_H + 1.5, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.45, bevelSegments: 5 });
    const m = addMesh(new THREE.Mesh(geo, mat)); m.position.set(x, y, FELT_Z - 1.5); m.receiveShadow = true; m.castShadow = true;
  };
  const ox = HW + CUSH + RAIL_W, oy = HH + CUSH + RAIL_W;
  for (const sy of [-1, 1]) rail(ox * 2, RAIL_W, 0, sy * (HH + CUSH + RAIL_W / 2), railLong);
  for (const sx of [-1, 1]) rail(RAIL_W, (HH + CUSH) * 2, sx * (HW + CUSH + RAIL_W / 2), 0, railShort);
  // sight diamonds: inlaid rhombi, long axis across the rail (pointing at the playing surface), flush with the top
  const pearl = new THREE.MeshPhysicalMaterial({ color: '#efe6d6', roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.2, iridescence: 0.35, iridescenceIOR: 1.3 });
  const railTop = FELT_Z - 1.5 + RAIL_H + 1.5 + 0.5;   // extrude depth plus the top bevel
  const rhombus = (longAxis, shortAxis) => new THREE.Shape([new THREE.Vector2(longAxis / 2, 0), new THREE.Vector2(0, shortAxis / 2), new THREE.Vector2(-longAxis / 2, 0), new THREE.Vector2(0, -shortAxis / 2)]);
  const diamondAcross = new THREE.ExtrudeGeometry(rhombus(0.5, 1.1), { depth: 0.06, bevelEnabled: false });   // long axis along y: for the long rails
  const diamondAlong = new THREE.ExtrudeGeometry(rhombus(1.1, 0.5), { depth: 0.06, bevelEnabled: false });    // long axis along x: for the short rails
  for (let i = 1; i < 8; i++) if (i !== 4) for (const sy of [-1, 1]) { const d = addMesh(new THREE.Mesh(diamondAcross, pearl)); d.position.set(-HW + (i / 4) * HW, sy * (HH + CUSH + RAIL_W / 2), railTop - 0.03); }
  for (let i = 1; i < 4; i++) for (const sx of [-1, 1]) { const d = addMesh(new THREE.Mesh(diamondAlong, pearl)); d.position.set(sx * (HW + CUSH + RAIL_W / 2), -HH + (i / 2) * HH, railTop - 0.03); }
  // apron with a moulding line and a lower lip
  const apronH = 4.2, apronZ = FELT_Z - 1.2 - apronH / 2;
  for (const sy of [-1, 1]) { const a = addMesh(new THREE.Mesh(new THREE.BoxGeometry(ox * 2, 1.2, apronH), apronWood)); a.position.set(0, sy * (oy - 0.6), apronZ); a.castShadow = true; a.receiveShadow = true; }
  for (const sx of [-1, 1]) { const a = addMesh(new THREE.Mesh(new THREE.BoxGeometry(1.2, oy * 2, apronH), apronWoodEnd)); a.position.set(sx * (ox - 0.6), 0, apronZ); a.castShadow = true; a.receiveShadow = true; }
  const mouldMat = new THREE.MeshPhysicalMaterial({ color: '#1a0d05', roughness: 0.6, clearcoat: 0.15, clearcoatRoughness: 0.6, envMapIntensity: 0.08 });
  for (const [w, h, x, y] of [[ox * 2 + 0.4, 0.5, 0, oy], [ox * 2 + 0.4, 0.5, 0, -oy], [0.5, oy * 2 + 0.4, ox, 0], [0.5, oy * 2 + 0.4, -ox, 0]]) {
    const m1 = addMesh(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.35), mouldMat)); m1.position.set(x, y, FELT_Z - 1.2 - 1.3);    // moulding line
    const m2 = addMesh(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.5), mouldMat)); m2.position.set(x, y, FELT_Z - 1.2 - apronH + 0.25);  // lower lip
  }
  // tapered square legs with a foot block
  const legH = 24, legTop = FELT_Z - 1.2 - apronH;
  const legGeo = new THREE.CylinderGeometry(1.6, 2.4, legH, 4, 1).rotateX(Math.PI / 2).rotateZ(Math.PI / 4);   // square section, wider at the top
  const footGeo = new THREE.BoxGeometry(3.6, 3.6, 1.2);
  const legs = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const l = addMesh(new THREE.Mesh(legGeo, legWood)); l.position.set(sx * (HW - 3), sy * (HH - 1), legTop - legH / 2); l.castShadow = true; l.receiveShadow = true;
    const f = addMesh(new THREE.Mesh(footGeo, mouldMat)); f.position.set(sx * (HW - 3), sy * (HH - 1), legTop - legH + 0.6);
    legs.push(l, f);
  }
  for (const c of backstopColliders(world, FELT_Z)) registerCollider(c);   // nothing leaves the table area even on a jump

  // ---- room: dark walls with a baseboard, dark carpet, and the lamp fixture in frame ----
  const LAMP_Z = FELT_Z + 23;
  const shade = addMesh(new THREE.Mesh(new THREE.BoxGeometry(46, 12, 2.4), new THREE.MeshStandardMaterial({ color: '#12301f', roughness: 0.45, metalness: 0.35, transparent: true })));
  shade.position.set(0, 0, LAMP_Z + 1.2); shade.castShadow = false;
  const panel = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(44, 10), new THREE.MeshStandardMaterial({ color: '#fff2d6', emissive: '#fff0c8', emissiveIntensity: 2.5, transparent: true })));
  panel.position.set(0, 0, LAMP_Z - 0.05); panel.rotation.x = Math.PI;
  fixture = [shade, panel];
  for (const x of [-16, 0, 16]) { const w = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 60), new THREE.MeshStandardMaterial({ color: '#222', transparent: true }))); w.rotation.x = Math.PI / 2; w.position.set(x, 0, LAMP_Z + 32); fixture.push(w); }
  fixtureFade = [LAMP_Z - 7, LAMP_Z - 2];   // camera heights between which the fixture fades out so it never blocks a top-down view

  // ---- lights: soft panel for the look, spotlight for shadows, tight enough that the floor falls into shadow ----
  const area = addMesh(new THREE.RectAreaLight('#fff1d0', 1.6, 44, 10)); area.position.set(0, 0, LAMP_Z); area.lookAt(0, 0, FELT_Z);
  const spot = addMesh(new THREE.SpotLight('#fff3dc', 1000, 0, Math.PI / 3.1, 0.7, 2)); spot.position.set(0, 0, LAMP_Z);
  spot.target.position.set(0, 0, FELT_Z); addMesh(spot.target);
  spot.castShadow = true; spot.shadow.mapSize.set(2048, 2048); spot.shadow.bias = -0.0004; spot.shadow.normalBias = 0.02; spot.shadow.camera.near = 5; spot.shadow.camera.far = 80;

  // A single scene light follows the displayed cue (live or replay), avoiding
  // duplicate illumination from the hidden live Sun during replay.
  sunLight = addMesh(new THREE.PointLight('#ffd29a', 18, 14, 2));
  sunLight.name = 'sun-light'; sunLight.visible = false; sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(512, 512);
  // Clip the emitting sphere out of its own shadow cube.
  sunLight.shadow.camera.near = R * 1.04; sunLight.shadow.camera.far = 14;
  sunLight.shadow.bias = -0.001; sunLight.shadow.normalBias = 0.025;

  tableFinish = { felt: feltMat, wood: [slabWood, railLong, railShort, apronWood, apronWoodEnd, legWood], trim: mouldMat, shade: shade.material, legs };
  tableLights = [area, spot];
  tableFinish.original = { felt: feltMat.map, wood: tableFinish.wood.map(material => material.map), lights: tableLights.map(light => light.color.clone()), intensities: tableLights.map(light => light.intensity) };

  // ---- contact shadows under the balls, and occlusion strips where the cushions meet the felt ----
  const shadowTex = radialShadow();
  contactShadows = [...heads, { id: 'cue' }, { id: 'ball8' }].map(() => { const m = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(R * 2.6, R * 2.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.55 }))); m.visible = false; return m; });
  const stripTex = gradientStrip();
  const strip = (len, x, y, rotZ) => {
    const m = addMesh(new THREE.Mesh(new THREE.PlaneGeometry(0.9, len), new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, depthWrite: false, opacity: 0.8 })));
    m.position.set(x, y, FELT_Z + 0.012); m.rotation.z = rotZ;
  };
  for (const sy of [-1, 1]) strip(HW * 2, 0, sy * (HH - 0.45), sy > 0 ? -Math.PI / 2 : Math.PI / 2);
  for (const sx of [-1, 1]) strip(HH * 2, sx * (HW - 0.45), 0, sx > 0 ? Math.PI : 0);

  // ---- plain balls: the white cue ball (0) and the black 8, so the 14 heads plus one make a full rack ----
  extras = [0, 8].map((n) => {
    const mat = new THREE.MeshPhysicalMaterial({ map: authenticBall(n), roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 1.4 });
    const mesh = new THREE.Mesh(heads[0].mesh.geometry, mat); mesh.scale.setScalar(R / 1.5); mesh.castShadow = true;
    const body = addBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0, BALL_Z + 5 + 5 * n).setLinearDamping(0).setAngularDamping(0.02).setCcdEnabled(true),
      RAPIER.ColliderDesc.ball(R).setRestitution(E_BALL).setFriction(MU_BALL).setDensity(1).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), mesh);
    return { id: n === 0 ? 'cue' : `ball${n}`, body, mesh, number: n };
  });
  cue = extras[0];
  for (const ball of extras) classicMaterials.set(ball, ball.mesh.material);

  // ---- aiming guide (line to first impact, ghost ball, object-ball direction) and the cue stick ----
  guide = new THREE.Group(); addMesh(guide);
  guide.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }));
  guide.ghost = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
  guide.objLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9 }));
  guide.cueLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }));
  guide.add(guide.line, guide.ghost, guide.objLine, guide.cueLine); guide.visible = false;
  cueStick = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 24, 16), new THREE.MeshStandardMaterial({ color: '#e2c48f', roughness: 0.35 }));
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 18, 16), new THREE.MeshStandardMaterial({ map: woodMap(512, 1, 21, ['#2a1408', '#3d1f0c', '#1e0f06', '#4a2a12']), roughness: 0.4 }));
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.5 }));
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.35, 16), new THREE.MeshStandardMaterial({ color: '#2a4d8f', roughness: 0.9 }));
  shaft.position.y = -12; butt.position.y = -33; ferrule.position.y = -0.4; tip.position.y = 0.17;
  for (const m of [shaft, butt, ferrule, tip]) { m.castShadow = true; cueStick.add(m); }
  cueStick.rotation.z = -Math.PI / 2;   // stick along +x with the tip at the origin
  cueStick.visible = false;
  const cueHolder = new THREE.Group(); cueHolder.add(cueStick); addMesh(cueHolder); cueStick.holder = cueHolder;
  // Cue-ball indicator: a steady ring on the felt around the cue ball whenever a shot can be taken.
  marker = addMesh(new THREE.Mesh(new THREE.RingGeometry(R * 1.3, R * 1.65, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false })));
  marker.visible = false;
  pocketMarker = addMesh(new THREE.Mesh(new THREE.TorusGeometry(POCKET_R + 0.3, 0.12, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffd27a', depthTest: false })));
  pocketMarker.visible = false;
}

// ---------- heads on the table ----------
export function ballNumber(j) { return j < 4 ? j + 1 : j === 4 ? 8 : j <= 7 ? j : j + 1; }   // rack index -> number: 1-4, 8, 5-7, 9-15
// The numbered ball is drawn from scratch by authenticBall and needs no head
// texture. Only the capped head does. Gating the whole entry on a loaded head
// meant that when public/heads is absent — the public build — the map never
// arrived and all fourteen balls kept the placeholder colour core.js gives them.
const wantMap = entry => chooseBallMap(entry, ballStyle === 'heads' ? 'heads' : 'balls');

function applyCaps() {
  for (let i = 0; i < heads.length; i++) {
    const h = heads[i], m = classicMaterials.get(h);
    let entry = capped.get(h);
    if (!entry) {
      const number = ballNumber(rackIndexOfHead(i));
      // base is that placeholder colour, kept so removeCaps can put it back.
      entry = { number, base: m.color.clone(), plain: null, capped: null, ball: authenticBall(number) };
      capped.set(h, entry);
    }
    const head = loadedHead(m.map, entry);
    if (head && !entry.capped) { entry.plain = head; entry.capped = bakeCap(head.image, entry.number); }
    const want = wantMap(entry);
    // color multiplies map, so it has to go white or the placeholder tints the ball.
    if (capsOn && m.map !== want) { m.map = want; m.color.setHex(0xffffff); m.needsUpdate = true; }
  }
}

// core.js assigns material.map straight from the texture loader, so a head can
// land after applyCaps has already set a generated map. Re-run whenever any
// material is not showing what it should; with no heads to load this settles on
// the first frame and stays quiet.
function capsPending() {
  if (capped.size < heads.length) return true;
  for (const h of heads) {
    const entry = capped.get(h);
    if (!entry || classicMaterials.get(h).map !== wantMap(entry)) return true;
  }
  return false;
}

function removeCaps() {
  for (const [h, entry] of capped) {
    const m = classicMaterials.get(h);
    if (m.map !== entry.plain) { m.map = entry.plain; m.color.copy(entry.plain ? WHITE : entry.base); m.needsUpdate = true; }
  }
}
function setPlanetSaturation(value) {
  planetSaturation = THREE.MathUtils.clamp(value, 1, 1.7);
  planetSet?.setSaturation(planetSaturation);
  document.getElementById('planet-saturation').value = planetSaturation;
  document.getElementById('planet-saturation-value').textContent = `${Math.round(planetSaturation * 100)}%`;
  try { localStorage.setItem('pool.planetSaturation', String(planetSaturation)); } catch {}
}
async function setBallStyle(id) {
  const style = ballSetById(id).id, request = ++styleRequest;
  if (style === 'planets' && !planetSet) {
    setLoadingStage(3, 'Loading balls…');
    updateBallSetPicker(ballStyle === 'planets' ? 'balls' : ballStyle, style);
    try {
      planetLoading ??= createPlanetSet().then(set => {
        if (!capsOn) { set.dispose(); throw new Error('Table closed'); }
        planetSet = set; return set;
      }).finally(() => { planetLoading = null; });
      await planetLoading;
    } catch (error) {
      if (request === styleRequest) {
        if (ballStyle === 'planets') ballStyle = 'balls';
        rackStyle = ballStyle;
        if (rackMotion) for (const entry of rackMotion.entries) entry.rotationTo.copy(rackRot(entry.ball));
        updateBallSetPicker(ballStyle, null, 'Planets could not load. Choose Planets to try again.');
      }
      return false;
    }
    if (request !== styleRequest) return false;
  }
  stopReplay();
  ballStyle = rackStyle = style;
  try { localStorage.setItem('playful.ballStyle', style); } catch {}
  for (const ball of allBalls()) {
    planetSet?.detach(ball.mesh);
    ball.mesh.material = classicMaterials.get(ball);
    if (style === 'planets') planetSet.attach(ball.mesh, numberOf(ball));
  }
  planetSet?.setSaturation(planetSaturation);
  if (rackMotion) for (const entry of rackMotion.entries) entry.rotationTo.copy(rackRot(entry.ball));
  // Appearance is private presentation. Never rotate a live physics body: an
  // online shot or computer plan may already have snapshotted it.
  updateBallSetPicker(style, null);
  applyCaps(); updateScore();
  renderer.shadowMap.needsUpdate = true;
  return true;
}

function layout(animate = true) {
  stopReplay(); replay.discard();
  cancelComputerSearch(); endGesture();
  const origins = rackOrigins();
  rackMotion = null;
  eventQueue.drainCollisionEvents(() => {});
  resetHeads({ linearDamping: 0, angularDamping: 0.02, restitution: E_BALL, friction: MU_BALL });
  for (const h of heads) {
    h.body.collider(0).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    h.mesh.receiveShadow = ballStyle === 'planets';
  }
  for (const e of extras) { e.body.setEnabled(true); e.mesh.visible = true; }
  spot(cue, -HW * 0.5, 0, IDENTITY);
  for (const position of rackPositions()) {
    const ball = allBalls().find(b => numberOf(b) === position.number);
    spot(ball, position.x, position.y, rackRot(ball));
  }
  pocketed = 0; shots = 0; pocketedSet = new Set(); respotAt = 0; belowSince.clear(); inWell.clear();
  activeShot = null; settledFor = 0; calledPocket = null; computerWait = 0; computerPlan = null; onlineShotSeq = null;
  beforeMotion.clear(); lastArcadeImpact.clear(); arcade.reset(); rackResults.reset();
  if (animate) beginRack(origins);
  updateScore();
}
function spot(h, x, y, rot) { h.body.setTranslation({ x, y, z: BALL_Z }, true); h.body.setRotation(rot, true); h.body.setLinvel({ x: 0, y: 0, z: 0 }, true); h.body.setAngvel({ x: 0, y: 0, z: 0 }, true); }

function rackOrigins() {
  return allBalls().map(ball => {
    const p = rackMotion ? ball.mesh.position : ball.body.translation();
    const q = rackMotion ? ball.mesh.quaternion : ball.body.rotation();
    return { number: numberOf(ball), x: p.x, y: p.y, rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      onTable: ball.mesh.visible && (ball.body.isEnabled() || !!rackMotion) && !pocketedSet.has(ball) && Math.abs(p.z - BALL_Z) < R };
  });
}
function beginRack(origins, positions = rackPositions()) {
  if (arcade.hud.reduced || document.hidden) {
    if (!document.hidden) arcade.effects.rack(positions, gameMode === 'free');
    return;
  }
  const balls = allBalls();
  const plan = planRack(origins, Math.random, positions);
  if (plan.every(move => Math.hypot(move.from.x - move.to.x, move.from.y - move.to.y) < 0.01)) {
    arcade.effects.rack(positions, gameMode === 'free'); return;
  }
  const entries = plan.map(move => {
    const ball = balls.find(b => numberOf(b) === move.number);
    const q = origins.find(p => p.number === move.number)?.rotation || rackRot(ball);
    ball.body.setEnabled(false); ball.mesh.visible = true;
    ball.mesh.position.set(move.from.x, move.from.y, BALL_Z);
    ball.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    if (move.returned) arcade.effects.ring(move.from, undefined, 1.8, 0.25);
    return { ...move, ball, rotationFrom: ball.mesh.quaternion.clone(), rotationTo: new THREE.Quaternion().copy(rackRot(ball)) };
  });
  rackMotion = { start: performance.now() / 1000, entries, positions };
}
function finishRack(celebrate = true) {
  if (!rackMotion) return;
  const { entries, positions } = rackMotion;
  rackMotion = null;
  for (const { ball, to } of entries) {
    spot(ball, to.x, to.y, rackRot(ball)); ball.body.setEnabled(true);
    ball.mesh.position.set(to.x, to.y, BALL_Z); ball.mesh.quaternion.copy(rackRot(ball));
  }
  eventQueue.drainCollisionEvents(() => {});
  if (celebrate && !document.hidden) arcade.effects.rack(positions, gameMode === 'free');
  updateScore();
}
function animateRack() {
  if (!rackMotion) return;
  const elapsed = performance.now() / 1000 - rackMotion.start;
  if (elapsed >= RACK_DURATION || arcade.hud.reduced || document.hidden) {
    finishRack(elapsed < RACK_DURATION + 0.5); return;
  }
  for (const entry of rackMotion.entries) {
    const p = rackPose(entry, elapsed);
    entry.ball.mesh.position.set(p.x, p.y, BALL_Z);
    entry.ball.mesh.quaternion.copy(entry.rotationFrom).slerp(entry.rotationTo, p.progress);
  }
}

// ---------- camera ----------
function setupCamera() {
  camera.up.set(0, 0, 1); camera.fov = 48; camera.far = 800; camera.updateProjectionMatrix();
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, FELT_Z); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = true; controls.screenSpacePanning = false;   // right-drag slides the view along the table plane
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.panSpeed = 1.2; controls.minDistance = 10; controls.maxDistance = 200;
  controls.minPolarAngle = 0.05; controls.maxPolarAngle = Math.PI / 2 - 0.1;
  controls.addEventListener('start', () => { overhead = false; controls.minPolarAngle = 0.05; });
  resetView();
  hudObserver = new ResizeObserver(() => {
    if (attractMode) frameAttract();
    else if (overhead && !aiming && !placing && !dragging) fitOverhead();
  });
  for (const selector of ['.topbar', '.bottom-hud', '.welcome-inner']) hudObserver.observe(document.querySelector(selector));
}
// The default view shows the room the player picked. Portrait sights down the long rail so a tall
// window still frames the whole table; Overhead stays one tap away in the compact bar.
function resetView() {
  overhead = false;
  camera.clearViewOffset();
  controls.minPolarAngle = 0.05;
  controls.target.set(0, 0, FELT_Z);
  // Portrait: back along the long rail and up ~30 degrees. Verified at 390x844 to hold every
  // pocket and both side rails in frame while the room still reads behind the far end.
  if (innerHeight > innerWidth) camera.position.set(-HW * 2.35, 0, FELT_Z + 54);
  // Short landscape: the HUD lives in a rail on the right, so sit off the near-left corner and
  // aim a little that way, keeping the whole table clear of it. Verified at 844x390.
  else if (innerHeight <= 600) { camera.position.set(-100, -56, FELT_Z + 38); controls.target.set(-4, 0, FELT_Z); }
  else if (environmentId === 'minimal') camera.position.set(-HW * 1.6, 0, FELT_Z + 21);
  else { camera.position.set(-115, -65, FELT_Z + 40); controls.target.z = FELT_Z - 7; }
  // Give the solo demo a closer view, with more room around the table on mobile.
  if (attractMode) {
    const mobile = matchMedia('(max-width: 600px), (hover: none) and (pointer: coarse)').matches;
    camera.position.sub(controls.target).multiplyScalar(mobile ? 0.9 : 0.8).add(controls.target);
  }
  controls.update();
  if (attractMode) frameAttract();
}
function frameAttract() {
  // Desktop has room to center the orbit; only mobile needs a lift above the choices.
  if (!matchMedia('(max-width: 600px), (hover: none) and (pointer: coarse)').matches) {
    camera.clearViewOffset();
    return;
  }
  // Keep the offset smaller in landscape, where vertical room is limited.
  const choices = document.querySelector('.welcome-inner').getBoundingClientRect();
  const lift = Math.min(choices.height / 2, innerHeight * (innerHeight > innerWidth ? 0.16 : 0.08));
  camera.setViewOffset(innerWidth, innerHeight, 0, lift, innerWidth, innerHeight);
}

// The chrome borrows the room's own accent, so the HUD belongs to the table it sits on.
function applyRoomAccent(theme) {
  const root = document.documentElement.style;
  const accent = theme.accent || '#e7c58b';
  root.setProperty('--accent', accent);
  root.setProperty('--accent-wash', `${accent}1f`);
  // Room accents are all light; pick ink dark enough to read on any of them.
  root.setProperty('--accent-ink', '#191307');
}

// ---------- look: dark room, tone mapping, environment reflections, glossy balls ----------
function setLook(on) {
  if (on) {
    saved.bg = scene.background; saved.tone = renderer.toneMapping; saved.exp = renderer.toneMappingExposure; saved.env = scene.environment; saved.fog = scene.fog;
    scene.background = new THREE.Color('#0a0a0d'); scene.fog = new THREE.Fog('#0a0a0d', 140, 330);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
    pmrem = pmrem || new THREE.PMREMGenerator(renderer); envTex = envTex || pmrem.fromScene(lampRoom(), 0.02).texture;
    scene.environment = envTex; scene.environmentIntensity = 0.5;
    lights.hemi.intensity = 0.12; lights.key.intensity = 0; lights.fill.intensity = 0;
    for (const h of heads) { const m = h.mesh.material; m.roughness = 0.32; m.clearcoat = 0.6; m.clearcoatRoughness = 0.2; m.envMapIntensity = 1.4; }
  } else {
    scene.background = saved.bg; scene.fog = saved.fog; renderer.toneMapping = saved.tone; renderer.toneMappingExposure = saved.exp; scene.environment = saved.env;
    lights.hemi.intensity = DEFAULT_LIGHTS.hemi; lights.key.intensity = DEFAULT_LIGHTS.key; lights.fill.intensity = DEFAULT_LIGHTS.fill;
    for (const h of heads) { const m = h.mesh.material; m.roughness = 0.5; m.clearcoat = 0; m.envMapIntensity = 1; }
  }
}

// The reflection environment is the room itself: near-black walls and floor, one warm rectangular lamp overhead.
// Every ball then shows a single elongated highlight from the lamp instead of a scatter of studio panels.
function lampRoom() {
  const env = new THREE.Scene();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(400, 400, 200), new THREE.MeshStandardMaterial({ color: '#0a0a0c', side: THREE.BackSide, roughness: 1 }));
  env.add(walls);
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(44, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1d0').multiplyScalar(14) }));
  lamp.position.set(0, 0, 25); lamp.rotation.x = Math.PI; env.add(lamp);
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#141216' }));
  floorGlow.position.z = -30; env.add(floorGlow);
  return env;
}

// ---------- sound ----------
const audio = new PoolAudio();
const arcade = new PoolArcade({ scene, camera, feltZ: FELT_Z, audio, spatial, refresh: updateScore,
  context: () => ({ mode: gameMode, attract: attractMode, match, input: interactionMode, difficulty, calledPocket, pockets, seat: online.seat }) });
const computerThoughts = new ComputerThoughts({ scene, camera, feltZ: FELT_Z, settings: () => arcade.hud });
const replay = new ShotReplay();
const replayView = new ReplayView({ scene, exit: () => stopReplay(true) });
const rackResults = new RackResults();
const rackResultsView = new RackResultsView();
let replayingBest = false;
function syncRackResults() {
  if (!attractMode) rackResults.observe(arcade.state, replay.last);
  const free = gameMode === 'free';
  const finished = !attractMode && !activeShot && !arcade.active && !arcade.pending &&
    (free ? pocketed === 15 : match.winner !== null);
  if (finished) {
    let storage; try { storage = localStorage; } catch {}
    const players = gameMode === 'online' ? (online.seat === null ? [] : [online.seat]) :
      gameMode === 'computer' || free ? [0] : [0, 1];
    rackResults.finish(arcade.state, players, storage);
  }
  rackResultsView.update({ finished, free, winner: match.winner,
    names: free ? ['You'] : [0, 1].map(p => playerName(p, gameMode, online.seat)), state: arcade.state,
    results: rackResults, arcade: arcade.hud.enabled, replaying: replayView.active,
    outcome: free ? `Cleared in ${shots} ${shots === 1 ? 'shot' : 'shots'}.` : playerText(match.lastShot || '', gameMode, online.seat) });
  document.getElementById('rematch').hidden = !finished;
  if (gameMode !== 'online') document.getElementById('rematch').textContent = free ? 'Play again' : 'Rematch';
}
function analyticsSettingsNow() {
  return { difficulty: gameMode === 'computer' ? difficulty : 'none', room: environmentId, balls: ballStyle,
    arcade: arcade.hud.enabled ? 'on' : 'off', effects: arcade.hud.reduced ? 'reduced' : 'full',
    sound: window.playful?.mute ? 'off' : 'on', input: interactionMode,
    device: matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop' };
}
const gameplayAnalytics = new GameplayAnalytics({ send: sendGameAnalytics, settings: analyticsSettingsNow, enabled: import.meta.env.PROD });
online.analyticsSettings = analyticsSettingsNow;
let analyticsTimer;
function analyticsPageHide(event) {
  if (event.persisted) { gameplayAnalytics.checkpoint(); gameplayAnalytics.flush(true, true); }
  else gameplayAnalytics.end('page_exit', true);
}
function analyticsVisibility() {
  if (document.hidden) { gameplayAnalytics.checkpoint(); gameplayAnalytics.flush(true, true); }
}

function readReplayPoses() {
  return allBalls().flatMap(ball => {
    const p = ball.body.translation(), q = ball.body.rotation();
    return [Number(ball.mesh.visible), p.x, p.y, p.z, q.x, q.y, q.z, q.w];
  });
}
function beginReplayRecording(input) {
  if (!attractMode) rackResults.begin(`${arcade.categoryNow()}.${gravityActive() ? 'gravity' : 'standard'}`);
  const label = gameMode === 'free' ? `Free Play · ${input === 'fling' ? 'Fling' : 'Cue'}` :
    `${playerName(match.turn, gameMode, online.seat)} · ${match.breaking ? 'Break' : 'Shot'}`;
  replay.begin(physicsTime, allBalls().map(numberOf), readReplayPoses, { label, planetTime: performance.now() / 1000,
    rack: arcade.state?.rack, play: (arcade.state?.lastPlay ?? 0) + 1,
    online: gameMode === 'online' ? { seq: onlineShotSeq, rack: arcade.state?.rack ?? null,
      play: arcade.state?.lastPlay, shots: match.shots, breaker: match.breaker } : null });
}
function canReplay() {
  return !!replay.last && !rackMotion && !dragging && !placing &&
    (gameMode !== 'online' || !activeShot && !online.pending && !online.waiting);
}
function syncReplayButton() {
  const button = document.getElementById('open-replay');
  button.hidden = !replay.last;
  button.disabled = !canReplay();
}
function startReplay(best = false) {
  if (!canReplay() || replayView.active) return;
  const clip = best ? rackResults.clip : replay.last;
  if (!clip) return;
  replayingBest = best;
  if (!computerTurn()) endGesture();
  arcade.effects.clear(); audio.stopArcade(); computerThoughts.clear();
  replayView.start(clip, allBalls().map(ball => ({ number: numberOf(ball), mesh: ball.mesh })));
  if (best) document.getElementById('replay-title').textContent = `Best shot · ${clip.metadata.label}`;
  document.getElementById('replay-close').textContent = best ? 'Back to results' : 'Back to game';
  guide.visible = false; cueStick.visible = false;
  renderer.shadowMap.needsUpdate = true; updateScore();
}
function stopReplay(focus = false) {
  if (!replayView.active) return;
  replayView.stop(); renderer.shadowMap.needsUpdate = true;
  audio.setMuted(!!window.playful?.mute || document.hidden);
  updateScore();
  if (focus) document.getElementById(replayingBest ? 'replay-best' : 'open-replay').focus();
  replayingBest = false;
}
// pan and distance of a table position relative to the camera
function spatial(p) {
  const v = new THREE.Vector3(p.x, p.y, p.z), dist = v.distanceTo(camera.position);
  v.applyMatrix4(camera.matrixWorldInverse);
  const halfW = Math.abs(v.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  return { pan: halfW > 1e-3 ? THREE.MathUtils.clamp(v.x / halfW, -1, 1) : 0, dist };
}
// Collision *start* events only (never the sustained contact with the felt or a neighbour in the rack),
// loudness from the relative speed at impact, rate-limited per pair and overall.
const lastSound = new Map(); let soundBudget = 0, lastBudgetT = 0;
const inWell = new Set();
function drainSounds() {
  const now = performance.now();
  if (now - lastBudgetT > 100) { soundBudget = 4; lastBudgetT = now; }
  const byHandle = new Map(allBalls().map((h) => [h.body.collider(0).handle, h]));
  eventQueue.drainCollisionEvents((a, b, started) => {
    if (!started) return;
    const ha = byHandle.get(a), hb = byHandle.get(b);
    const railBall = cushionHandles.has(a) ? hb : cushionHandles.has(b) ? ha : null;
    // Refereeing is independent of mute, sound budgets, and impact strength.
    if (activeShot) {
      if (ha === cue && hb && activeShot.first === null) activeShot.first = numberOf(hb);
      if (hb === cue && ha && activeShot.first === null) activeShot.first = numberOf(ha);
      if (activeShot.first !== null) {
        if (railBall && !activeShot.rails.includes(numberOf(railBall))) activeShot.rails.push(numberOf(railBall));
      }
    }
    const railId = arcadeRailIds.get(cushionHandles.has(a) ? a : b);
    if (ha && hb) arcade.hit(numberOf(ha), numberOf(hb), beforeMotion.get(numberOf(ha)), beforeMotion.get(numberOf(hb)), dragging?.ball === ha || dragging?.ball === hb, ha.body.linvel(), hb.body.linvel());
    if (railBall) {
      const p = railBall.body.translation();
      arcade.rail(numberOf(railBall), railId, !pockets.some(hole => Math.hypot(p.x - hole.x, p.y - hole.y) < POCKET_R * 2.2));
    }
    if (arcade.effects.enabled && (ha && hb || railBall)) {
      const ball = ha || hb, p = ball.body.translation(), q = hb && ha ? hb.body.translation() : p;
      const va = beforeMotion.get(numberOf(ball)), vb = ha && hb ? beforeMotion.get(numberOf(hb)) : null;
      const strength = Math.hypot((va?.vx || 0) - (vb?.vx || 0), (va?.vy || 0) - (vb?.vy || 0));
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (strength > 1 && p.z > FELT_Z && now - (lastArcadeImpact.get(key) || 0) > 90) {
        arcade.effects.impact({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: BALL_Z }, railBall ? 'rail' : 'ball', strength / 80);
        lastArcadeImpact.set(key, now);
      }
    }
    if (arcade.effects.enabled && !!ha !== !!hb) {
      const ball = ha || hb, p = ball.body.translation(), v = ball.body.linvel();
      const key = `well-${numberOf(ball)}`;
      if (p.z < FELT_Z - 1 && inWell.has(ball) && Math.hypot(v.x, v.y, v.z) > 2 && now - (lastArcadeImpact.get(key) || 0) > 150) {
        const pocket = pockets.reduce((a, b) => Math.hypot(p.x - a.x, p.y - a.y) < Math.hypot(p.x - b.x, p.y - b.y) ? a : b);
        arcade.effects.ring(pocket, '#fff3dc', 1.9, 0.18); lastArcadeImpact.set(key, now);
      }
    }
    if (soundBudget <= 0) return;
    if (feltCol && (a === feltCol.handle || b === feltCol.handle)) return;
    if (!ha && !hb) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (now - (lastSound.get(key) || 0) < 90) return;
    const va = ha ? ha.body.linvel() : { x: 0, y: 0, z: 0 }, vb = hb ? hb.body.linvel() : { x: 0, y: 0, z: 0 };
    const rel = Math.hypot(va.x - vb.x, va.y - vb.y, va.z - vb.z);
    if (rel < 1.0) return;
    const ball = ha || hb, at = spatial(ball.body.translation());
    if (ha && hb) audio.ballBall(rel / 60, at.pan, at.dist);
    else {
      const other = world.getCollider(ha ? b : a);
      if (other && other.translation().z < FELT_Z - 1) {          // pocket well: first contact is the drop, later ones rattle
        if (!inWell.has(ball)) { inWell.add(ball); audio.pocket(rel / 30, at.pan, at.dist); } else audio.rattle(rel / 20, at.pan, at.dist);
      } else audio.cushion(rel / 45, at.pan, at.dist);
    }
    lastSound.set(key, now); soundBudget--;
  });
}

// ---------- aiming ----------
function setInteractionMode(mode) {
  if (mode === 'fling' && gameMode !== 'free') return;
  endGesture();
  interactionMode = mode;
  arcade.modeChanged();
  document.querySelectorAll('#mode button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  document.getElementById('open-spin').hidden = mode !== 'cue';
  updateScore();
}
const onTable = (h) => h.mesh.visible && h.body.isEnabled() && !pocketedSet.has(h) && h.body.translation().z > BALL_Z - 0.5;
const cueReady = () => !rackMotion && onTable(cue) && tableStill() && !activeShot && !arcade.active && !remoteTurn() &&
  (gameMode === 'free' ? pocketed < 15 : (match.winner === null && !match.ballInHand && (!onEight() || calledPocket !== null)));
const onEight = () => !match.breaking && targets(match).length === 1 && targets(match)[0] === 8;
const canCallPocket = () => gameMode !== 'free' && match.winner === null && !match.ballInHand &&
  !rackMotion && !activeShot && !arcade.active && !aiming && !placing && !dragging && !replayView.active && !computerTurn() && !remoteTurn() && onEight();
function ballUnderPointer(e) {
  const balls = allBalls().filter((h) => h.mesh.visible), mesh = meshUnderPointer(e, balls.map((h) => h.mesh));
  const ball = balls.find((h) => h.mesh === mesh);
  return ball && onTable(ball) ? ball : undefined;
}
function cueUnderPointer(e) {
  const hit = ballUnderPointer(e);
  if (hit) return hit === cue; // Never steal a direct hit on another ball.
  const position = new THREE.Vector3().copy(cue.body.translation());
  const center = position.clone().project(camera);
  if (center.z < -1 || center.z > 1) return false;
  const edge = position.clone().add(new THREE.Vector3(R, 0, 0).applyQuaternion(camera.quaternion)).project(camera);
  return withinCueTarget({ x: e.clientX, y: e.clientY },
    { x: (center.x + 1) * innerWidth / 2, y: (1 - center.y) * innerHeight / 2 },
    Math.abs(edge.x - center.x) * innerWidth / 2, e.pointerType === 'touch');
}
function dragTarget(e) {
  const p = pointerToPlane(e, BALL_Z).add(dragging.offset);
  // Keep the target inside the table surround; balls still collide with the cushions and pocket jaws.
  p.x = THREE.MathUtils.clamp(p.x, -HW, HW); p.y = THREE.MathUtils.clamp(p.y, -HH, HH);
  return p;
}
// The ball's target stops at the rails; the mouse does not. Measure the gesture before that clamp.
const sampleDrag = (e) => pushSample(dragging.samples, { x: e.clientX, y: e.clientY, t: e.timeStamp });
function flingOnTable(ball, velocity) {
  // Convert screen velocity at the ball to table velocity. Using the ball as the projection anchor
  // also works when the mouse has crossed the horizon and its ray no longer meets the felt.
  const p = ball.body.translation();
  const origin = new THREE.Vector3(p.x, p.y, BALL_Z), ndc = origin.clone().project(camera);
  const anchor = { clientX: (ndc.x + 1) * innerWidth / 2, clientY: (1 - ndc.y) * innerHeight / 2 };
  const dx = pointerToPlane({ ...anchor, clientX: anchor.clientX + 1 }, BALL_Z).sub(origin);
  const dy = pointerToPlane({ ...anchor, clientY: anchor.clientY + 1 }, BALL_Z).sub(origin);
  return limitFling(dx.x * velocity.x + dy.x * velocity.y, dx.y * velocity.x + dy.y * velocity.y);
}
function limitFling(x, y) {
  const scale = Math.min(1, MAX_SPEED / (Math.hypot(x, y) || 1));
  return { x: x * scale, y: y * scale };
}
function moveBall(body, velocity) {
  body.setLinvel({ ...velocity, z: body.linvel().z }, true);
  body.setAngvel({ x: -velocity.y / R, y: velocity.x / R, z: 0 }, true);
}
function endDrag(fling = false) {
  if (!dragging) return;
  const { ball, samples } = dragging;
  const velocity = fling ? flingOnTable(ball, flingVelocity(samples)) : { x: 0, y: 0 };
  moveBall(ball.body, velocity);
  if (fling && onTable(ball) && Math.hypot(velocity.x, velocity.y) > 0.3) {
    beginReplayRecording('fling');
    arcade.time = physicsTime; arcade.begin('fling', numberOf(ball), ball.body.translation()); shots++;
    gameplayAnalytics.shot();
  } else if (fling) arcade.effects.ring(ball.body.translation(), undefined, 1.6, 0.25);
  dragging = null; controls.enabled = true; updateGestureControls();
}
function updateGestureControls() {
  document.getElementById('hud').classList.toggle('aiming', !!aiming && !computerTurn());
  document.querySelector('.guidance').setAttribute('aria-live', aiming && !computerTurn() ? 'off' : 'polite');
  document.getElementById('cancel-gesture').hidden = !(placing || dragging || (aiming && !computerTurn()));
  syncReplayButton();
}
function endGesture() {
  if (calling) { calling = null; controls.enabled = true; }
  cancelPlacement(); endDrag(); endAim();
  if (refitPending) refitView();
}
// Re-frame for a viewport that really changed. Deferred out of gestures by resize(), so it also
// runs from endGesture(); either way it advances the baseline only once the change is handled.
function refitView() {
  refitPending = false;
  if (!controls) return;   // reachable from endGesture() during teardown, when resetView() would throw
  const shape = viewShape(innerWidth, innerHeight), before = viewShape(lastViewport.w, lastViewport.h);
  lastViewport = { w: innerWidth, h: innerHeight };
  if (overhead) fitOverhead();
  else if (shape !== before) resetView();
  else if (attractMode) frameAttract();
  else camera.clearViewOffset();
}
function updateDrag() {
  if (!dragging) return;
  const { ball, to } = dragging;
  if (!onTable(ball)) { endDrag(); return; }
  const p = ball.body.translation();
  // Drive a dynamic ball toward the mouse so normal collisions remain active while dragging.
  moveBall(ball.body, limitFling((to.x - p.x) * 45, (to.y - p.y) * 45));
}
function showGameControls(show) {
  document.getElementById('vignette').hidden = !show;
  document.getElementById('hud').hidden = !show;
  const styleEl = document.getElementById('style'); styleEl.hidden = !show;
  buildBallSetPicker(setBallStyle, setPlanetSaturation);
  setPlanetSaturation(planetSaturation);
  updateBallSetPicker(ballStyle, null);
  if (!spinEl) {
    spinEl = document.getElementById('spin');
    spinEl.addEventListener('pointerdown', (e) => {
      const r = spinEl.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 2 - 1, y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      setSpin(x, y);
      e.stopPropagation();
    });
    spinEl.addEventListener('keydown', (e) => {
      const offsets = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] };
      if (e.key === 'Home') { e.preventDefault(); setSpin(0, 0); }
      else if (offsets[e.key]) { e.preventDefault(); const [x, y] = offsets[e.key]; setSpin(spin.x + x, spin.y + y); }
    });
    document.getElementById('reset-spin').addEventListener('click', () => setSpin(0, 0));
  }
  const modeEl = document.getElementById('mode'); modeEl.hidden = !show;
  const games = document.getElementById('game-mode');
  if (!games.dataset.wired) {
    games.dataset.wired = '1';
    games.querySelectorAll('button').forEach(b => b.addEventListener('click', () => startGame(b.dataset.game)));
    document.getElementById('online-retry').addEventListener('click', () => { if (online.id) online.join(online.id); else void online.create(); });
    document.getElementById('copy-invite').addEventListener('click', async () => {
      const field = document.getElementById('invite-link');
      try { await navigator.clipboard.writeText(field.value); document.getElementById('online-status').textContent = 'Invite link copied. Send it to your friend.'; }
      catch { field.focus(); field.select(); document.getElementById('online-status').textContent = 'Select and copy this invite link.'; }
    });
    document.querySelectorAll('#difficulty button').forEach(b => b.addEventListener('click', () => {
      difficulty = b.dataset.difficulty;
      gameplayAnalytics.settingsChanged();
      arcade.modeChanged();
      document.querySelectorAll('#difficulty button').forEach(o => o.setAttribute('aria-pressed', String(o.dataset.difficulty === difficulty)));
      if (computerTurn() && !activeShot) { cancelComputerSearch(); computerPlan = null; computerWait = 0; endAim(); }
    }));
    document.getElementById('black-hole-gravity-toggle').addEventListener('click', () => {
      if (!canChangeGravity()) return;
      gravityEnabled = !gravityEnabled;
      cancelComputerSearch(); computerPlan = null; computerWait = 0; endGesture();
      updateScore();
    });
    document.getElementById('overhead-view').addEventListener('click', overheadView);
    document.getElementById('open-replay').addEventListener('click', () => startReplay());
    document.getElementById('replay-best').addEventListener('click', () => startReplay(true));
    document.getElementById('rematch').addEventListener('click', restart);
    document.querySelectorAll('#table-pockets button').forEach(b => b.addEventListener('click', () => {
      selectPocket(Number(b.dataset.pocket));
    }));
  }
  wireOnce(modeEl, (b) => setInteractionMode(b.dataset.mode));
  if (show) setInteractionMode(interactionMode);
}
function setSpin(x, y) {
  const len = Math.hypot(x, y), scale = len > 0.7 ? 0.7 / len : 1;
  spin = { x: x * scale, y: y * scale };
  document.getElementById('open-spin').dataset.active = String(Math.hypot(spin.x, spin.y) > 0.01);
  const dot = spinEl.querySelector('.dot');
  dot.style.left = `${50 + spin.x * 50}%`; dot.style.top = `${50 - spin.y * 50}%`;
  const bead = document.querySelector('#open-spin .spin-bead');
  if (bead) { bead.style.setProperty('--sx', spin.x); bead.style.setProperty('--sy', spin.y); }
  const caption = document.querySelector('.spin-caption');
  if (caption) caption.textContent = spinName(spin);
}

// Name the contact point, so the choice reads back in words as well as a dot.
function spinName({ x, y }) {
  const vertical = y > 0.15 ? 'Top' : y < -0.15 ? 'Bottom' : '';
  const side = x > 0.15 ? 'right' : x < -0.15 ? 'left' : '';
  if (vertical && side) return `${vertical} ${side}`;
  if (vertical) return vertical;
  if (side) return `${side[0].toUpperCase()}${side.slice(1)}`;
  return 'Center ball';   // American, like the rest of the copy ("Home centers")
}
function wireOnce(group, onClick) {
  if (group.dataset.wired) return;
  group.dataset.wired = '1'; group.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onClick(b)));
}
function aimVector() {
  const c = cue.body.translation(), d = new THREE.Vector2(c.x - aiming.to.x, c.y - aiming.to.y);
  return { c, dir: d.lengthSq() ? d.clone().normalize() : new THREE.Vector2(1, 0), pull: Math.min(d.length(), MAX_PULL) };
}
const ballShape = new RAPIER.Ball(R);
// Both players project the same guide from the shared table and aim direction.
// Rendering a remote preview must not send it back or change the spectator's HUD.
function updateGuide(c, dir) {
  // Cast a ball along the aim line. The felt is excluded: the resting ball already touches it, and its triangle
  // edges otherwise register as hits in the middle of the table.
  const hit = world.castShape({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: dir.x, y: dir.y, z: 0 }, ballShape, 0, 200, false,
    undefined, undefined, feltCol, cue.body);
  const dist = hit ? hit.time_of_impact : 200;
  const end = new THREE.Vector3(c.x + dir.x * dist, c.y + dir.y * dist, c.z);
  setGuideLine(guide.line, new THREE.Vector3(c.x, c.y, c.z), end);
  guide.ghost.position.copy(end); guide.ghost.visible = !!hit;
  guide.objLine.visible = false; guide.cueLine.visible = false;
  if (hit) {
    const other = allBalls().find((h) => h.mesh.visible && h.body.collider(0).handle === hit.collider.handle);
    if (other) {   // object ball leaves along the line of centres; a stunned cue ball leaves along the tangent
      const o = other.body.translation(), n = new THREE.Vector3(o.x - end.x, o.y - end.y, 0).normalize();
      setGuideLine(guide.objLine, new THREE.Vector3(o.x, o.y, o.z), new THREE.Vector3(o.x + n.x * 12, o.y + n.y * 12, o.z));
      guide.objLine.visible = true;
      const d3 = new THREE.Vector3(dir.x, dir.y, 0), tangent = d3.clone().sub(n.clone().multiplyScalar(d3.dot(n)));
      if (tangent.length() > 0.05) {
        tangent.normalize();
        setGuideLine(guide.cueLine, end, end.clone().add(tangent.multiplyScalar(7)));
        guide.cueLine.visible = true;
      }
    }
  }
}
function updateAim() {
  const { c, dir, pull } = aimVector();
  updateGuide(c, dir);
  updateCueStick(c, dir, pull, spin);
  if (gameMode === 'online') online.sendAim({ dir: { x: dir.x, y: dir.y }, pull, spin });
  const txt = `Power ${Math.round((pull / MAX_PULL) * 100)}%${spin.x || spin.y ? ' · spin applied' : ''}`;
  if (!computerTurn() && txt !== lastStatus) { lastStatus = txt; ui.status(txt); }
}
function updateCueStick(c, dir, pull, spin) {
  // cue stick behind the ball, pulled back with the power, slightly elevated
  const h = cueStick.holder, right = new THREE.Vector2(dir.y, -dir.x);   // shooter's right-hand side
  h.position.set(c.x - dir.x * (R + 0.5 + pull * 0.6) + right.x * spin.x * R * 0.7, c.y - dir.y * (R + 0.5 + pull * 0.6) + right.y * spin.x * R * 0.7, BALL_Z + 0.15 + spin.y * R * 0.7);
  // Elevate the cue so the butt clears the rail behind the ball: find how far back the nearest cushion line is
  // along the stick, and pitch the stick so it is above the rail top there (a player's cue over the rail).
  const railDist = (() => { let d = Infinity; if (dir.x > 1e-6) d = Math.min(d, (c.x + HW) / dir.x); if (dir.x < -1e-6) d = Math.min(d, (c.x - HW) / dir.x); if (dir.y > 1e-6) d = Math.min(d, (c.y + HH) / dir.y); if (dir.y < -1e-6) d = Math.min(d, (c.y - HH) / dir.y); return Math.max(d, 1); })();
  const tipZ = 0.15 + spin.y * R * 0.7, railClear = RAIL_H + 0.9 - (R + tipZ) + 0.4;   // rise needed above the tip at the rail
  const elevation = THREE.MathUtils.clamp(Math.atan2(railClear, railDist + RAIL_W), THREE.MathUtils.degToRad(5), THREE.MathUtils.degToRad(40));
  h.rotation.set(0, elevation, Math.atan2(dir.y, dir.x), 'ZYX');   // aim about the table normal first, then pitch the butt up
}
function tableStill() {
  return allBalls().every((h) => {
    if (!h.mesh.visible || !h.body.isEnabled() || h.body.translation().z < FELT_Z - 1.5) return true;   // hidden, or down a pocket
    const v = h.body.linvel(); return Math.hypot(v.x, v.y, v.z) < 0.3;
  });
}
let pocketTargets = [], pocketCallView = '';
function selectPocket(pocket) {
  if (!canCallPocket()) return;
  calledPocket = pocket; updateScore();
}
function layoutTablePockets() {
  const available = canCallPocket(), root = document.getElementById('table-pockets');
  root.hidden = !available;
  if (!available && calledPocket === null) { pocketTargets = []; return; }
  pocketTargets = projectPocketTargets(pockets, camera, innerWidth, innerHeight, FELT_Z + RAIL_H, POCKET_R);
  for (const button of root.querySelectorAll('button')) {
    const target = pocketTargets[Number(button.dataset.pocket)];
    button.hidden = !target.visible;
    button.style.left = `${target.x}px`; button.style.top = `${target.y}px`;
    button.style.width = button.style.height = `${target.radius * 2}px`;
    button.setAttribute('aria-label', target.name);
    button.setAttribute('aria-pressed', String(target.pocket === calledPocket));
    button.disabled = !available;
  }
}
function syncPocketCall() {
  layoutTablePockets();
  const available = canCallPocket(), chosen = calledPocket !== null;
  // Fit once when a call becomes due (or the viewport changes), not while the
  // player deliberately orbits, aims, or changes their selected pocket.
  if (!onEight() || activeShot || rackMotion || match.winner !== null) pocketCallView = '';
  const view = `${gameMode}:${match.turn}:${match.shots}:${innerWidth}:${innerHeight}`;
  if (available && view !== pocketCallView) {
    pocketCallView = view;
    const top = document.querySelector('.topbar').getBoundingClientRect().bottom;
    const bottom = document.querySelector('.bottom-hud').getBoundingClientRect();
    if (pocketTargets.some(p => !p.visible || p.x - p.radius < 0 || p.x + p.radius > innerWidth ||
      p.y - p.radius < top || p.y + p.radius > innerHeight ||
      p.y + p.radius > bottom.top && p.x + p.radius > bottom.left && p.x - p.radius < bottom.right)) {
      overhead = true; fitOverhead(); layoutTablePockets();
    }
  }
  // Camera movement can rename a called pocket without changing the match.
  const detail = chosen ? `Called: ${pocketTargets[calledPocket]?.name}` : '8-ball · tap a highlighted pocket';
  if (available && document.getElementById('hint').textContent !== detail) updateTurnStatus();
}

function canChangeGravity() {
  return gameMode !== 'online' && !rackMotion && !activeShot && !arcade.active &&
    !replayView.active && !dragging && !placing && tableStill();
}
function syncGravityToggle() {
  const toggle = document.getElementById('black-hole-gravity-toggle');
  toggle.setAttribute('aria-pressed', String(gravityActive()));
  toggle.disabled = !canChangeGravity();
  document.getElementById('black-hole-gravity-online').hidden = gameMode !== 'online';
}
function updateScore() {
  gameplayAnalytics.settingsChanged();
  syncGravityToggle();
  updateGestureControls();
  document.getElementById('pocketed-count').textContent = pocketed;
  document.getElementById('shot-count').textContent = shots;
  const free = gameMode === 'free';
  document.getElementById('online-panel').hidden = gameMode !== 'online';
  document.getElementById('rerack').hidden = gameMode === 'online';
  document.getElementById('difficulty-group').hidden = gameMode !== 'computer';
  document.querySelectorAll('#game-mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.game === gameMode)));
  document.getElementById('free-score').hidden = !free;
  document.getElementById('match-score').hidden = free;
  document.getElementById('interaction-group').hidden = !free;
  document.getElementById('rerack').textContent = free ? 'Re-rack ↻' : 'New rack ↻';
  syncRackResults();
  syncPocketCall();
  document.getElementById('open-spin').hidden = !!rackMotion || interactionMode !== 'cue' || !!activeShot || computerTurn() || remoteTurn() || (free ? pocketed === 15 : match.winner !== null);
  if (!free) for (let i = 0; i < 2; i++) {
    const card = document.getElementById(`player-${i}`);
    card.classList.toggle('active', match.winner === null && match.turn === i);
    card.classList.toggle('winner', match.winner === i);
    card.querySelector('.player-name').textContent = playerName(i, gameMode, online.seat);
    card.querySelector('.rack-wins').textContent = match.wins[i];
    card.querySelector('.rack-wins').setAttribute('aria-label', `${match.wins[i]} racks won`);
    card.querySelector('.player-group').textContent = groupLabel(match.groups[i], match.down);
    const numbers = match.groups[i] ? groupBalls(match.groups[i]) : [];
    card.querySelector('.remaining-balls').replaceChildren(...numbers.map(n => {
      const chip = document.createElement('span');
      const digit = document.createElement('span'); digit.textContent = n; chip.append(digit);
      chip.style.setProperty('--ball-color', BALL_COLORS[((n - 1) % 8) + 1]);
      chip.className = `ball-chip${n > 8 ? ' stripe' : ''}${match.down.includes(n) ? ' down' : ''}`;
      if (ballStyle === 'planets') { chip.classList.add('planet-chip'); chip.style.setProperty('--planet-map', n === 8 ? 'radial-gradient(circle, #000 40%, #ffc078 48%, #5c2910 61%, #000 72%)' : `url(/planets/${planetForBall(n).id}.jpg)`); }
      chip.title = `${n}${ballStyle === 'planets' ? ` · ${planetForBall(n).name}` : ''}${match.down.includes(n) ? ' pocketed' : ' remaining'}`;
      chip.setAttribute('aria-label', chip.title);
      return chip;
    }));
  }
  const lastShot = free ? '' : playerText(match.lastShot || '', gameMode, online.seat);
  const arcadeVisible = arcade.update();
  document.getElementById('shot-result').hidden = !lastShot && !arcadeVisible;
  const resultText = document.getElementById('shot-result-text');
  if (resultText.textContent !== lastShot) resultText.textContent = lastShot;
  const summary = document.getElementById('open-match');
  const scoreText = free ? `${pocketed} / 15 · ${shots} shots` :
    [0, 1].map(i => `${playerName(i, gameMode, online.seat)} ${match.wins[i]}`).join(' · ');
  document.getElementById('match-summary-text').textContent = scoreText;
  summary.setAttribute('aria-label', `${free ? 'Game' : 'Match'} details: ${scoreText}`);
  updateTurnStatus();
  if (overhead && !aiming) fitOverhead();
}
function updateTurnStatus() {
  const free = gameMode === 'free';
  const roomUnavailable = gameMode === 'online' && (!online.synced || !online.connected.every(Boolean));
  let connection = '';
  if (roomUnavailable) {
    const text = document.getElementById('online-status').textContent;
    connection = online.synced ? 'Waiting for your friend' :
      /^(Creating|Joining)/.test(text) ? 'Connecting…' : 'Connection interrupted';
  }
  const pocketName = calledPocket === null ? '' :
    pocketTargets[calledPocket]?.name;
  const state = free ? {
    title: rackMotion ? 'Racking…' : pocketed === 15 ? 'Table cleared!' : 'Free Play',
    detail: rackMotion || pocketed === 15 ? '' : interactionMode === 'fling' ? 'Drag a ball to fling or place it' :
      cueLearned ? '' : 'Pull back from the cue ball. Release to shoot.',
    active: false,
  } : turnStatus({ match, mode: gameMode, seat: online.seat, racking: !!rackMotion,
    shooting: !!activeShot, pending: gameMode === 'online' && online.pending,
    waiting: gameMode === 'online' && online.waiting,
    connection, canCall: canCallPocket(), pocketName });
  const panel = document.querySelector('.turn-controls');
  panel.dataset.active = String(state.active);
  const room = document.getElementById('open-room');
  room.hidden = gameMode !== 'online' || (!roomUnavailable && !online.error);
  room.textContent = online.synced && !online.connected.every(Boolean) ? 'Invite' : 'Room';
  // Aiming power is local feedback. Presence and score updates must not replace it.
  if (aiming && !computerTurn()) { lastStatus = ''; updateAim(); return; }
  lastStatus = '';
  if (document.getElementById('status').textContent !== state.title) ui.status(state.title);
  if (document.getElementById('hint').textContent !== state.detail) ui.hint(state.detail);
}
function overheadView() {
  endGesture(); overhead = true; fitOverhead();
}
function fitOverhead() {
  if (!controls) return;
  const short = innerWidth > innerHeight && innerHeight <= 600;
  const header = document.querySelector('.topbar').getBoundingClientRect();
  const hud = document.querySelector('.bottom-hud').getBoundingClientRect();
  const top = header.bottom + 12;
  const bottom = short ? 12 : innerHeight - hud.top + 12;
  const left = 12, right = short ? innerWidth - hud.left + 12 : 12;
  setOverheadCamera(camera, controls, {
    width: innerWidth, height: innerHeight,
    halfWidth: HW + CUSH + RAIL_W + 0.5, halfHeight: HH + CUSH + RAIL_W + 0.5,
    surfaceZ: FELT_Z + RAIL_H + 0.5, top, bottom, left, right,
  });
}
function setAttract(active) {
  if (active) gameplayAnalytics.select(null);
  if (attractMode && !active) camera.clearViewOffset();
  attractMode = active; attractWait = 0;
  // DOM labels must live in the dialog's top layer while the demo is showing.
  const parent = active ? document.getElementById('welcome') : document.body;
  if (active) { arcade.effects.ensure(); computerThoughts.ensure(); resetView(); }
  for (const element of [arcade.effects.overlay, computerThoughts.label]) if (element) parent.append(element);
  if (!active && controls) controls.autoRotate = false;
}
function startGame(mode, roomId = null) {
  if (!attractMode && !roomId && shots && (gameMode === 'free' || match.winner === null) && !window.confirm('Start a new game and clear this rack?')) return false;
  gameplayAnalytics.select(mode);
  setAttract(false);
  stopReplay(); replay.reset();
  online.leave(); history.replaceState(null, '', location.pathname);
  gameMode = mode;
  arcade.onlineCreating = mode === 'online' && !roomId;
  document.getElementById('rematch').disabled = false; document.getElementById('rematch').textContent = 'Rematch'; match = newMatch(); layout(mode !== 'online' || !roomId);
  if (mode === 'online') { if (roomId) online.join(roomId); else void online.create(); }
  setInteractionMode('cue');
  return true;
}
function joinInvite() {
  const roomId = /^#room=([0-9a-f-]{36})$/.exec(location.hash)?.[1];
  if (roomId && (gameMode !== 'online' || online.id !== roomId)) startGame('online', roomId);
}
function restart() {
  if (gameMode === 'online') { if (match.winner !== null) online.send('rematch'); return; }
  if (gameMode !== 'free' && match.winner === null && shots && !window.confirm('Restart this rack?')) return;
  gameplayAnalytics.end('restart'); gameplayAnalytics.select(gameMode);
  match = newMatch(match.winner === null ? match.breaker : 1 - match.breaker, match.wins); layout();
}
function validPlacement(p, ball = cue) {
  return canPlace(p, tablePositions(), numberOf(ball));
}
function findSpot(ball, preferredX) {
  for (let radius = 0; radius < HW * 2; radius += R * 2.1) {
    for (let a = 0; a < (radius ? 32 : 1); a++) {
      const p = { x: preferredX + Math.cos(a * Math.PI / 16) * radius, y: Math.sin(a * Math.PI / 16) * radius };
      if (validPlacement(p, ball)) return p;
    }
  }
  throw new Error('No free position on table');
}
function respot(ball, preferredX) {
  const p = findSpot(ball, preferredX);
  pocketedSet.delete(ball); belowSince.delete(ball); inWell.delete(ball);
  ball.body.setEnabled(true); ball.mesh.visible = true; spot(ball, p.x, p.y, rackRot(ball));
  arcade.effects.ring(p, undefined, 2.2, 0.3);
}
function cancelPlacement() {
  if (!placing) return;
  const original = placing.original; placing = null;
  cue.body.setEnabled(true); spot(cue, original.x, original.y, IDENTITY);
  if (controls) controls.enabled = true;
  updateGestureControls();
}
function movePlacement(e) {
  const p = pointerToPlane(e, BALL_Z);
  placing.target = p; placing.valid = validPlacement(p);
  if (placing.valid) {
    cue.body.setTranslation({ x: p.x, y: p.y, z: BALL_Z }, false);
    cue.mesh.position.set(p.x, p.y, BALL_Z);
  }
}
function finishPlacement() {
  if (!placing) return;
  if (!placing.valid) { cancelPlacement(); ui.hint('Choose a clear spot inside the cushions'); return; }
  const p = placing.target;
  if (gameMode === 'online') { cancelPlacement(); online.send('place', { position: { x: p.x, y: p.y } }); updateTurnStatus(); return; }
  placing = null;
  cue.body.setEnabled(true); spot(cue, p.x, p.y, IDENTITY); controls.enabled = true;
  arcade.effects.ring(p, undefined, 2.2, 0.3);
  match = { ...match, ballInHand: false, message: `Player ${match.turn + 1}: cue ball placed. Take your shot.` }; updateScore();
}
function settleShot(dt) {
  if (!activeShot) return;
  settledFor = tableStill() && !belowSince.size ? settledFor + dt : 0;
  if (settledFor < 0.25) return;
  // Freeze the tiny residual drift before switching players or granting ball-in-hand.
  for (const ball of allBalls()) if (!pocketedSet.has(ball)) {
    ball.body.setLinvel({ x: 0, y: 0, z: 0 }, true); ball.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
  const completed = activeShot;
  replay.finish(physicsTime, readReplayPoses, gameMode === 'online');
  activeShot = null; calledPocket = null; settledFor = 0;
  const result = attractMode ? resolveSoloShot(match, completed) : resolveShot(match, completed);
  completed.arcade = arcade.finish(completed, result);
  // Both clients animate the shot; only the shooter prepares a result for the server.
  if (gameMode === 'online' && online.seat !== onlineShooter) { updateScore(); return; }
  if (gameMode !== 'online') match = result.state;
  if (!attractMode && gameMode !== 'online' && match.winner !== null) {
    const outcome = gameMode === 'computer' ? (match.winner === 0 ? 'player' : 'computer') : `player${match.winner + 1}`;
    gameplayAnalytics.finish(outcome, arcade.state?.totals.reduce((sum, n) => sum + n, 0) || 0);
  }
  if (result.rerack) {
    if (gameMode === 'online') { sendOnlineResult(completed); updateScore(); return; }
    layout(); return;
  }
  for (const n of result.respot) respot(allBalls().find(b => numberOf(b) === n), HW * 0.5);
  if (result.state.ballInHand) respot(cue, -HW * 0.5);
  if (gameMode === 'online') sendOnlineResult(completed);
  else pocketed = match.down.length;
  setSpin(0, 0); updateScore();
}
function endAim() {
  if (gameMode === 'online') online.sendAim(null);
  aiming = null; guide.visible = false; cueStick.visible = false; if (controls) controls.enabled = true;
  updateScore();
}
function shoot() {
  const { dir, pull } = aimVector();
  if (pull < 0.3) return;
  if (!takeShot(dir, pull * SPEED_PER_PULL, spin)) return;
  // Learn from the player's completed gesture, never from a computer or remote shot.
  if (!cueLearned) {
    cueLearned = true;
    try { localStorage.setItem(CUE_LEARNED, '1'); } catch {}
  }
}
function takeShot(dir, speed, shotSpin = { x: 0, y: 0 }, fromRoom = false) {
  computerThoughts.clear();
  // An accepted online shot takes precedence over a device's setup animation.
  finishRack(false);
  if (gameMode === 'online' && !fromRoom) {
    return online.send('shoot', { action: { dir: { x: dir.x, y: dir.y }, speed, spin: shotSpin, calledPocket } });
  }
  const c = cue.body.translation();
  beginReplayRecording('cue');
  if (gameMode !== 'free') { activeShot = shotRecord(calledPocket); settledFor = 0; }
  arcade.time = physicsTime; arcade.begin('cue', 0, c);
  strike(cue.body, dir, speed, shotSpin);
  shots++;
  if (!attractMode && gameMode !== 'online') gameplayAnalytics.shot();
  const at = spatial(c); audio.cueTip(speed / MAX_SPEED, at.pan, at.dist);
  return true;
}

function tablePositions() {
  return allBalls().filter(b => !pocketedSet.has(b)).map(b => ({ number: numberOf(b), ...b.body.translation() }));
}
function cancelComputerSearch() {
  computerWorker?.terminate(); computerWorker = null;
  computerThoughts.clear();
}
function prepareComputerPlan(plan) {
  if (match.ballInHand) {
    const position = plan.position || computerPlacement(tablePositions(), match, validPlacement) || findSpot(cue, -HW * 0.5);
    spot(cue, position.x, position.y, IDENTITY); match = { ...match, ballInHand: false };
  }
  computerPlan = plan; computerWait = 0; calledPocket = plan.pocket;
  computerThoughts.choose(plan, tablePositions());
  const c = cue.body.translation(), pull = plan.speed / SPEED_PER_PULL;
  setSpin(plan.spin?.x || 0, plan.spin?.y || 0);
  aiming = { to: new THREE.Vector3(c.x - plan.dir.x * pull, c.y - plan.dir.y * pull, BALL_Z) };
  guide.visible = true; cueStick.visible = true; updateScore();
}
function updateComputer(dt) {
  if (rackMotion) return;
  if (!computerTurn() || activeShot || !tableStill()) { computerWait = 0; return; }
  if (computerWorker) return;
  if (!computerPlan) {
    if (attractMode || gravityActive() || difficulty === 'hard' || difficulty === 'tricky') {
      const worker = new Worker(new URL('./computer-worker.js', import.meta.url), { type: 'module' });
      computerWorker = worker;
      const fallback = () => {
        if (computerWorker !== worker) return;
        cancelComputerSearch();
        if (match.ballInHand) {
          const position = computerPlacement(tablePositions(), match, validPlacement) || findSpot(cue, -HW * 0.5);
          spot(cue, position.x, position.y, IDENTITY); match = { ...match, ballInHand: false };
        }
        prepareComputerPlan(computerShot(tablePositions(), match, 'hard'));
      };
      worker.onmessage = ({ data }) => {
        if (computerWorker !== worker) return;
        if (data.preview) { computerThoughts.show(data.preview); return; }
        if (data.error) { console.error('Computer search:', data.error); fallback(); return; }
        cancelComputerSearch(); prepareComputerPlan(data.shot);
      };
      worker.onerror = fallback;
      worker.postMessage({ difficulty: attractMode ? 'tricky' : difficulty, solo: attractMode, arcade: structuredClone(arcade.state), balls: tablePositions(), state: structuredClone(match), previews: arcade.hud.enabled, table: {
        snapshot: world.takeSnapshot(), feltZ: FELT_Z, cushions: [...cushionHandles], blackHoleGravity: gravityActive(),
        handles: allBalls().filter(b => !pocketedSet.has(b)).map(b => ({ number: numberOf(b), handle: b.body.handle })),
      } });
      updateScore(); return;
    }
    if (match.ballInHand) {
      const position = computerPlacement(tablePositions(), match, validPlacement) || findSpot(cue, -HW * 0.5);
      spot(cue, position.x, position.y, IDENTITY); match = { ...match, ballInHand: false };
    }
    prepareComputerPlan(computerShot(tablePositions(), match, difficulty));
    return;
  }
  // Planning begins as soon as the table settles. Only the brief cue windup
  // remains; it has the same duration with Arcade on or off.
  computerWait += dt;
  if (computerWait < COMPUTER_CUE_TIME) return;
  const plan = computerPlan; computerPlan = null; computerWait = 0;
  takeShot(plan.dir, plan.speed, plan.spin); endAim();
}

function sendOnlineResult(report) {
  if (online.seat === onlineShooter && onlineShotSeq === online.seq) online.submitResult({ report, balls: tablePositions() });
}
function applyOnlineSnapshot(snapshot) {
  finishRack(false);
  endGesture(); activeShot = null; computerPlan = null; settledFor = 0; calledPocket = null;
  belowSince.clear(); inWell.clear(); respotAt = 0; pocketedSet.clear();
  eventQueue.drainCollisionEvents(() => {});
  match = snapshot.match; shots = match.shots; pocketed = match.down.length;
  for (const ball of allBalls()) {
    const p = snapshot.balls.find(b => b.number === numberOf(ball));
    if (p) { ball.body.setEnabled(true); ball.mesh.visible = true; spot(ball, p.x, p.y, rackRot(ball)); }
    else { pocketedSet.add(ball); hideHead(ball); }
  }
  updateScore();
}
function receiveOnline(data) {
  if (gameMode !== 'online') return;
  if (data.type === 'presence') {
    if (remoteTurn()) endGesture();
    updateScore(); return;
  }
  if (data.type !== 'state' && data.type !== 'shot') return;
  // A resync during the same shot preserves the running simulation.
  if (data.pending && onlineShotSeq === data.seq) return;
  stopReplay();
  // Only accepted room results become replayable. Rollbacks and rejected shots
  // keep the previous replay, and an incoming shot always returns us to live play.
  const origins = rackOrigins();
  const newRack = arcade.syncOnline(data.snapshot);
  if (newRack && replay.recording) replay.finish(physicsTime, readReplayPoses, true);
  applyOnlineSnapshot(data.snapshot);
  // A slower spectator may receive acceptance before its simulation settles.
  // Include the accepted end pose, just as the live table displays it.
  if (replay.recording) replay.finish(physicsTime, readReplayPoses, true);
  replay.resolveOnline(data); syncReplayButton(); syncRackResults();
  if (newRack && !data.pending) { beginRack(origins, data.snapshot.balls); updateScore(); }
  document.getElementById('rematch').disabled = data.votes?.includes(online.seat) ?? false;
  document.getElementById('rematch').textContent = data.votes?.includes(online.seat) ? 'Waiting for your friend…' : data.votes?.length ? 'Accept rematch' : 'Rematch';
  if (data.pending) {
    onlineShotSeq = data.seq; onlineShooter = data.pending.seat;
    calledPocket = data.pending.action.calledPocket;
    const { dir, speed, spin } = data.pending.action;
    takeShot(dir, speed, spin, true); updateScore();
  } else { onlineShotSeq = null; onlineShooter = null; }
}

// ---------- per-step physics extras ----------
function rollingResistance(dt) {
  const balls = allBalls().filter(h => h.mesh.visible), bodies = balls.map(h => h.body);
  feltExtras(bodies, dt, BALL_Z);
  if (gravityActive()) blackHoleGravity(bodies, balls.find(b => numberOf(b) === 8)?.body, dt, BALL_Z);
}
// A ball that has been below the felt for a moment is pocketed, whatever it is still doing down in the well
// (a ball can roll around the well for a long time, and a wedged ball never settles). A ball resting beyond the
// cushion line (it jumped the cushion and sits under the rail) counts the same: off the table. Object balls are
// hidden shortly after; a scratched cue is respotted.
const belowSince = new Map();
function collectPocketed() {
  const now = physicsTime;
  for (const h of allBalls()) {
    if (!h.mesh.visible || pocketedSet.has(h) || placing?.ball === h) continue;
    const t = h.body.translation();
    const below = t.z < FELT_Z - 1.5, outside = Math.abs(t.x) > HW + CUSH || Math.abs(t.y) > HH + CUSH;
    if (below || outside) {
      if (!belowSince.has(h)) belowSince.set(h, now);
      if (now - belowSince.get(h) > 0.6) {
        pocketedSet.add(h); belowSince.delete(h);
        let pocket = 0;
        pockets.forEach((p, i) => { if (Math.hypot(t.x - p.x, t.y - p.y) < Math.hypot(t.x - pockets[pocket].x, t.y - pockets[pocket].y)) pocket = i; });
        if (activeShot) {
          if (below) {
            activeShot.pocketed.push({ number: numberOf(h), pocket });
          } else activeShot.offTable.push(numberOf(h));
        }
        arcade.pocket(numberOf(h), pocket, below ? pockets[pocket] : { x: THREE.MathUtils.clamp(t.x, -HW, HW), y: THREE.MathUtils.clamp(t.y, -HH, HH) }, !below);
        // No delayed hide callback: a re-rack can safely revive every ball immediately.
        hideHead(h);
        if (h === cue && gameMode === 'free') respotAt = now + 0.6;
        else if (h !== cue) { pocketed++; updateScore(); }
      }
    } else belowSince.delete(h);
  }
  if (respotAt && now > respotAt) { respotAt = 0; respot(cue, -HW * 0.5); }
}

export default {
  name: 'pool', label: 'Astra Pool',
  // 480 Hz: Rapier's contact model loses restitution on slow impacts at coarse steps (see physics/validate.mjs);
  // at 480 Hz a 0.95 ball reads 0.91-0.95 across the speed range instead of 0.68-0.94 at 120 Hz.
  stepRate: 480,
  enter() {
    analyticsTimer = setInterval(() => { gameplayAnalytics.checkpoint(); gameplayAnalytics.flush(); }, 30000);
    window.addEventListener('pagehide', analyticsPageHide);
    document.addEventListener('visibilitychange', analyticsVisibility);
    setHeadRadius(R); world.gravity = { x: 0, y: 0, z: -G };
    RectAreaLightUniformsLib.init();
    const initialEnvironment = environmentId;
    // Rack orientation must be ready before asynchronous room and map loading.
    rackStyle = initialEnvironment === 'orbital' ? 'planets' : 'balls';
    build(); applyCaps(); layout(!/^#room=/.test(location.hash)); setupCamera(); setLook(true);
    showGameControls(true); capsOn = true;
    setLoadingStage(2, 'Loading room…');
    const minimalReady = setEnvironment('minimal', initialEnvironment === 'minimal');
    const ready = initialEnvironment === 'minimal' ? minimalReady : setEnvironment(initialEnvironment);
    window.addEventListener('hashchange', joinInvite);
    joinInvite();
    return ready;
  },
  exit() {
    gameplayAnalytics.end('page_exit', true); clearInterval(analyticsTimer);
    window.removeEventListener('pagehide', analyticsPageHide);
    document.removeEventListener('visibilitychange', analyticsVisibility);
    setAttract(false);
    stopReplay(); replay.reset();
    finishRack(false);
    arcade.effects.dispose(); audio.stopArcade();
    cancelComputerSearch();
    computerThoughts.dispose();
    window.removeEventListener('hashchange', joinInvite); online.leave();
    endGesture();
    ++environmentRequest; pendingRoom?.dispose(); pendingRoom = null;
    room?.dispose(); room = null;
    ++styleRequest;
    for (const ball of allBalls()) { planetSet?.detach(ball.mesh); ball.mesh.material = classicMaterials.get(ball); }
    planetSet?.dispose(); planetSet = null;
    sunLight?.dispose(); sunLight = null;
    for (const ball of extras) classicMaterials.delete(ball);
    clearProps(); showGameControls(false); world.gravity = { x: 0, y: 0, z: 0 }; capsOn = false; removeCaps();
    hudObserver?.disconnect(); hudObserver = null;
    controls?.dispose(); controls = null; setLook(false);
    renderer.shadowMap.autoUpdate = true;
  },
  key(k) {
    if (k === 'v') { if (replayView.active) stopReplay(true); else startReplay(); return; }
    if (replayView.active) {
      if (k === 'escape') { stopReplay(true); return; }
      if (k === 'c') { resetView(); return; }
      if (['r', 'b', 'f'].includes(k)) stopReplay();
      else return;
    }
    if (k === 'escape') endGesture(); if (k === 'r') restart(); if (k === 'c') { endGesture(); resetView(); } if (k === 'b') setBallStyle(nextBallSet(ballStyle)); if (k === 'f') setInteractionMode(interactionMode === 'cue' ? 'fling' : 'cue');
  },
  resize() {
    // Mobile browsers fire resize when the URL bar hides, with no change in size at all. Re-fitting
    // then would move the camera out from under the shot being aimed, so do nothing unless the
    // viewport really changed, and never interrupt a gesture in progress.
    if (innerWidth === lastViewport.w && innerHeight === lastViewport.h) return;
    if (attractMode) { refitView(); return; }
    // A rotation mid-aim is deferred, not dropped: lastViewport still holds the pre-change size, so
    // endGesture() re-frames as soon as the shot is taken or cancelled.
    if (aiming || placing || dragging) { refitPending = true; return; }
    refitView();
  },
  pointerdown(e) {
    audio.ensure();
    if (rackMotion || replayView.active || gameMode === 'free' && pocketed === 15) return false;
    if (computerTurn() || remoteTurn() || e.button !== 0 || dragging || aiming || placing) return false;
    if (gameMode !== 'free' && match.winner === null && match.ballInHand && !activeShot && tableStill()) {
      if (meshUnderPointer(e, [cue.mesh]) !== cue.mesh && !validPlacement(pointerToPlane(e, BALL_Z))) return false;
      controls.enabled = false;
      placing = { ball: cue, original: { ...cue.body.translation() }, valid: false };
      cue.body.setEnabled(false); movePlacement(e); updateGestureControls(); return true;
    }
    if (canCallPocket() && !(calledPocket !== null && ballUnderPointer(e) === cue)) {
      layoutTablePockets();
      const pocket = pocketAtPointer(pocketTargets, e);
      if (pocket !== null) {
        calling = { pocket, x: e.clientX, y: e.clientY, moved: false };
        controls.enabled = false; return true;
      }
    }
    if (interactionMode === 'fling') {
      const ball = ballUnderPointer(e);
      if (!ball) return false;
      controls.enabled = false;
      const p = ball.body.translation(), to = new THREE.Vector3(p.x, p.y, BALL_Z);
      dragging = { ball, to, offset: to.clone().sub(pointerToPlane(e, BALL_Z)), samples: [] };
      arcade.touch(numberOf(ball));
      sampleDrag(e); updateGestureControls();
      return true;
    }
    if (!cueReady() || !cueUnderPointer(e)) return false;
    controls.enabled = false;
    const center = new THREE.Vector3().copy(cue.body.translation());
    aiming = { to: center.clone(), offset: center.clone().sub(pointerToPlane(e, BALL_Z)) };
    guide.visible = true; cueStick.visible = true; updateGestureControls(); return true;
  },
  // Only the captured pointer's moves arrive during a gesture; otherwise the return value is the hover state.
  pointermove(e) {
    if (rackMotion || replayView.active) return false;
    if (computerTurn() || remoteTurn()) return false;
    if (calling) { calling.moved ||= pocketTapMoved(calling, e); return; }
    if (placing) { movePlacement(e); return; }
    if (dragging) {
      const coalesced = e.getCoalescedEvents?.();
      for (const sample of coalesced?.length ? coalesced : [e]) sampleDrag(sample);
      dragging.to = dragTarget(e); // Project once per event; coalesced samples only contribute velocity.
      return;
    }
    if (aiming) { aiming.to = pointerToPlane(e, BALL_Z).add(aiming.offset); return; }
    if (canCallPocket() && pocketAtPointer(pocketTargets, e) !== null) return 'pointer';
    if (interactionMode === 'fling') return !!ballUnderPointer(e);
    return cueReady() && cueUnderPointer(e);
  },
  pointerup(e) {
    if (replayView.active) return;
    if (remoteTurn()) { endGesture(); return; }
    if (computerTurn()) return;
    if (calling) {
      const tap = calling; calling = null; controls.enabled = true;
      if (canCallPocket() && completesPocketTap(tap, e, pocketAtPointer(pocketTargets, e))) selectPocket(tap.pocket);
    } else if (placing) { movePlacement(e); finishPlacement(); }
    else if (dragging) { sampleDrag(e); endDrag(true); }
    else if (aiming) { shoot(); endAim(); }
  },
  pointercancel: endGesture,   // explicit cancellation never fires a shot or fling
  step() {
    if (replayView.active) return false;
    if (attractMode && document.hidden) return false;
    if (attractMode && match.winner !== null) {
      attractWait += world.timestep;
      if (attractWait >= 2) { attractWait = 0; match = newMatch(); layout(); }
      return false;
    }
    if (rackMotion) {
      eventQueue.drainCollisionEvents(() => {}); physicsTime += world.timestep; return;
    }
    arcade.time = physicsTime;
    drainSounds();
    if (computerTurn() && !activeShot) {
      updateComputer(world.timestep);
      // Keep the exact snapshot, including contact/sleep state, until the strike.
      // The eventual impulse also precedes felt friction, as it does in the worker.
      if (computerWorker || computerPlan) return false;
    }
    if (arcade.active) for (const ball of allBalls()) {
      const p = ball.body.translation();
      if (!pocketedSet.has(ball) && p.z >= FELT_Z) arcade.active.tracker.sample(numberOf(ball), p);
    }
    rollingResistance(world.timestep);
    updateDrag();
    physicsTime += world.timestep;
    collectPocketed();
    replay.capture(physicsTime, readReplayPoses);
    settleShot(world.timestep);
    if (arcade.active?.free) {
      arcade.settleFree(tableStill(), belowSince.size, dragging, world.timestep);
      if (pocketed === 15 && !arcade.active) gameplayAnalytics.finish('cleared', arcade.state?.totals[0] || 0);
      if (!arcade.active) { replay.finish(physicsTime, readReplayPoses); syncReplayButton(); syncRackResults(); }
    }
    // The next solver step's incoming velocities are needed to distinguish a
    // struck ball from one that merely deflected a ball already in motion.
    if (arcade.active || arcade.effects.enabled) for (const ball of allBalls()) {
      const p = ball.body.translation(), v = ball.body.linvel(), n = numberOf(ball);
      let sample = beforeMotion.get(n); if (!sample) { sample = {}; beforeMotion.set(n, sample); }
      sample.x = p.x; sample.y = p.y; sample.vx = v.x; sample.vy = v.y;
    }
  },
  setEnvironment,
  setBallStyle,
  ballStyle: () => ballStyle,
  environment: () => environmentId,
  setGame: (mode) => startGame(mode),
  startAttract: () => setAttract(true),
  matchState: () => ({ mode: gameMode, attract: attractMode, match: structuredClone(match), shot: activeShot && structuredClone(activeShot), calledPocket, racking: !!rackMotion }),
  balls: allBalls,
  controls: () => controls,   // for scripted testing
  audio,
  arcadeState: () => arcade.debug(),
  setArcade: enabled => arcade.hud.setEnabled(enabled),
  replayState: () => ({ available: !!replay.last, active: replayView.active, recording: !!replay.recording,
    duration: replay.last?.duration, frames: replay.last?.frames.length, time: replayView.time }),
  ...(import.meta.env.DEV ? { debugShot: (dir, speed, shotSpin) => { takeShot(dir, speed, shotSpin); endAim(); },
    previewArcade: kind => {
      if (kind === 'rack') arcade.effects.rack(rackPositions(), gameMode === 'free');
      else arcade.effects.pocket(pockets[1], kind === 'scratch' ? 'SCRATCH' : kind === 'early' ? 'TOO SOON!' : '+350',
        kind === 'scratch' || kind === 'early' ? 'NO POINTS THIS SHOT' : 'BANK SHOT!', { down: kind === 'scratch' || kind === 'early', color: kind === 'early' ? '#bd8bce' : kind === 'scratch' ? '#f28c78' : '#ffe08a', pending: kind === 'bank' });
    } } : {}),
  frame() {
    if (document.getElementById('hud-sheet').open) syncGravityToggle();
    controls?.update();
    animateRack();
    if (scene.fog && controls) {
      // A camera pulled back to fit the HUD must not lose the table in the fog.
      const retreat = Math.max(0, camera.position.distanceTo(controls.target) - 120);
      scene.fog.near = 140 + retreat; scene.fog.far = 330 + retreat;
    }
    if (replayView.active) { replayView.frame(); guide.visible = false; cueStick.visible = false; }
    else if (aiming) updateAim();
    else {
      const aim = gameMode === 'online' && match.turn !== online.seat && !activeShot &&
        !match.ballInHand && match.winner === null && onTable(cue) && online.remoteAim;
      guide.visible = cueStick.visible = !!aim;
      if (aim) {
        const c = cue.body.translation();
        updateGuide(c, aim.dir);
        updateCueStick(c, aim.dir, aim.pull, aim.spin);
      }
    }
    audio.setMuted(!!window.playful?.mute || document.hidden || replayView.active);
    const fade = THREE.MathUtils.clamp((fixtureFade[1] - camera.position.z) / (fixtureFade[1] - fixtureFade[0]), 0, 1);   // lamp fixture fades as the camera climbs to it
    for (const m of fixture) { m.visible = fade > 0; m.material.opacity = fade; }
    if (capsOn && capsPending()) applyCaps();
    const balls = replayView.active ? replayView.balls : allBalls();
    if (ballStyle === 'planets') {
      updatePlanetCaps(balls, !!aiming && !computerTurn() && !remoteTurn() && !replayView.active);
      const seconds = replayView.active ? (replayView.clip.metadata.planetTime ?? 0) + replayView.time : performance.now() / 1000;
      planetSet?.setTime(seconds);
      updatePlanetOrbits(balls, seconds);
    }
    updateSunLight(sunLight, balls.find(ball => ball.number === 0)?.mesh, ballStyle === 'planets', FELT_Z);
    const pixelScale = innerHeight * renderer.getPixelRatio() * camera.projectionMatrix.elements[5] / 2;
    balls.forEach((h, i) => {
      setBallDetail(h.mesh, R * pixelScale / h.mesh.position.distanceTo(camera.position));
      const cs = contactShadows[i]; if (!cs) return;
      const t = h.mesh.position, on = h.mesh.visible && (replayView.active || h.body.isEnabled() || !!rackMotion) && t.z > BALL_Z - 0.3;
      // The emitting Sun has no painted contact shadow either, including in replay.
      cs.visible = on && !(ballStyle === 'planets' && h.number === 0);
      if (cs.visible) cs.position.set(h.mesh.position.x, h.mesh.position.y, FELT_Z + 0.015);
    });
    // Orbiting moons move even when their parent ball is still. Include their
    // local transforms alongside the parent visibility/rotation gates.
    const shadowObjects = [cueStick, cueStick.holder, sunLight];
    for (const { mesh } of balls) {
      shadowObjects.push(mesh);
      mesh.traverseVisible(child => { if (child !== mesh && child.castShadow) shadowObjects.push(child); });
    }
    renderer.shadowMap.autoUpdate = false;
    if (shadowsChanged(shadowObjects)) renderer.shadowMap.needsUpdate = true;
    syncPocketCall();
    if (pocketMarker) {
      pocketMarker.visible = !replayView.active && gameMode !== 'free' && calledPocket !== null && match.winner === null;
      if (pocketMarker.visible) { const p = pockets[calledPocket]; pocketMarker.position.set(p.x, p.y, FELT_Z + RAIL_H); }
    }
    if (marker) {
      const ready = !replayView.active && (!!dragging || (interactionMode === 'cue' && !aiming && cueReady()));
      marker.visible = ready;
      if (ready) { const c = (dragging?.ball || cue).body.translation(); marker.position.set(c.x, c.y, FELT_Z + 0.03); }
    }
    if (!replayView.active) { arcade.effects.frame(balls); computerThoughts.frame(); }
  },
};
