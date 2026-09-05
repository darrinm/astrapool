import { resolve } from 'node:path';
export default {
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), audition: resolve(__dirname, 'audition.html') } } },
};
