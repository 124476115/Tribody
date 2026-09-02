import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Relative asset base so the built site works when served from any
  // sub-path (e.g. /3t/ via a web root symlink), not only from root.
  base: './',
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, './src/domain'),
      '@application': path.resolve(__dirname, './src/application'),
      '@adapters': path.resolve(__dirname, './src/adapters'),
      '@game': path.resolve(__dirname, './src/game'),
      '@ui': path.resolve(__dirname, './src/ui'),
      '@bootstrap': path.resolve(__dirname, './src/bootstrap'),
      '@dev': path.resolve(__dirname, './src/dev'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
    target: 'es2022',
  },
});
