import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig({
  root: here,
  publicDir: 'static',
  build: { outDir: '../build', emptyOutDir: true },
  server: { port: 5174, proxy: { '/api': 'http://127.0.0.1:8101', '/assets': 'http://127.0.0.1:8101' } },
});
