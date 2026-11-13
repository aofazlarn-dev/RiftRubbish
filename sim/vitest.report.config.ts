import { defineConfig } from 'vitest/config';

/** Separate config so the bot report is not part of `npm test`. */
export default defineConfig({
  test: { environment: 'node', include: ['sim/**/*.test.ts'] },
});
