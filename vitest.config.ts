import { defineConfig } from 'vitest/config';

// Server-side tests only. Kept separate from vite.config.ts so the React and
// Tailwind plugins are not loaded for them.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tests call routes many times; tests/rateLimit.test.ts switches it back on.
    env: { RATE_LIMITS: 'off' },
    testTimeout: 20_000,
  },
});
