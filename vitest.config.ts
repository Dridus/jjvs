import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests live in test/unit/ and mirror the src/core/ structure
    include: ['test/unit/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'out'],

    // Run in a pure Node environment (no browser, no VSCode)
    environment: 'node',

    // Snapshot files co-located with test files
    snapshotOptions: {
      snapshotFormat: {
        printBasicPrototype: false,
      },
    },

    // Don't error when no test files exist yet (they are added alongside each phase's code)
    passWithNoTests: true,

    // Coverage (opt-in via --coverage flag)
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
