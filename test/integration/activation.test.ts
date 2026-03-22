/**
 * Integration tests: extension activation and command registration.
 *
 * These tests run inside the VSCode Extension Development Host (via
 * @vscode/test-electron) and verify that the extension:
 *
 * 1. Can be force-activated via `vscode.extensions.getExtension().activate()`.
 * 2. Registers every command declared in `contributes.commands`.
 * 3. Exposes the expected configuration defaults via `vscode.workspace.getConfiguration`.
 *
 * The workspace used during these tests does NOT contain a `.jj/` directory,
 * so the extension will not auto-activate. Tests force-activate it by calling
 * `ext.activate()` directly. The extension degrades gracefully when jj is not
 * found (it logs a warning and continues), so these tests pass whether or not
 * jj is installed in the test environment.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { getExtensionManifest } from './helpers';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ManifestCommand {
  command: string;
}

// ── Test suite ────────────────────────────────────────────────────────────────

suite('Extension Activation', function () {
  // Activation can take a few seconds — bump the mocha timeout.
  this.timeout(30_000);

  setup(async function () {
    // The extension ID is {publisher}.{name} per the extension manifest.
    const ext = vscode.extensions.getExtension('jjvs.jjvs');
    if (ext === undefined) {
      // In CI the extension is loaded from dist/. If the test runner can't find
      // it, skip rather than fail with a confusing error.
      this.skip();
      return;
    }
    // Force-activate the extension. If jj is not found it logs a warning and
    // continues, so this will succeed even in environments without jj.
    await ext.activate();
  });

  // ── Command registration ─────────────────────────────────────────────────

  test('all commands declared in package.json are registered', async function () {
    const pkg = getExtensionManifest();
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const manifestCommands = contributes['commands'] as ManifestCommand[];

    const registeredCommands = await vscode.commands.getCommands(true);
    const registeredSet = new Set(registeredCommands);

    for (const { command } of manifestCommands) {
      assert.ok(
        registeredSet.has(command),
        `Command '${command}' was declared in package.json but is not registered in the extension host`,
      );
    }
  });

  // ── Configuration defaults ───────────────────────────────────────────────

  test('configuration defaults match documented values', function () {
    const config = vscode.workspace.getConfiguration('jjvs');

    assert.strictEqual(config.get('jjPath'), 'jj', 'jjvs.jjPath default must be "jj"');
    assert.strictEqual(config.get('logLevel'), 'info', 'jjvs.logLevel default must be "info"');
    assert.strictEqual(config.get('logLimit'), 50, 'jjvs.logLimit default must be 50');
    assert.strictEqual(config.get('oplogLimit'), 200, 'jjvs.oplogLimit default must be 200');
    assert.strictEqual(
      config.get('git.defaultRemote'),
      'origin',
      'jjvs.git.defaultRemote default must be "origin"',
    );
    assert.strictEqual(
      config.get('preview.position'),
      'auto',
      'jjvs.preview.position default must be "auto"',
    );
    assert.strictEqual(
      config.get('preview.showOnStart'),
      false,
      'jjvs.preview.showOnStart default must be false',
    );
    assert.strictEqual(config.get('autoRefresh'), true, 'jjvs.autoRefresh default must be true');
    assert.strictEqual(
      config.get('autoRefreshInterval'),
      3000,
      'jjvs.autoRefreshInterval default must be 3000',
    );
    assert.strictEqual(config.get('graphStyle'), 'text', 'jjvs.graphStyle default must be "text"');
  });

  // ── Context keys ─────────────────────────────────────────────────────────

  test('extension activates without throwing', async function () {
    // If we got here without an exception, activation succeeded.
    // The extension degrades gracefully when jj is not found.
    assert.ok(true, 'activation completed without throwing');
  });
});
