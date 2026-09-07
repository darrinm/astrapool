import { ENVIRONMENTS, environmentById, readEnvironment } from './environments.js';
import { connectBackdropDismiss } from './hud.js';

export function connectEnvironmentPicker(game) {
  const dialog = document.getElementById('environment-dialog');
  const options = document.getElementById('environment-options');
  let selected = readEnvironment(localStorage), preview = selected;
  function update() {
    options.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.room === preview)));
    document.getElementById('environment-preview-status').textContent = `${environmentById(preview).name} · ${environmentById(preview).sound}`;
  }
  for (const theme of ENVIRONMENTS) {
    const button = document.createElement('button'); button.className = `environment-card room-${theme.id}`; button.dataset.room = theme.id;
    button.setAttribute('aria-label', `Preview ${theme.name}`);
    // All copy and IDs come from the fixed, local room catalog.
    button.innerHTML = `<span class="room-art" aria-hidden="true"><span class="room-scenery"></span><span class="room-table"><i></i></span><span class="room-number">${theme.id === 'minimal' ? '•' : `0${ENVIRONMENTS.indexOf(theme)}`}</span><span class="room-check">✓</span></span><span class="room-copy"><span class="eyebrow">${theme.time}</span><strong>${theme.name}</strong><span>${theme.description}</span></span>`;
    button.addEventListener('click', () => { preview = theme.id; game.setEnvironment(preview); game.audio.ensure(); update(); });
    options.append(button);
  }
  document.getElementById('open-environments').addEventListener('click', () => {
    game.key('escape');
    const settings = document.getElementById('hud-sheet'); if (settings.open) settings.close();
    preview = selected; update(); dialog.showModal();
  });
  document.getElementById('apply-environment').addEventListener('click', () => {
    selected = preview;
    try { localStorage.setItem('pool.environment', selected); } catch { /* Room still works when storage is unavailable. */ }
    dialog.close();
  });
  document.getElementById('cancel-environment').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (preview !== selected) game.setEnvironment(selected); });
  connectBackdropDismiss(dialog, () => dialog.close());
  update();
}
