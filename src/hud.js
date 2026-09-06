// Keep setup out of the way for the rest of this visit, including subsequent racks.
export function markPlaying() {
  document.getElementById('hud').classList.add('playing');
}

// Lend the controls to a native modal. Keeping the same elements preserves
// their values, listeners, and hidden game states.
export function connectHud(game) {
  const compact = matchMedia('(max-width: 1100px), (max-height: 600px)');
  const sheet = document.getElementById('hud-sheet');
  const content = document.getElementById('sheet-content');
  const title = document.getElementById('sheet-title');
  let borrowed = [];

  function restore() {
    for (const { element, anchor } of borrowed) anchor.replaceWith(element);
    borrowed = [];
  }
  function close() { sheet.close(); restore(); }
  function open(label, selectors) {
    game.key('escape');
    restore();
    title.textContent = label;
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const anchor = document.createComment('HUD control home');
      element.before(anchor);
      borrowed.push({ element, anchor });
      content.append(element);
    }
    sheet.showModal();
  }
  document.getElementById('open-settings').addEventListener('click', () => open('Game & settings', ['.control-dock', '.utilities', '#online-panel']));
  document.getElementById('open-spin').addEventListener('click', () => open('Cue spin', ['#spin-control']));
  document.getElementById('open-pockets').addEventListener('click', () => open('Call the 8-ball pocket', ['#pocket-call']));
  document.getElementById('close-sheet').addEventListener('click', close);
  document.getElementById('cancel-gesture').addEventListener('pointerdown', e => {
    e.preventDefault();
    game.key('escape');
  });
  document.getElementById('cancel-gesture').addEventListener('click', () => game.key('escape'));
  document.getElementById('quick-view').addEventListener('click', () => document.getElementById('overhead-view').click());
  sheet.addEventListener('close', () => { if (!sheet.open) restore(); });
  // Dismiss only a tap that starts and ends on the backdrop, never a spin drag.
  let backdropDown = false;
  sheet.addEventListener('pointerdown', e => { backdropDown = e.target === sheet; });
  sheet.addEventListener('click', e => { if (backdropDown && e.target === sheet) close(); });
  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-pocket], #overhead-view, #reset-view, #rerack')) close();
  });
  compact.addEventListener('change', close);
}
