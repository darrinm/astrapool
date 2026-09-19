import { build } from 'vite';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

// The same entry point and dependencies as the website. Never copy private heads.
const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'ios/Web');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await build({ root, configFile: resolve(root, 'vite.config.js'), define: { __POOL_HEAD_TEXTURE_IDS__: '[]' }, publicDir: false, build: { outDir, emptyOutDir: false, rollupOptions: { input: resolve(root, 'index.html') } } });
for (const entry of ['brand', 'environments', 'planets', 'sfx', 'favicon.ico', 'favicon.png', 'apple-touch-icon.png', 'privacy.html']) {
  await cp(resolve(root, 'public', entry), resolve(outDir, entry), { recursive: true });
}
// Offline system serif fallback; do not fetch a Google font at app launch.
const html = await readFile(resolve(outDir, 'index.html'), 'utf8');
await writeFile(resolve(outDir, 'index.html'), html
  .replace(/^.*<link[^>]+https:\/\/fonts\.[^>]+>\s*$/gm, '')
  .replace('href="https://astrapool.darrinm.com/privacy.html"', 'href="/privacy.html"'));
console.log('Bundled shared game in ios/Web. Open ios/AstraPool.xcodeproj to run or archive.');
