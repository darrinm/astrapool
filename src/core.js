// Shared setup: renderer, camera, lights, physics world, the 14 heads, and the helpers the pool scene builds on.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export const PEOPLE = Array.from({ length: 14 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
export const RADIUS = 1.5;          // base head radius (world units); scenes may scale it
export const DEPTH = RADIUS * 1.1;  // the felt sits this far below the origin
export const CAMERA_Z = 30;
const HEADS_VERSION = 10;           // bump when the maps in public/heads change, so browsers refetch them

await RAPIER.init();
export { RAPIER };

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#f4efe8');
export const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, CAMERA_Z);

export const lights = {
  hemi: new THREE.HemisphereLight('#ffffff', '#9a8f84', 1.6),
  key: new THREE.DirectionalLight('#ffffff', 2.2),
  fill: new THREE.DirectionalLight('#dbe6ff', 0.8),
};
lights.key.position.set(-6, 8, 12); lights.fill.position.set(8, -4, 10);
Object.values(lights).forEach((l) => scene.add(l));
export const DEFAULT_LIGHTS = { hemi: 1.6, key: 2.2, fill: 0.8 };

export const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
export const eventQueue = new RAPIER.EventQueue(true);   // drained by scenes that want contact events

// ---------- heads ----------
const loader = new THREE.TextureLoader();
const geometry = new THREE.SphereGeometry(RADIUS, 64, 48);
export const heads = []; // { id, body, mesh }
let headRadius = RADIUS;

PEOPLE.forEach((id, i) => {
  const material = new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setHSL(i / PEOPLE.length, 0.55, 0.6), roughness: 0.5 });
  loader.load(`/heads/${id}.jpg?v=${HEADS_VERSION}`, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    material.map = tex; material.color.set('#ffffff'); material.needsUpdate = true;
  }, undefined, () => {});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  scene.add(mesh);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.15).setAngularDamping(0.25).setCcdEnabled(true));
  world.createCollider(RAPIER.ColliderDesc.ball(RADIUS).setRestitution(0.9).setFriction(0.7).setDensity(1), body);
  heads.push({ id, body, mesh });
});

// Texture centre (u = 0.5) sits on +x in SphereGeometry; this turns it toward the camera.
export const FACE_CAMERA = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
export function faceCamera(jitter = 0) {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler((Math.random() - 0.5) * jitter, -Math.PI / 2 + (Math.random() - 0.5) * jitter * 1.5, (Math.random() - 0.5) * jitter * 0.75));
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

export function setHeadRadius(r) {
  headRadius = r;
  for (const { body, mesh } of heads) { body.collider(0).setRadius(r); mesh.scale.setScalar(r / RADIUS); }
}

// Put every head back to a neutral, enabled, dynamic state before a scene lays them out.
export function resetHeads({ linearDamping = 0.15, angularDamping = 0.25, restitution = 0.9, friction = 0.7, gravityScale = 1 } = {}) {
  for (const { body, mesh } of heads) {
    body.setEnabled(true); mesh.visible = true; mesh.receiveShadow = false;
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.lockTranslations(false, true); body.lockRotations(false, true);
    body.setLinearDamping(linearDamping); body.setAngularDamping(angularDamping); body.setGravityScale(gravityScale, true);
    const c = body.collider(0); c.setRestitution(restitution); c.setFriction(friction); c.setDensity(1); c.setActiveEvents(RAPIER.ActiveEvents.NONE);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
export function placeHead(h, x, y, rot = faceCamera(0.4)) {
  h.body.setTranslation({ x, y, z: 0 }, true); h.body.setRotation(rot, true);
  h.body.setLinvel({ x: 0, y: 0, z: 0 }, true); h.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}
export function hideHead(h) { h.body.setEnabled(false); h.mesh.visible = false; }

// ---------- scene-owned physics props and meshes, cleared on exit ----------
const props = { colliders: [], bodies: [], meshes: [] };
export function addStaticCollider(desc) { const c = world.createCollider(desc); props.colliders.push(c); return c; }
export function registerProp(collider) { props.colliders.push(collider); return collider; }
export function addBody(bodyDesc, colliderDesc, mesh) {
  const body = world.createRigidBody(bodyDesc); world.createCollider(colliderDesc, body);
  props.bodies.push({ body, mesh }); if (mesh) addMesh(mesh);
  return body;
}
export function addMesh(m) { scene.add(m); props.meshes.push(m); return m; }
export function clearProps() {
  props.colliders.forEach((c) => world.removeCollider(c, false));
  props.bodies.forEach(({ body }) => world.removeRigidBody(body));
  props.meshes.forEach((m) => { scene.remove(m); m.geometry?.dispose?.(); });
  props.colliders = []; props.bodies = []; props.meshes = [];
}

// ---------- pointer helpers ----------
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();
export function pointerToPlane(e, z = 0) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  plane.constant = -z;
  if (!raycaster.ray.intersectPlane(plane, hit)) return hit.clone();
  return hit.clone();
}
export function meshUnderPointer(e, meshes) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(meshes)[0]?.object;
}
export const ui = {
  hint: (t) => { document.getElementById('hint').textContent = t; },
  status: (t) => { document.getElementById('status').textContent = t; },
};

// Called before each physics step: snapshot the pose so rendering can interpolate between steps.
const prevPose = new Map();
const _q = new THREE.Quaternion();
export function snapshotPoses() {
  for (const { body, mesh } of heads) {
    if (!mesh.visible || !body.isEnabled()) continue;
    const p = body.translation(), q = body.rotation();
    let s = prevPose.get(body); if (!s) { s = { p: new THREE.Vector3(), q: new THREE.Quaternion() }; prevPose.set(body, s); }
    s.p.set(p.x, p.y, p.z); s.q.set(q.x, q.y, q.z, q.w);
  }
}
// alpha = fraction of a physics step elapsed since the last one (0..1); poses are blended so motion stays smooth
// at any display refresh rate instead of advancing by one or two whole steps per frame.
export function syncMeshes(alpha = 1) {
  for (const { body, mesh } of heads) {
    if (!mesh.visible || !body.isEnabled()) continue;   // a disabled-but-visible head is being animated by its scene
    const p = body.translation(), q = body.rotation(), s = prevPose.get(body);
    if (s && alpha < 1 && s.p.distanceToSquared({ x: p.x, y: p.y, z: p.z }) < 4) {
      mesh.position.set(s.p.x + (p.x - s.p.x) * alpha, s.p.y + (p.y - s.p.y) * alpha, s.p.z + (p.z - s.p.z) * alpha);
      _q.set(q.x, q.y, q.z, q.w); mesh.quaternion.copy(s.q).slerp(_q, alpha);
    } else { mesh.position.set(p.x, p.y, p.z); mesh.quaternion.set(q.x, q.y, q.z, q.w); }
  }
  for (const { body, mesh } of props.bodies) {
    if (!mesh) continue;
    const p = body.translation(), q = body.rotation();
    mesh.position.set(p.x, p.y, p.z); mesh.quaternion.set(q.x, q.y, q.z, q.w);
  }
}
