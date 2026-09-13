// Dismiss only a tap that starts and ends on the backdrop, never a control drag.
export function connectBackdropDismiss(dialog, close) {
  let backdropDown = false;
  dialog.addEventListener('pointerdown', event => { backdropDown = event.target === dialog; });
  dialog.addEventListener('click', event => { if (backdropDown && event.target === dialog) close(); });
}

// Each panel lives in this sheet permanently, without nested dialogs.
const PANELS = {
  match: { title: 'Match details', id: 'panel-match' },
  settings: { title: 'Game', id: 'panel-settings' },
  spin: { title: 'Cue spin', id: 'panel-spin' },
  pockets: { title: 'Call the 8-ball pocket', id: 'panel-pockets' },
};

export function connectHud(game) {
  const sheet = document.getElementById('hud-sheet');
  const title = document.getElementById('sheet-title');

  function open(which) {
    game.key('escape');
    if (which === 'pockets' && document.getElementById('open-pockets').hidden) return;
    for (const [name, panel] of Object.entries(PANELS)) document.getElementById(panel.id).hidden = name !== which;
    title.textContent = PANELS[which].title;
    if (!sheet.open) sheet.showModal();
    if (which === 'pockets') {
      const map = document.getElementById('pocket-map');
      (map.querySelector('[aria-pressed="true"]') || map.querySelector('button')).focus();
    }
  }
  const close = () => sheet.close();

  document.getElementById('open-match').addEventListener('click', () => open('match'));
  document.getElementById('open-room').addEventListener('click', () => {
    open('settings');
    document.getElementById('online-panel').scrollIntoView({ block: 'center' });
    const invite = document.getElementById('invite-link');
    (invite.value ? document.getElementById('copy-invite') : document.getElementById('online-retry')).focus();
  });
  document.getElementById('open-settings').addEventListener('click', () => open('settings'));
  document.getElementById('open-spin').addEventListener('click', () => open('spin'));
  document.getElementById('open-pockets').addEventListener('click', () => open('pockets'));
  document.getElementById('close-sheet').addEventListener('click', close);
  document.getElementById('cancel-gesture').addEventListener('pointerdown', e => { e.preventDefault(); game.key('escape'); });
  document.getElementById('cancel-gesture').addEventListener('click', () => game.key('escape'));
  document.getElementById('quick-view').addEventListener('click', () => document.getElementById('overhead-view').click());
  // Choosing a pocket or a view is the whole errand, so the sheet gets out of the way.
  sheet.addEventListener('click', e => {
    if (e.target.closest('[data-pocket], #overhead-view, #reset-view, #rerack')) close();
  });
  connectBackdropDismiss(sheet, close);
}
