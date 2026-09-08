import { ENVIRONMENTS, environmentById, readEnvironment } from './environments.js';

// Rooms are a section of the settings sheet, not a dialog of their own. Choosing
// one loads it live under the open sheet, so that preview *is* the commit and
// there is nothing to confirm or cancel.
export function connectEnvironmentPicker(game) {
  const options = document.getElementById('environment-options');
  const status = document.getElementById('room-status');
  let selected = readEnvironment(localStorage), request = 0, loading = false, error = '';

  function update() {
    options.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.room === selected)));
    const theme = environmentById(selected);
    // Silent at rest: the renders say what the rooms are.
    status.textContent = error || (loading ? `Opening ${theme.name}…` : '');
    options.setAttribute('aria-busy', String(loading));
  }

  for (const theme of ENVIRONMENTS) {
    const button = document.createElement('button');
    button.className = `environment-card room-${theme.id}`;
    button.dataset.room = theme.id;
    button.setAttribute('aria-pressed', 'false');
    // All copy and IDs come from the fixed, local room catalog.
    const art = `<img class="room-photo" src="/environments/${theme.id}-preview.webp" alt="" loading="lazy" width="640" height="320">`;
    button.innerHTML = `<span class="room-art" aria-hidden="true">${art}<span class="room-check">✓</span></span>` +
      `<span class="room-copy"><strong>${theme.name}</strong></span>`;
    button.addEventListener('click', async () => {
      if (theme.id === selected) return;
      const current = ++request;
      const previous = selected;
      selected = theme.id; loading = true; error = ''; update();
      const applied = await game.setEnvironment(selected);
      if (current !== request) return;
      loading = false;
      if (applied) {
        try { localStorage.setItem('pool.environment', selected); } catch { /* The room still works when storage is unavailable. */ }
      } else {
        selected = previous; error = 'That room could not load. Please try again.';
      }
      update();
    });
    options.append(button);
  }
  update();
}
