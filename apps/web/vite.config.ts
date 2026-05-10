import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Deployed to https://exelearning.github.io/gclassroom-exelearning/.
// `BASE` env override is honored so the site can also be hosted on a custom
// domain (BASE=/) or on an alternate sub-path during preview.
export default defineConfig(({ mode }) => ({
  root: __dirname,
  base: process.env.BASE ?? '/gclassroom-exelearning/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: mode !== 'production',
    target: 'es2022',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
}));
