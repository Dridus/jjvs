/**
 * Multi-repository discovery and lifecycle manager.
 *
 * `RepositoryManager` finds jj repositories within the set of workspace paths
 * and manages the lifecycle of their `RepositoryState` instances. When workspace
 * paths change (e.g., a folder is added or removed), call `updateWorkspacePaths()`
 * to synchronise the repository list.
 *
 * ## Repository detection
 *
 * A directory is treated as a jj repository root if it contains a `.jj/`
 * subdirectory. This check is synchronous and uses `fs.existsSync()`.
 *
 * Note: If the workspace folder is a subdirectory of the jj repository (not the
 * root), this detection will miss it. Improving this by running `jj root` is a
 * known limitation tracked for a future phase.
 *
 * ## Colocated vs native detection
 *
 * A repository is classified as `'colocated'` if both `.jj/` and `.git/` exist
 * at the root path, and `'native'` otherwise. This determines whether git-specific
 * commands (push, fetch) are exposed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { RepositoryState, type RepositoryStateConfig } from './repository';
import type { RepoKind } from './types';
import { TypedEventEmitter, type Disposable } from './event-emitter';
import type { JjCli } from './jj-cli';

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Factory function that creates a `JjCli` bound to a specific repository root.
 * The root path is used as the working directory for all jj commands.
 */
export type JjCliFactory = (rootPath: string) => JjCli;

// ─── Configuration ────────────────────────────────────────────────────────────

/** Configuration passed to `RepositoryManager`. Kept in sync via `ConfigService`. */
export type RepositoryManagerConfig = RepositoryStateConfig;

// ─── RepositoryManager ────────────────────────────────────────────────────────

/**
 * Manages discovery and lifecycle of all jj repositories in the workspace.
 *
 * UI components that need repo-agnostic data (e.g., `StatusBar`) should use
 * `repositories` to get all active repos. Components that need the repo for a
 * specific resource URI should use `getRepositoryForPath()`.
 */
export class RepositoryManager implements Disposable {
  private readonly repos = new Map<string, RepositoryState>();
  private readonly changeEmitter = new TypedEventEmitter<void>();

  /**
   * Fires when the list of known repositories changes
   * (repos added, removed, or re-detected).
   */
  readonly onDidChangeRepositories = this.changeEmitter.event;

  constructor(
    private readonly cliFactory: JjCliFactory,
    private readonly config: RepositoryManagerConfig,
  ) {}

  // ── Accessors ──────────────────────────────────────────────────────────────

  /** All currently active repository states. */
  get repositories(): readonly RepositoryState[] {
    return [...this.repos.values()];
  }

  /**
   * Find the repository whose root path is a prefix of the given absolute path.
   *
   * Returns `undefined` if no managed repository contains the path.
   * When multiple repos could match (nested repos), returns the deepest match.
   */
  getRepositoryForPath(filePath: string): RepositoryState | undefined {
    let bestMatch: RepositoryState | undefined;
    let bestLength = 0;
    for (const [rootPath, repo] of this.repos) {
      const normalised = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep;
      if (filePath === rootPath || filePath.startsWith(normalised)) {
        if (rootPath.length > bestLength) {
          bestMatch = repo;
          bestLength = rootPath.length;
        }
      }
    }
    return bestMatch;
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  /**
   * Update the set of managed repositories based on the given workspace paths.
   *
   * Repositories that are no longer present in `workspacePaths` are disposed.
   * Newly discovered repositories are initialised and an initial refresh is
   * triggered.
   *
   * Call this at activation and whenever `vscode.workspace.workspaceFolders` changes.
   */
  async updateWorkspacePaths(workspacePaths: readonly string[]): Promise<void> {
    const foundRoots = new Set(discoverJjRoots(workspacePaths));

    // Remove repos that are no longer in the workspace
    for (const [rootPath, repo] of this.repos) {
      if (!foundRoots.has(rootPath)) {
        repo.dispose();
        this.repos.delete(rootPath);
      }
    }

    // Add newly discovered repos
    let anyAdded = false;
    for (const rootPath of foundRoots) {
      if (!this.repos.has(rootPath)) {
        const kind = detectRepoKind(rootPath);
        const cli = this.cliFactory(rootPath);
        const repo = new RepositoryState(rootPath, kind, cli, this.config);
        this.repos.set(rootPath, repo);
        anyAdded = true;
        // Trigger initial data load (don't await — it runs in the background)
        void repo.refresh();
      }
    }

    if (anyAdded || this.repos.size !== foundRoots.size) {
      this.changeEmitter.fire(undefined);
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  dispose(): void {
    for (const repo of this.repos.values()) {
      repo.dispose();
    }
    this.repos.clear();
    this.changeEmitter.dispose();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Find jj repository roots within the given workspace paths.
 *
 * Each path that contains a `.jj/` subdirectory is treated as a repository root.
 * Paths without `.jj/` are skipped (no upward traversal in Phase 4).
 */
export function discoverJjRoots(workspacePaths: readonly string[]): string[] {
  const roots: string[] = [];
  for (const wsPath of workspacePaths) {
    if (fs.existsSync(path.join(wsPath, '.jj'))) {
      roots.push(wsPath);
    }
  }
  return roots;
}

/**
 * Classify a jj repository as native or colocated.
 *
 * A colocated repository has both `.jj/` and `.git/` at the root.
 * This indicates that jj and git share the same working copy.
 */
export function detectRepoKind(rootPath: string): RepoKind {
  return fs.existsSync(path.join(rootPath, '.git')) ? 'colocated' : 'native';
}
