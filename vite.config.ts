import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works on itch.io, GitHub Pages and Cloudflare Pages alike.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000, // Phaser itself is ~1.2 MB
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
