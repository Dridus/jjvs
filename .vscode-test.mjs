/**
 * Integration test runner configuration for @vscode/test-cli.
 *
 * Integration tests run inside a real VSCode Extension Development Host
 * and verify the extension's behaviour at the VSCode API level.
 *
 * The test workspace (test/fixtures/workspace/) is intentionally an empty
 * directory — no .jj/ is committed. Tests that need a real jj repository
 * create one at runtime in a temporary OS directory using the `createTempJjRepo`
 * helper from test/integration/helpers.ts, and clean up in after() hooks.
 *
 * Usage:
 *   pnpm compile:integration && pnpm test:integration
 *
 * See: https://github.com/microsoft/vscode-test-cli
 */

import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/test/integration/**/*.test.js',

  // Open an empty workspace folder so VSCode starts cleanly. The extension
  // does not auto-activate here (no .jj/) but tests force-activate it via
  // vscode.extensions.getExtension('jjvs.jjvs').activate().
  workspaceFolder: './test/fixtures/workspace',

  mocha: {
    timeout: 30_000,
  },
});
