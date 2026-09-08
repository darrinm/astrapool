// Dynamic casters use local transforms; include moving parents and visibility gates.
// Static scenery changes explicitly invalidate the renderer's shadow map.
export function trackShadowChanges() {
  const previous = new WeakMap();
  let count = 0;
  return objects => {
    let changed = objects.length !== count;
    count = objects.length;
    for (const object of objects) {
      const old = previous.get(object);
      if (!old) {
        previous.set(object, { position: object.position.clone(), quaternion: object.quaternion.clone(), scale: object.scale.clone(), visible: object.visible, geometry: object.geometry });
        changed = true;
      } else if (!old.position.equals(object.position) || !old.quaternion.equals(object.quaternion) ||
        !old.scale.equals(object.scale) || old.visible !== object.visible || old.geometry !== object.geometry) {
        old.position.copy(object.position); old.quaternion.copy(object.quaternion); old.scale.copy(object.scale);
        old.visible = object.visible; old.geometry = object.geometry;
        changed = true;
      }
    }
    return changed;
  };
}
