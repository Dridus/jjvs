/**
 * Integration test runner configuration for @vscode/test-cli.
 *
 * Integration tests run inside a real VSCode Extension Development Host instance
 * and require a real jj repository to be present in the test workspace.
 *
 * Usage:
 *   pnpm test:integration
 *
 * Test files live in test/integration/ and are compiled to out-test/ before running.
 * The compiled tests reference dist/extension.js (the bundled extension).
 *
 * Phase 15 will flesh out the integration test suite. This file provides the
 * configuration skeleton so the runner is wired up from the start.
 *
 * See: https://github.com/microsoft/vscode-test-cli
 */

import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/integration/**/*.test.js',

  // Use a dedicated test workspace directory containing a real jj repository.
  // Phase 15 will create this fixture workspace.
  workspaceFolder: './test/fixtures/workspace',

  mocha: {
    timeout: 30_000,
    ui: 'bdd',
  },
});
