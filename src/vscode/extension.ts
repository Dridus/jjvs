/**
 * jjvs – Jujutsu for VSCode
 *
 * Extension entry point. Handles activation and deactivation lifecycle.
 *
 * On activation:
 *   1. Check jj binary availability and minimum version
 *   2. Initialize the output channel and logging
 *   3. Set up repository discovery (RepositoryManager) — Phase 4
 *   4. Register all views, commands, and providers — Phases 5-14
 *
 * Each phase builds on this foundation. Stubs are left in place (commented out)
 * to show where later phases plug in.
 */

import * as vscode from 'vscode';

// Phase 4+: these imports will be uncommented as phases are implemented
// import { RepositoryManager } from '../core/repository-manager.js';
// import { JjCliImpl } from '../core/jj-cli.js';
// import { ConfigService } from './config.js';
// import { OutputChannelLogger } from './output-channel.js';
// import { FileWatcher } from './file-watcher.js';
// import { CommandService } from './commands/registry.js';

/** Minimum jj version required for json() template support. */
const MIN_JJ_VERSION = '0.25.0';

/** Extension identifier used for output channel naming and context key prefixes. */
const EXTENSION_ID = 'jjvs';

/**
 * Called by VSCode when the extension activates (workspace contains .jj,
 * or a jjvs command is invoked).
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('Jujutsu', { log: true });
  context.subscriptions.push(outputChannel);

  outputChannel.info(`jjvs activating (extension version ${getExtensionVersion(context)})`);

  // Verify jj is available and meets the minimum version requirement.
  // Later phases replace this with a proper JjRunner + JjVersionChecker.
  const jjAvailable = await checkJjAvailable(outputChannel);
  if (!jjAvailable) {
    // Do not block activation — the extension degrades gracefully without jj.
    // Views will show an appropriate "jj not found" message.
    outputChannel.warn(
      `jj binary not found. Install jj >= ${MIN_JJ_VERSION} and ensure it is on your PATH, ` +
        `or configure the path via the 'jjvs.jjPath' setting.`,
    );
    void vscode.window.showWarningMessage(
      `Jujutsu for VSCode: jj binary not found. ` +
        `Please install jj >= ${MIN_JJ_VERSION} or set jjvs.jjPath.`,
      'Open Settings',
    ).then((choice) => {
      if (choice === 'Open Settings') {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'jjvs.jjPath');
      }
    });
  }

  // Set initial context keys so views render correctly even before full initialization.
  await setContextKey('hasRepository', false);
  await setContextKey('isColocated', false);
  await setContextKey('hasConflicts', false);
  await setContextKey('revisionSelected', false);
  await setContextKey('fileSelected', false);

  // Phase 4: initialize RepositoryManager, ConfigService, FileWatcher, OutputChannelLogger
  // Phase 5: register SCM provider
  // Phase 6: register revision tree view and revset completion
  // Phase 7: register revision commands
  // Phase 8: register conflict handling
  // Phase 9: register rebase command
  // Phase 10: register bookmarks tree and git commands
  // Phase 11: register op log tree and undo/redo
  // Phase 12: register details view and file-level commands
  // Phase 13: register preview panel
  // Phase 14: register graph webview

  outputChannel.info(`jjvs activated`);
}

/** Called by VSCode when the extension deactivates (workspace closed, extension disabled, etc.). */
export function deactivate(): void {
  // All disposables are registered on context.subscriptions in activate(),
  // so VSCode cleans them up automatically. Nothing to do here explicitly.
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the extension version from package.json.
 */
function getExtensionVersion(context: vscode.ExtensionContext): string {
  // safe: @types/vscode types packageJSON as { readonly [key: string]: unknown }, so indexing
  // produces `unknown`. The VS Code extension host guarantees `version` is a string per the
  // package.json schema (https://code.visualstudio.com/api/references/extension-manifest).
  const version = context.extension.packageJSON['version'] as string | undefined;
  return version ?? 'unknown';
}

/**
 * Sets a jjvs context key in VSCode's when-clause context.
 * All jjvs context keys are prefixed with "jjvs:" for namespacing.
 */
async function setContextKey(key: string, value: unknown): Promise<void> {
  await vscode.commands.executeCommand('setContext', `${EXTENSION_ID}:${key}`, value);
}

/**
 * Checks whether the jj binary is available and logs its version.
 *
 * This is a lightweight pre-check using Node's child_process directly,
 * before the full JjRunner infrastructure is initialized in Phase 2.
 *
 * Returns true if jj is available, false otherwise.
 */
async function checkJjAvailable(outputChannel: vscode.LogOutputChannel): Promise<boolean> {
  const config = vscode.workspace.getConfiguration('jjvs');
  const jjPath = config.get<string>('jjPath') ?? 'jj';

  return new Promise((resolve) => {
    // Dynamic import of child_process to avoid issues in browser extension hosts.
    // (jjvs is a desktop-only extension, but defensive import is good practice.)
    import('child_process').then(({ execFile }) => {
      execFile(jjPath, ['--version'], { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }

        const version = stdout.trim();
        outputChannel.info(`Found: ${version} (at '${jjPath}')`);

        // Phase 2b: replace this with JjVersionChecker.checkMinimumVersion()
        // which parses the version string and compares against MIN_JJ_VERSION.
        resolve(true);
      });
    }).catch(() => {
      resolve(false);
    });
  });
}
