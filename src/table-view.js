// Fit the whole table with room for the HUD. Portrait puts the long rail vertically.
export function overheadDistance(width, height, halfWidth, halfHeight, fov, top, bottom, left = 12, right = 12) {
  const portrait = height > width;
  const vertical = portrait ? halfWidth : halfHeight;
  const horizontal = portrait ? halfHeight : halfWidth;
  const usableHeight = Math.max(height * 0.3, height - top - bottom);
  const usableWidth = Math.max(width * 0.3, width - left - right);
  const tangent = Math.tan(fov * Math.PI / 360);
  return Math.max(vertical / (tangent * usableHeight / height), horizontal / (tangent * usableWidth / height));
}

export function withinCueTarget(pointer, center, radius, touch = false) {
  return Math.hypot(pointer.x - center.x, pointer.y - center.y) <= Math.max(radius + 6, touch ? 24 : 16);
}
