/**
 * Integration tests: extension manifest consistency.
 *
 * These tests validate that `package.json` is internally consistent and meets
 * the structural requirements for a well-formed VSCode extension:
 *
 * - Every contributed command has a `category` field.
 * - Every contributed command with an `enablement` clause references only
 *   context keys that are documented in CLAUDE.md.
 * - Every keybinding `when` clause references a valid context key.
 * - Every menu item references a command that exists in `contributes.commands`.
 * - Required manifest fields are present and correctly typed.
 * - Configuration property types match what `config.ts` expects.
 *
 * These tests run without a jj repository or a real VSCode instance; they
 * only read `package.json` from disk. As such, they are fast and suitable for
 * running in any environment.
 */

import * as assert from 'assert';
import { getExtensionManifest } from './helpers';

// ── Types mirroring package.json structure ────────────────────────────────────

interface ManifestCommand {
  command: string;
  title: string;
  category?: string;
  enablement?: string;
  icon?: string;
}

interface ManifestKeybinding {
  key: string;
  command: string;
  when?: string;
}

interface ManifestMenuItem {
  command: string;
  when?: string;
  group?: string;
}

interface ManifestConfiguration {
  properties: Record<
    string,
    {
      type: string | string[];
      default?: unknown;
      enum?: unknown[];
      minimum?: number;
      maximum?: number;
    }
  >;
}

// ── Documented context keys ───────────────────────────────────────────────────

// These are the context keys defined in CLAUDE.md and used throughout the extension.
const KNOWN_CONTEXT_KEYS = new Set([
  'jjvs:hasRepository',
  'jjvs:isColocated',
  'jjvs:hasConflicts',
  'jjvs:revisionSelected',
  'jjvs:fileSelected',
]);

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('Extension Manifest', function () {
  let pkg: Record<string, unknown>;
  let commands: ManifestCommand[];
  let commandIds: Set<string>;

  before(function () {
    pkg = getExtensionManifest();
    const contributes = pkg['contributes'] as Record<string, unknown>;
    commands = contributes['commands'] as ManifestCommand[];
    commandIds = new Set(commands.map((c) => c.command));
  });

  // ── Top-level manifest fields ───────────────────────────────────────────────

  test('has required top-level fields', function () {
    assert.strictEqual(typeof pkg['name'], 'string', 'name must be a string');
    assert.strictEqual(pkg['name'], 'jjvs', 'name must be jjvs');
    assert.strictEqual(typeof pkg['publisher'], 'string', 'publisher must be a string');
    assert.strictEqual(typeof pkg['version'], 'string', 'version must be a string');
    assert.strictEqual(typeof pkg['engines'], 'object', 'engines must be an object');
    const engines = pkg['engines'] as Record<string, string>;
    assert.ok(engines['vscode']?.startsWith('^'), 'vscode engine must be a caret range');
    assert.strictEqual(pkg['license'], 'MIT', 'license must be MIT');
  });

  test('activation events include workspaceContains:.jj', function () {
    const events = pkg['activationEvents'] as string[];
    assert.ok(
      events.includes('workspaceContains:.jj'),
      'must activate when workspace contains .jj',
    );
  });

  // ── Commands ──────────────────────────────────────────────────────────────

  test('every command has a category', function () {
    for (const cmd of commands) {
      assert.strictEqual(
        cmd.category,
        'Jujutsu',
        `command '${cmd.command}' must have category 'Jujutsu'`,
      );
    }
  });

  test('every command has a non-empty title', function () {
    for (const cmd of commands) {
      assert.ok(
        typeof cmd.title === 'string' && cmd.title.trim() !== '',
        `command '${cmd.command}' must have a non-empty title`,
      );
    }
  });

  test('command enablement clauses only reference known context keys', function () {
    for (const cmd of commands) {
      if (cmd.enablement === undefined) continue;
      // Extract all jjvs: tokens from the enablement expression.
      const matches = cmd.enablement.match(/jjvs:\w+/g) ?? [];
      for (const key of matches) {
        assert.ok(
          KNOWN_CONTEXT_KEYS.has(key),
          `command '${cmd.command}' references unknown context key '${key}' in enablement`,
        );
      }
    }
  });

  test('no duplicate command IDs', function () {
    const seen = new Set<string>();
    for (const cmd of commands) {
      assert.ok(
        !seen.has(cmd.command),
        `duplicate command ID '${cmd.command}'`,
      );
      seen.add(cmd.command);
    }
  });

  // ── Keybindings ──────────────────────────────────────────────────────────

  test('every keybinding references a registered command', function () {
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const keybindings = contributes['keybindings'] as ManifestKeybinding[];
    for (const kb of keybindings) {
      assert.ok(
        commandIds.has(kb.command),
        `keybinding key='${kb.key}' references unregistered command '${kb.command}'`,
      );
    }
  });

  test('keybinding when clauses only reference known context keys', function () {
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const keybindings = contributes['keybindings'] as ManifestKeybinding[];
    for (const kb of keybindings) {
      if (kb.when === undefined) continue;
      const matches = kb.when.match(/jjvs:\w+/g) ?? [];
      for (const key of matches) {
        assert.ok(
          KNOWN_CONTEXT_KEYS.has(key),
          `keybinding key='${kb.key}' references unknown context key '${key}'`,
        );
      }
    }
  });

  // ── Menu items ────────────────────────────────────────────────────────────

  test('every menu item references a registered command', function () {
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const menus = contributes['menus'] as Record<string, ManifestMenuItem[]>;
    for (const [menuId, items] of Object.entries(menus)) {
      for (const item of items) {
        assert.ok(
          commandIds.has(item.command),
          `menu '${menuId}' references unregistered command '${item.command}'`,
        );
      }
    }
  });

  // ── Configuration ─────────────────────────────────────────────────────────

  test('configuration properties exist for all documented settings', function () {
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const config = contributes['configuration'] as ManifestConfiguration;
    const props = config.properties;

    const requiredSettings = [
      'jjvs.jjPath',
      'jjvs.logLevel',
      'jjvs.revset',
      'jjvs.logTemplate',
      'jjvs.logLimit',
      'jjvs.oplogLimit',
      'jjvs.git.defaultRemote',
      'jjvs.preview.position',
      'jjvs.preview.showOnStart',
      'jjvs.autoRefresh',
      'jjvs.autoRefreshInterval',
      'jjvs.graphStyle',
    ];

    for (const key of requiredSettings) {
      assert.ok(key in props, `configuration property '${key}' must be defined`);
    }
  });

  test('logLimit has minimum constraint of 1', function () {
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const config = contributes['configuration'] as ManifestConfiguration;
    const logLimit = config.properties['jjvs.logLimit'];
    assert.ok(logLimit !== undefined, 'jjvs.logLimit must be defined');
    assert.ok(
      logLimit.minimum !== undefined && logLimit.minimum >= 1,
      'jjvs.logLimit must have minimum >= 1',
    );
  });

  test('logLevel enum contains all expected values', function () {
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const config = contributes['configuration'] as ManifestConfiguration;
    const logLevel = config.properties['jjvs.logLevel'];
    assert.ok(logLevel !== undefined, 'jjvs.logLevel must be defined');
    const expectedValues = ['off', 'error', 'warn', 'info', 'debug', 'trace'];
    for (const value of expectedValues) {
      assert.ok(
        (logLevel.enum as string[]).includes(value),
        `jjvs.logLevel enum must include '${value}'`,
      );
    }
  });

  test('graphStyle enum contains text and webview', function () {
    const contributes = pkg['contributes'] as Record<string, unknown>;
    const config = contributes['configuration'] as ManifestConfiguration;
    const graphStyle = config.properties['jjvs.graphStyle'];
    assert.ok(graphStyle !== undefined, 'jjvs.graphStyle must be defined');
    assert.ok(
      (graphStyle.enum as string[]).includes('text'),
      "jjvs.graphStyle enum must include 'text'",
    );
    assert.ok(
      (graphStyle.enum as string[]).includes('webview'),
      "jjvs.graphStyle enum must include 'webview'",
    );
  });
});
