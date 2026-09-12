import { BALL_SETS } from './ball-sets.js';

export function buildBallSetPicker(select, setSaturation) {
  const options = document.getElementById('style');
  if (options.dataset.wired) return;
  options.dataset.wired = '1';
  for (const set of BALL_SETS) {
    const button = document.createElement('button');
    button.dataset.style = set.id; button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `<span class="ball-set-art art-${set.id}" aria-hidden="true"><i></i><i></i><i></i></span>` +
      `<strong>${set.name}</strong><span>${set.description}</span>`;
    button.addEventListener('click', () => void select(set.id)); options.append(button);
  }
  document.getElementById('planet-saturation').addEventListener('input', event => setSaturation(Number(event.target.value)));
}

export function updateBallSetPicker(selected, loading, error = '') {
  document.querySelectorAll('#style button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.style === selected));
    button.classList.toggle('loading', button.dataset.style === loading);
  });
  document.getElementById('style').setAttribute('aria-busy', String(!!loading));
  document.getElementById('ball-set-status').textContent = error || (loading ? `Loading ${BALL_SETS.find(set => set.id === loading).name}…` : '');
  document.getElementById('planet-options').hidden = selected !== 'planets';
}
