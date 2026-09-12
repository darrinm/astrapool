// The first visit is the only one that gets a title. After that the table is what
// you came for, so the app opens straight onto it.
const VISITED = 'pool.visited';

function seenBefore() {
  // If storage cannot be read the visit cannot be remembered either, and a title
  // screen on every load is worse than never showing one.
  try { return localStorage.getItem(VISITED) !== null; } catch { return true; }
}

export function connectWelcome(game) {
  const welcome = document.getElementById('welcome');
  // An invite link is someone else's opening move; join it without a title screen.
  if (seenBefore() || /^#room=/.test(location.hash)) return;

  const controls = game.controls();
  const drift = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (drift && controls) { controls.autoRotate = true; controls.autoRotateSpeed = 0.35; }

  let done = false;
  function dismiss(mode) {
    if (done) return;                       // close() re-enters through the close event
    done = true;
    try { localStorage.setItem(VISITED, '1'); } catch { /* The game still opens without storage. */ }
    if (controls) controls.autoRotate = false;
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
