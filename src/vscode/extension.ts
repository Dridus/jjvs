/**
 * jjvs – Jujutsu for VSCode
 *
 * Extension entry point. Handles activation and deactivation lifecycle.
 *
 * On activation:
 *   1. Create output channel and logger
 *   2. Read configuration via ConfigService
 *   3. Verify jj binary is available and meets the minimum version requirement
 *   4. Initialize RepositoryManager and file watchers
 *   5. Register all views, commands, and providers — Phases 5-14
 *
 * Each phase builds on this foundation. Stubs are left in place (commented out)
 * to show where later phases plug in.
 */

import * as vscode from 'vscode';
import { JjRunnerImpl } from '../core/jj-runner';
import { JjCliImpl } from '../core/jj-cli';
import {
  meetsMinimumVersion,
  formatVersion,
  getCapabilities,
  MINIMUM_JJ_VERSION,
  type JjCapabilities,
} from '../core/jj-version';
import { RepositoryManager } from '../core/repository-manager';
import { ConfigService } from './config';
import { OutputChannelLogger } from './output-channel';
import { FileWatcher } from './file-watcher';
import { JjFileDecorationProvider } from './scm/decorations';
import { JjvsSCMProvider } from './scm/provider';
import { JjOriginalContentProvider, JJ_ORIGINAL_SCHEME } from './scm/quick-diff';
import { RevisionLogTreeProvider } from './views/revisions/tree-provider';
import type { RevisionTreeItem } from './views/revisions/tree-items';

/** Extension identifier used for output channel naming and context key prefixes. */
const EXTENSION_ID = 'jjvs';

/**
 * Called by VSCode when the extension activates (workspace contains .jj,
 * or a jjvs command is invoked).
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── 1. Output channel ────────────────────────────────────────────────────

  const rawChannel = vscode.window.createOutputChannel('Jujutsu', { log: true });
  context.subscriptions.push(rawChannel);

  const configService = new ConfigService();
  context.subscriptions.push(configService);

  const logger = new OutputChannelLogger(rawChannel);

  logger.info(`jjvs activating (extension version ${getExtensionVersion(context)})`);

  // ── 2. jj binary and version check ───────────────────────────────────────

  // Use a temporary JjCli (no repo root needed for --version) to go through
  // the same Result/JjError path as all other jj commands rather than having
  // a parallel raw execFile code path.
  const jjPath = configService.jjPath;
  const versionCli = new JjCliImpl(
    new JjRunnerImpl({ jjPath, workingDirectory: process.cwd() }),
  );
  const versionResult = await versionCli.version();

  /** Capability flags derived from the detected jj version. Null if jj not found. */
  let capabilities: JjCapabilities | null = null;

  if (!versionResult.ok) {
    const errorKind = versionResult.error.kind;
    if (errorKind === 'not-found') {
      logger.warn(
        `jj binary not found at '${jjPath}'. ` +
          `Install jj >= ${formatVersion(MINIMUM_JJ_VERSION)} and ensure it is on your PATH, ` +
          `or configure the path via 'jjvs.jjPath'.`,
      );
      void vscode.window
        .showWarningMessage(
          `Jujutsu for VSCode: jj binary not found. ` +
            `Please install jj >= ${formatVersion(MINIMUM_JJ_VERSION)} or set jjvs.jjPath.`,
          'Open Settings',
        )
        .then((choice) => {
          if (choice === 'Open Settings') {
            void vscode.commands.executeCommand('workbench.action.openSettings', 'jjvs.jjPath');
          }
        });
    } else {
      logger.warn(`jj version check failed: ${versionResult.error.message}`);
    }
    // Degrade gracefully — extension still activates, views show "jj not found"
  } else {
    const version = versionResult.value;
    if (!meetsMinimumVersion(version)) {
      logger.warn(
        `jj version ${version.raw} is below the minimum required ` +
          `${formatVersion(MINIMUM_JJ_VERSION)}. Some features may not be available.`,
      );
      void vscode.window.showWarningMessage(
        `Jujutsu for VSCode: jj ${version.raw} is below the minimum required ` +
          `${formatVersion(MINIMUM_JJ_VERSION)}. Please upgrade jj.`,
      );
    } else {
      logger.info(`Found jj ${version.raw}`);
    }
    capabilities = getCapabilities(version);
    logger.debug('jj capabilities', capabilities);
  }

  // ── 3. Set initial context keys ──────────────────────────────────────────

  await setContextKey('hasRepository', false);
  await setContextKey('isColocated', false);
  await setContextKey('hasConflicts', false);
  await setContextKey('revisionSelected', false);
  await setContextKey('fileSelected', false);

  // ── 4. Repository manager and file watchers ──────────────────────────────

  const repositoryManager = new RepositoryManager(
    (rootPath) =>
      new JjCliImpl(
        new JjRunnerImpl({
          jjPath: configService.jjPath,
          workingDirectory: rootPath,
        }),
      ),
    configService.getRepositoryConfig(),
  );
  context.subscriptions.push(repositoryManager);

  // Track file watchers per repository root so they can be disposed when a
  // repository is removed from the workspace.
  const fileWatchers = new Map<string, FileWatcher>();

  const syncFileWatchers = (): void => {
    const repoRoots = new Set(repositoryManager.repositories.map((r) => r.rootPath));

    // Add watchers for new repositories
    for (const repo of repositoryManager.repositories) {
      if (!fileWatchers.has(repo.rootPath)) {
        const watcher = new FileWatcher(
          repo.rootPath,
          configService.getAutoRefreshInterval(),
        );
        watcher.onDidChange(() => {
          if (configService.getAutoRefresh()) {
            // Phase 7a: call watcher.suppressNextChange() before jjvs-initiated
            // jj commands so that the file watcher doesn't trigger a redundant
            // refresh on top of the explicit post-command refresh.
            repo.scheduleRefresh();
          }
        });
        fileWatchers.set(repo.rootPath, watcher);
        logger.debug(`File watcher started for ${repo.rootPath}`);
      }
    }

    // Remove watchers for repositories that are no longer managed
    for (const [rootPath, watcher] of fileWatchers) {
      if (!repoRoots.has(rootPath)) {
        watcher.dispose();
        fileWatchers.delete(rootPath);
        logger.debug(`File watcher stopped for ${rootPath}`);
      }
    }
  };

  // ── 5. SCM provider and file decorations ─────────────────────────────────

  const decorationProvider = new JjFileDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider),
    decorationProvider,
  );

  // Register the content provider that serves `jj-original:` URIs for inline
  // gutter diffs. A single global instance handles all repositories; the
  // rootPath encoded in each URI's query determines which repo to query.
  const originalContentProvider = new JjOriginalContentProvider((filePath) =>
    repositoryManager.getRepositoryForPath(filePath),
  );
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      JJ_ORIGINAL_SCHEME,
      originalContentProvider,
    ),
    originalContentProvider,
  );

  const scmProviders = new Map<string, JjvsSCMProvider>();

  const syncSCMProviders = (): void => {
    const repoRoots = new Set(repositoryManager.repositories.map((r) => r.rootPath));

    for (const repo of repositoryManager.repositories) {
      if (!scmProviders.has(repo.rootPath)) {
        const provider = new JjvsSCMProvider(repo, decorationProvider, logger);
        scmProviders.set(repo.rootPath, provider);
        logger.debug(`SCM provider registered for ${repo.rootPath}`);
      }
    }

    for (const [rootPath, provider] of scmProviders) {
      if (!repoRoots.has(rootPath)) {
        provider.dispose();
        scmProviders.delete(rootPath);
        logger.debug(`SCM provider disposed for ${rootPath}`);
      }
    }
  };

  context.subscriptions.push({
    dispose: () => {
      for (const provider of scmProviders.values()) {
        provider.dispose();
      }
      scmProviders.clear();
    },
  });

  // Update context keys when repositories change.
  // hasConflicts is derived from the most recently refreshed repo state.
  context.subscriptions.push(
    repositoryManager.onDidChangeRepositories(() => {
      const repos = repositoryManager.repositories;
      void setContextKey('hasRepository', repos.length > 0);
      void setContextKey('isColocated', repos.some((r) => r.kind === 'colocated'));
      updateConflictContextKey();
      syncFileWatchers();
      syncSCMProviders();
    }),
  );

  /** Re-evaluate hasConflicts across all known repositories. */
  const updateConflictContextKey = (): void => {
    const hasConflicts = repositoryManager.repositories.some(
      (r) => r.workingCopyStatus?.hasConflicts === true,
    );
    void setContextKey('hasConflicts', hasConflicts);
  };

  // Dispose all watchers when the extension deactivates
  context.subscriptions.push({
    dispose: () => {
      for (const watcher of fileWatchers.values()) {
        watcher.dispose();
      }
      fileWatchers.clear();
    },
  });

  // Propagate setting changes to the repository manager. If revset or logLimit
  // change, rebuild the config and trigger a refresh so views reflect the new
  // settings immediately without requiring a reload.
  context.subscriptions.push(
    configService.onDidChangeConfig(() => {
      // The factory closure reads jjPath afresh on each repo creation, so
      // new repos will pick up a changed jjPath automatically. For existing
      // repos, a simple refresh is sufficient since they re-read jjPath via
      // the runner config at construction time.
      const newConfig = configService.getRepositoryConfig();
      logger.debug('Configuration changed — refreshing repositories', newConfig);
      for (const repo of repositoryManager.repositories) {
        void repo.refresh();
      }
    }),
  );

  // Discover repositories in the current workspace
  const workspacePaths = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  await repositoryManager.updateWorkspacePaths(workspacePaths);
  syncFileWatchers();
  syncSCMProviders();

  // Subscribe to each repo's change events so hasConflicts stays current.
  for (const repo of repositoryManager.repositories) {
    context.subscriptions.push(
      repo.onDidChange(() => updateConflictContextKey()),
    );
  }

  // Re-discover when workspace folders change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
      logger.debug('Workspace folders changed', {
        added: e.added.map((f) => f.uri.fsPath),
        removed: e.removed.map((f) => f.uri.fsPath),
      });
      const paths = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
      await repositoryManager.updateWorkspacePaths(paths);
      syncFileWatchers();
      syncSCMProviders();
    }),
  );

  // Phase 5: SCM provider registered above (decorationProvider + syncSCMProviders)

  context.subscriptions.push(
    vscode.commands.registerCommand('jjvs.refresh', () => {
      for (const repo of repositoryManager.repositories) {
        void repo.refresh();
      }
    }),
  );

  // Called by the SCM input box ✓ button (acceptInputCommand). The rootPath
  // argument is pre-bound in JjvsSCMProvider.acceptInputCommand.arguments so
  // we know which SCM provider (and repository) to act on.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'jjvs.describeWorkingCopy',
      (rootPath?: string) => {
        const provider =
          rootPath !== undefined
            ? scmProviders.get(rootPath)
            : // Fallback: use the first provider if there is exactly one repo.
              scmProviders.size === 1
              ? [...scmProviders.values()][0]
              : undefined;

        if (provider === undefined) {
          logger.warn(
            `jjvs.describeWorkingCopy: no SCM provider found for rootPath=${rootPath ?? '(none)'}`,
          );
          return;
        }

        void provider.executeDescribe();
      },
    ),
  );

  // Invalidate original-content URIs after each repository refresh so that
  // gutter indicators update when the parent revision changes (e.g., after
  // rebase or squash).
  for (const repo of repositoryManager.repositories) {
    context.subscriptions.push(
      repo.onDidChange(() => originalContentProvider.invalidateRepository(repo.rootPath)),
    );
  }

  // ── 6. Revision log tree view ─────────────────────────────────────────────

  const revisionTreeProvider = new RevisionLogTreeProvider(configService.getLogLimit());
  context.subscriptions.push(revisionTreeProvider);

  // Set the active repository from the first discovered repo (Phase 6a: single repo).
  // When repositories change, update the provider so the view stays current.
  const syncRevisionTree = (): void => {
    const repos = repositoryManager.repositories;
    revisionTreeProvider.setRepository(repos.length > 0 ? repos[0] : null);
  };

  const revisionTreeView = vscode.window.createTreeView('jjvs.revisions', {
    treeDataProvider: revisionTreeProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(revisionTreeView);

  // Update the revisionSelected context key when the tree selection changes.
  context.subscriptions.push(
    revisionTreeView.onDidChangeSelection((e) => {
      const selected = e.selection[0];
      const isRevisionItem =
        selected !== undefined && 'revision' in selected && selected.revision !== undefined;
      void setContextKey('revisionSelected', isRevisionItem);
    }),
  );

  // Wire repository discovery to the revision tree.
  context.subscriptions.push(
    repositoryManager.onDidChangeRepositories(() => {
      syncRevisionTree();
    }),
  );

  syncRevisionTree();

  // ── 6a. Revision view commands ────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('jjvs.revisions.loadMore', () => {
      revisionTreeProvider.loadMore();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jjvs.revision.copyChangeId', () => {
      const selected = revisionTreeView.selection[0];
      if (selected === undefined || !('revision' in selected)) return;
      // safe: the 'revision' in selected guard above confirms this is a RevisionTreeItem;
      // TypeScript does not narrow class-instance union types via the `in` operator alone.
      const item = selected as RevisionTreeItem;
      void vscode.env.clipboard.writeText(item.revision.changeId).then(() => {
        void vscode.window.showInformationMessage(
          `Copied change ID: ${item.revision.changeId.substring(0, 12)}`,
        );
      });
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('jjvs.revision.copyCommitId', () => {
      const selected = revisionTreeView.selection[0];
      if (selected === undefined || !('revision' in selected)) return;
      // safe: the 'revision' in selected guard above confirms this is a RevisionTreeItem;
      // TypeScript does not narrow class-instance union types via the `in` operator alone.
      const item = selected as RevisionTreeItem;
      void vscode.env.clipboard.writeText(item.revision.commitId).then(() => {
        void vscode.window.showInformationMessage(
          `Copied commit ID: ${item.revision.commitId.substring(0, 12)}`,
        );
      });
    }),
  );

  // Phase 6b: register revset completion and filtering
  // Phase 7: register revision commands (also wire FileWatcher.suppressNextChange to CommandService)
  // Phase 8: register conflict handling
  // Phase 9: register rebase command
  // Phase 10: register bookmarks tree and git commands
  // Phase 11: register op log tree and undo/redo
  // Phase 12: register details view and file-level commands
  // Phase 13: register preview panel
  // Phase 14: register graph webview

  // Expose capabilities so later phases can gate features at registration time.
  // Usage: `if (capabilities?.hasJsonTemplate) { ... }`
  void capabilities; // referenced by later phases; suppress unused-variable lint

  const repoCount = repositoryManager.repositories.length;
  logger.info(
    `jjvs activated — found ${repoCount} jj ${repoCount === 1 ? 'repository' : 'repositories'}`,
  );
}

/** Called by VSCode when the extension deactivates (workspace closed, extension disabled, etc.). */
export function deactivate(): void {
  // All disposables are registered on context.subscriptions in activate(),
  // so VSCode cleans them up automatically. Nothing to do here explicitly.
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Returns the extension version from package.json.
 *
 * Safe: `packageJSON` is typed as `{ readonly [key: string]: unknown }` by @types/vscode,
 * but the VSCode extension host always bundles package.json and guarantees `version`
 * is a string per the extension manifest schema.
 */
function getExtensionVersion(context: vscode.ExtensionContext): string {
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
