// Milestones describe completed startup work, not an estimated download percentage.
export function createLoadingScreen(root) {
  const status = root.querySelector('#loading-status');
  const progress = root.querySelector('#loading-progress');
  const retry = root.querySelector('#loading-retry');
  let stage = 0, ended = false;
  return {
    stage(value, label) {
      if (ended || value < stage) return;
      stage = value;
      status.textContent = label;
      progress.value = value;
      progress.setAttribute('aria-valuetext', `${value} of 4 startup steps complete`);
    },
    finish() {
      if (ended) return;
      ended = true;
      progress.value = 4;
      root.hidden = true;
    },
    fail() {
      if (ended) return;
      ended = true;
      status.textContent = 'The game couldn’t load. Please try again.';
      progress.hidden = true;
      retry.hidden = false;
    },
  };
}

let screen;
function loadingScreen() {
  const root = document.getElementById('loading-screen');
  if (root) screen ??= createLoadingScreen(root);
  return screen;
}
export const setLoadingStage = (value, label) => loadingScreen()?.stage(value, label);
export const finishLoading = () => loadingScreen()?.finish();
export const failLoading = () => loadingScreen()?.fail();
