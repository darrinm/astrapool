import { failLoading } from './loading.js';

document.getElementById('loading-retry').addEventListener('click', () => location.reload());
// Keep the entry point small so the HTML loading screen is visible while the
// game bundle downloads, and module / WebGL failures can show a useful retry.
try {
  const game = await import('./main.js');
  await game.ready;
} catch (error) {
  console.error('Could not start Astra Pool:', error);
  failLoading();
}
