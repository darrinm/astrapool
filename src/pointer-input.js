// Routes browser pointer events to the scene and owns the cursor and pointer identity. The scene owns
// gesture state and completion, and sees exactly one completion (release or cancel) per gesture.
export function connectPointerInput(canvas, scene) {
  const { body, defaultView } = canvas.ownerDocument;
  let captured = null;   // pointer id of the gesture in progress
  const finish = (e, release) => {
    if (captured === null || (e && e.pointerId !== captured)) return;
    captured = null; body.style.cursor = 'default';
    if (release) scene.pointerup(e); else scene.pointercancel();
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (captured !== null || !scene.pointerdown(e)) return;
    canvas.setPointerCapture(e.pointerId); captured = e.pointerId; body.style.cursor = 'grabbing';
  }, { capture: true }); // Claim ball gestures before OrbitControls starts a camera drag.
  canvas.addEventListener('pointermove', (e) => {
    if (captured === null) body.style.cursor = scene.pointermove(e) ? 'grab' : 'default';   // hover
    else if (e.pointerId === captured) scene.pointermove(e);
  });
  canvas.addEventListener('pointerup', (e) => finish(e, true));
  canvas.addEventListener('pointercancel', (e) => finish(e, false));
  // Capture loss can precede pointerup (Chrome on some setups). With no button held it is the release.
  canvas.addEventListener('lostpointercapture', (e) => finish(e, e.buttons === 0));
  defaultView.addEventListener('blur', () => finish(undefined, false));
}
