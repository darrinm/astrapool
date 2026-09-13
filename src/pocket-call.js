import { Vector3 } from 'three';

// Screen-space targets follow the real pocket mouths as the camera moves.
// Keep at least a 44px touch target even at the far end of the table.
export function projectPocketTargets(pockets, camera, width, height, surfaceZ, pocketRadius) {
  const right = new Vector3(pocketRadius, 0, 0).applyQuaternion(camera.quaternion);
  const points = pockets.map(p => {
    const world = new Vector3(p.x, p.y, surfaceZ), center = world.clone().project(camera);
    const edge = world.add(right).project(camera);
    return { x: (center.x + 1) * width / 2, y: (1 - center.y) * height / 2,
      radius: Math.max(22, Math.abs(edge.x - center.x) * width / 2 + 4),
      visible: center.z >= -1 && center.z <= 1 && Math.abs(center.x) <= 1 && Math.abs(center.y) <= 1 };
  });
  const vertical = Math.abs(points[2].y - points[0].y) > Math.abs(points[2].x - points[0].x);
  const longFlip = (vertical ? points[2].y - points[0].y : points[2].x - points[0].x) < 0;
  const shortFlip = (vertical ? points[3].x - points[0].x : points[3].y - points[0].y) < 0;
  return points.map((p, i) => {
    const along = longFlip ? 2 - i % 3 : i % 3, side = (shortFlip ? i < 3 : i >= 3) ? 2 : 0;
    return { ...p, pocket: i, name: `${['Top', 'Middle', 'Bottom'][vertical ? along : side]} ${['left', 'middle', 'right'][vertical ? side : along]} pocket` };
  });
}

export function pocketAtPointer(targets, event) {
  let pocket = null, nearest = Infinity;
  for (const target of targets) {
    const distance = Math.hypot(event.clientX - target.x, event.clientY - target.y);
    if (target.visible && distance <= target.radius && distance < nearest) { pocket = target.pocket; nearest = distance; }
  }
  return pocket;
}

export const pocketTapMoved = (start, event) => Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10;
export const completesPocketTap = (start, event, pocket) => !start.moved && !pocketTapMoved(start, event) && pocket === start.pocket;
