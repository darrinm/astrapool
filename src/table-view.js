// Fit the whole table with room for the HUD. Portrait puts the long rail vertically.
export function overheadDistance(width, height, halfWidth, halfHeight, fov, top, bottom, left = 12, right = 12) {
  const portrait = height > width;
  const vertical = portrait ? halfWidth : halfHeight;
  const horizontal = portrait ? halfHeight : halfWidth;
  const usableHeight = Math.max(1, height - top - bottom);
  const usableWidth = Math.max(1, width - left - right);
  const tangent = Math.tan(fov * Math.PI / 360);
  return Math.max(vertical / (tangent * usableHeight / height), horizontal / (tangent * usableWidth / height));
}

export function withinCueTarget(pointer, center, radius, touch = false) {
  return Math.hypot(pointer.x - center.x, pointer.y - center.y) <= Math.max(radius + 6, touch ? 24 : 16);
}

// Snap using OrbitControls' public API so leftover orbit/pan damping cannot
// turn a portrait fit sideways or move it away from the available space.
export function setOverheadCamera(camera, controls, { width, height, halfWidth, halfHeight, surfaceZ, top, bottom, left, right }) {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  const distance = overheadDistance(width, height, halfWidth, halfHeight, camera.fov, top, bottom, left, right);
  controls.minPolarAngle = 0;
  controls.maxDistance = Math.max(200, distance);
  camera.setViewOffset(width, height, (right - left) / 2, (bottom - top) / 2, width, height);
  controls.target.set(0, 0, surfaceZ);
  const portrait = height > width;
  camera.position.set(portrait ? -0.00001 : 0, portrait ? 0 : -0.00001, surfaceZ + distance);
  controls.update();
  controls.enableDamping = damping;
}
