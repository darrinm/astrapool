// Route cue gestures before OrbitControls and clean up both owners when browser input is interrupted.
// A null scene makes this a camera-only surface (the welcome screen).
export function connectPointerInput(canvas, scene = null, controls = null) {
  const document = canvas.ownerDocument;
  const { body, defaultView } = document;
  const listeners = [];
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  };
  let captured = null;
  const cameraPointers = new Map();
  const releaseCapture = (id) => {
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  };
  const finish = (e, release) => {
    if (!captured || (e && e.pointerId !== captured.pointerId)) return;
    const id = captured.pointerId;
    captured = null; body.style.cursor = 'default';
    if (release) scene.pointerup(e); else scene.pointercancel();
    releaseCapture(id);
  };
  const cancelCamera = (id) => {
    if (!cameraPointers.delete(id)) return;
    // Use OrbitControls' normal cancellation path, including its document listeners and touch state.
    canvas.dispatchEvent(new defaultView.PointerEvent('pointercancel', { pointerId: id, bubbles: true }));
    releaseCapture(id);
  };
  const cancelAll = () => {
    finish(undefined, false);
    for (const id of [...cameraPointers.keys()]) cancelCamera(id);
  };
  listen(canvas, 'contextmenu', e => e.preventDefault());
  listen(canvas, 'pointerdown', (e) => {
    e.preventDefault(); // Suppress selection/drag defaults and compatibility mouse events during play.
    // A new primary touch means the previous touch sequence ended, even if its up/cancel was lost.
    if (e.isPrimary && e.pointerType === 'touch') {
      if (captured?.pointerType === 'touch') finish(undefined, false);
      for (const [id, type] of cameraPointers) if (type === 'touch') cancelCamera(id);
    }
    if (captured) { e.stopImmediatePropagation(); return; }
    if (scene?.pointerdown(e)) {
      for (const id of [...cameraPointers.keys()]) cancelCamera(id);
      captured = { pointerId: e.pointerId, pointerType: e.pointerType };
      canvas.setPointerCapture(e.pointerId); body.style.cursor = 'grabbing';
      e.stopImmediatePropagation();
    } else if (controls?.enabled && controls.domElement === canvas) {
      cameraPointers.set(e.pointerId, e.pointerType);
    }
  }, { capture: true, passive: false });
  listen(canvas, 'pointermove', (e) => {
    if (!captured) body.style.cursor = scene?.pointermove(e) ? 'grab' : 'default';
    else if (e.pointerId === captured.pointerId) {
      // A mouse release can also disappear while switching windows.
      if (e.pointerType === 'mouse' && e.buttons === 0) finish(e, false);
      else scene.pointermove(e);
    }
  });
  // Document capture also receives releases outside the canvas if pointer capture was interrupted.
  listen(document, 'pointerup', (e) => {
    cameraPointers.delete(e.pointerId);
    finish(e, true);
  }, true);
  listen(document, 'pointercancel', (e) => {
    if (e.target !== canvas) cancelCamera(e.pointerId);
    else cameraPointers.delete(e.pointerId);
    finish(e, false);
  }, true);
  listen(canvas, 'lostpointercapture', (e) => {
    cancelCamera(e.pointerId);
    // Keep the desktop release fallback, but never shoot on an interrupted touch gesture.
    finish(e, e.pointerType !== 'touch' && e.buttons === 0);
  });
  listen(defaultView, 'blur', cancelAll);
  listen(defaultView, 'pagehide', cancelAll);
  listen(document, 'visibilitychange', () => { if (document.hidden) cancelAll(); });
  return () => { cancelAll(); for (const remove of listeners) remove(); };
}
