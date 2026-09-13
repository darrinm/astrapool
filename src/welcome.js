export function connectWelcome(game) {
  const welcome = document.getElementById('welcome');
  // Online startup restores the player's seat and table (or waits for that state).
  // Every fresh local startup gets the demo, including returning visitors.
  if (game.matchState().mode === 'online') return;

  const controls = game.controls();
  const canvas = controls?.domElement;
  const surface = welcome.querySelector('.welcome-camera');
  const pointers = new Set();
  const trackPointer = event => pointers.add(event.pointerId);
  const releasePointer = event => pointers.delete(event.pointerId);
  const drift = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let done = false;
  let resumeOrbit;
  function pauseOrbit() {
    clearTimeout(resumeOrbit);
    controls.autoRotate = false;
  }
  function scheduleOrbit() {
    clearTimeout(resumeOrbit);
    if (drift && !done) resumeOrbit = setTimeout(() => {
      if (!done && game.matchState().attract) controls.autoRotate = true;
    }, 3000);
  }
  if (controls) {
    // The modal makes the canvas inert. Receive camera gestures on a sibling
    // of the choices so buttons keep their normal pointer and keyboard behavior.
    controls.connect(surface);
    surface.addEventListener('pointerdown', trackPointer);
    surface.addEventListener('pointerup', releasePointer);
    surface.addEventListener('pointercancel', releasePointer);
    controls.autoRotate = drift;
    controls.autoRotateSpeed = 0.35;
    controls.addEventListener('start', pauseOrbit);
    controls.addEventListener('end', scheduleOrbit);
  }

  function dismiss(mode) {
    if (done) return;                       // close() re-enters through the close event
    done = true;
    clearTimeout(resumeOrbit);
    if (controls) {
      // Escape can close the dialog during a drag. Finish those pointers before
      // reconnecting so OrbitControls cannot carry a held gesture into the game.
      for (const pointerId of pointers) surface.dispatchEvent(new PointerEvent('pointercancel', { pointerId }));
      surface.removeEventListener('pointerdown', trackPointer);
      surface.removeEventListener('pointerup', releasePointer);
      surface.removeEventListener('pointercancel', releasePointer);
      controls.autoRotate = false;
      controls.removeEventListener('start', pauseOrbit);
      controls.removeEventListener('end', scheduleOrbit);
      controls.connect(canvas);
    }
    if (welcome.open) welcome.close();
    welcome.hidden = true;
    game.setGame(mode || game.matchState().mode);
    game.key('c');                          // settle onto the playing view the drift moved away from
  }

  welcome.querySelectorAll('[data-game]').forEach(button =>
    button.addEventListener('click', () => dismiss(button.dataset.game)));
  // Escape keeps whichever mode the game already defaults to. Take the cancel and
  // close it here rather than letting the default close it, so the drift is always
  // stopped and the visit is always recorded; `close` alone is not a reliable hook.
  welcome.addEventListener('cancel', event => { event.preventDefault(); dismiss(null); });
  welcome.addEventListener('close', () => dismiss(null));

  welcome.hidden = false;
  welcome.showModal();
  game.startAttract();
}
