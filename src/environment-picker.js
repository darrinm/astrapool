import { ENVIRONMENTS, environmentById, readEnvironment } from './environments.js';
import { connectBackdropDismiss } from './hud.js';

export function connectEnvironmentPicker(game) {
  const dialog = document.getElementById('environment-dialog');
  const options = document.getElementById('environment-options');
  let selected = readEnvironment(localStorage), preview = selected, request = 0, loading = false, error = '';
  const apply = document.getElementById('apply-environment');
  function update() {
    options.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.room === preview)));
    const theme = environmentById(preview);
    document.getElementById('environment-preview-status').textContent = error || (loading ? `Opening ${theme.name}…` : theme.name);
    options.setAttribute('aria-busy', String(loading));
    apply.disabled = loading;
  }
  for (const theme of ENVIRONMENTS) {
    const button = document.createElement('button'); button.className = `environment-card room-${theme.id}`; button.dataset.room = theme.id;
    button.setAttribute('aria-label', `Preview ${theme.name}`);
    // All copy and IDs come from the fixed, local room catalog.
    button.innerHTML = `<span class="room-art" aria-hidden="true">${theme.id === 'minimal' ? '<span class="room-table"><i></i></span>' : `<img class="room-photo" src="/environments/${theme.id}-preview.webp" alt="" loading="lazy" width="640" height="320">`}<span class="room-number">${theme.id === 'minimal' ? '•' : `0${ENVIRONMENTS.indexOf(theme)}`}</span><span class="room-check">✓</span></span><span class="room-copy"><span class="eyebrow">${theme.time}</span><strong>${theme.name}</strong><span>${theme.description}</span></span>`;
    button.addEventListener('click', async () => {
      const current = ++request;
      preview = theme.id; loading = true; error = ''; update();
      const applied = await game.setEnvironment(preview);
      if (current !== request) return;
      loading = false;
      if (!applied) { preview = game.environment(); error = 'The room could not load. Please try again.'; }
      update();
    });
    options.append(button);
  }
  document.getElementById('open-environments').addEventListener('click', () => {
    game.key('escape');
    const settings = document.getElementById('hud-sheet'); if (settings.open) settings.close();
    selected = game.environment(); preview = selected; error = ''; update(); dialog.showModal();
  });
  apply.addEventListener('click', () => {
    selected = preview;
    try { localStorage.setItem('pool.environment', selected); } catch { /* Room still works when storage is unavailable. */ }
    dialog.close();
  });
  document.getElementById('cancel-environment').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    ++request; loading = false;
    // Also cancels a pending download when its room has not become visible yet.
    game.setEnvironment(selected); preview = selected;
  });
  connectBackdropDismiss(dialog, () => dialog.close());
  update();
}
