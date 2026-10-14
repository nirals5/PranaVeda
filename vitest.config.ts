import { defineConfig } from 'vitest/config';

// Server-side tests only. Kept separate from vite.config.ts so the React and
// Tailwind plugins are not loaded for them.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
