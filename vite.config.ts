import { defineConfig } from 'vite';

export default defineConfig({
  base: '/WebSerialPlotter/',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
