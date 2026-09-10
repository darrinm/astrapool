// A scene can hold a settled world while asynchronous planning uses its snapshot.
// Rendering still runs normally; do not advance Rapier behind the planner's back.
export function stepPhysics(scene, world, events) {
  if (scene.step() === false) return false;
  world.step(events);
  return true;
}
