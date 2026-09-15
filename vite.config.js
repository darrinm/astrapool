import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Public builds omit these private textures. Only request files actually present
// when the dev server or build starts; a missing collection must cost no requests.
const headTextureIds = Array.from({ length: 14 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)
  .filter(id => existsSync(resolve(__dirname, `public/heads/${id}.jpg`)));

export default {
  define: { __POOL_HEAD_TEXTURE_IDS__: JSON.stringify(headTextureIds) },
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), audition: resolve(__dirname, 'audition.html') } } },
};
