import { defineConfig } from 'vite';

// uPlot のライセンス表示
const THIRD_PARTY_BANNER = `/*!
 * This application uses the following third-party library:
 *
 * uPlot
 * Copyright (c) 2022 Leon Sorokin
 * Licensed under the MIT License
 * https://github.com/leeoniya/uPlot
 */`;

export default defineConfig({
  base: '/WebSerialPlotter/',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // /*!...*/ 形式のコメントは minify 後も保持される
        banner: THIRD_PARTY_BANNER,
      },
    },
  },
});
