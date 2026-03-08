/**
 * File decoration provider for jj working copy status.
 *
 * Decorates files in the VSCode Explorer with badges (A/M/D/R/C/!) and
 * theme colors corresponding to their jj working copy status. Parent
 * directories are decorated transitively so changed files are visible in
 * collapsed folder trees.
 *
 * A single instance is shared across all discovered repositories and
 * registered once via `vscode.window.registerFileDecorationProvider()`.
 * Each repository's SCM provider calls `update()` when working copy status
 * changes, and `clearRepository()` when the repository leaves the workspace.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { FileChange, FileStatus } from '../../core/types';

/**
 * Single-character badge for each file status shown in the Explorer and
 * other file pickers. Mirrors the single-char codes used by `jj status` output.
 */
function statusBadge(status: FileStatus): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'conflicted':
      return '!';
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return '?';
    }
  }
}

/**
 * Theme color token for each file status. Reuses `gitDecoration.*` tokens so
 * jjvs respects the user's installed color theme without requiring its own
 * color contribution points.
 */
function statusColor(status: FileStatus): vscode.ThemeColor {
  switch (status) {
    case 'added':
      return new vscode.ThemeColor('gitDecoration.addedResourceForeground');
    case 'modified':
      return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
    case 'deleted':
      return new vscode.ThemeColor('gitDecoration.deletedResourceForeground');
    case 'renamed':
      return new vscode.ThemeColor('gitDecoration.renamedResourceForeground');
    case 'copied':
      return new vscode.ThemeColor('gitDecoration.addedResourceForeground');
    case 'conflicted':
      return new vscode.ThemeColor('gitDecoration.conflictingResourceForeground');
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return new vscode.ThemeColor('gitDecoration.modifiedResourceForeground');
    }
  }
}

/**
 * VSCode `FileDecorationProvider` that reflects jj working copy status in the
 * Explorer, breadcrumbs, and other UI surfaces that display file paths.
 */
export class JjFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
  private readonly decorationsByPath = new Map<string, vscode.FileDecoration>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();

  /** Fires when decorations change, prompting VSCode to re-query `provideFileDecoration`. */
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[] | undefined> =
    this.changeEmitter.event;

  /**
   * Update file decorations for one repository.
   *
   * Replaces all previously tracked paths under `rootPath` with the new set
   * derived from `changes`. Fires `onDidChangeFileDecorations` for every path
   * that was added, removed, or had its badge changed.
   *
   * @param rootPath - Absolute path to the jj repository root.
   * @param changes - Current working copy file changes from `jj status`.
   */
  update(rootPath: string, changes: readonly FileChange[]): void {
    const newDecorationsByPath = new Map<string, vscode.FileDecoration>();
    for (const change of changes) {
      const absolutePath = path.join(rootPath, change.path);
      newDecorationsByPath.set(absolutePath, {
        badge: statusBadge(change.status),
        tooltip: `jj: ${change.status}`,
        color: statusColor(change.status),
        // Propagate to parent directories for all statuses except deleted.
        // Deleted files no longer exist on disk, so propagation would
        // incorrectly mark still-existing parent directories as modified.
        propagate: change.status !== 'deleted',
      });
    }

    const changedUris: vscode.Uri[] = [];

    // Detect added or badge-changed decorations
    for (const [fsPath, decoration] of newDecorationsByPath) {
      const existing = this.decorationsByPath.get(fsPath);
      if (existing === undefined || existing.badge !== decoration.badge) {
        changedUris.push(vscode.Uri.file(fsPath));
      }
    }

    // Detect removed decorations (paths under this root that are no longer changed)
    const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep;
    for (const fsPath of this.decorationsByPath.keys()) {
      if (
        (fsPath === rootPath || fsPath.startsWith(rootPrefix)) &&
        !newDecorationsByPath.has(fsPath)
      ) {
        changedUris.push(vscode.Uri.file(fsPath));
      }
    }

    // Replace old entries for this root with the new set
    for (const fsPath of [...this.decorationsByPath.keys()]) {
      if (fsPath === rootPath || fsPath.startsWith(rootPrefix)) {
        this.decorationsByPath.delete(fsPath);
      }
    }
    for (const [fsPath, decoration] of newDecorationsByPath) {
      this.decorationsByPath.set(fsPath, decoration);
    }

    if (changedUris.length > 0) {
      this.changeEmitter.fire(changedUris);
    }
  }

  /**
   * Remove all decorations for files under `rootPath`.
   * Called when a repository is removed from the workspace.
   */
  clearRepository(rootPath: string): void {
    const rootPrefix = rootPath.endsWith(path.sep) ? rootPath : rootPath + path.sep;
    const removedUris: vscode.Uri[] = [];
    for (const fsPath of [...this.decorationsByPath.keys()]) {
      if (fsPath === rootPath || fsPath.startsWith(rootPrefix)) {
        removedUris.push(vscode.Uri.file(fsPath));
        this.decorationsByPath.delete(fsPath);
      }
    }
    if (removedUris.length > 0) {
      this.changeEmitter.fire(removedUris);
    }
  }

  /**
   * Return the decoration for a single file URI, or `undefined` if jjvs has
   * no decoration for that path (e.g., the file is unchanged or not in a
   * managed repository).
   *
   * The `token` parameter is provided by VSCode but is unused here because
   * the lookup is a synchronous Map read that cannot be meaningfully cancelled.
   */
  provideFileDecoration(
    uri: vscode.Uri,
    _token: vscode.CancellationToken,
  ): vscode.FileDecoration | undefined {
    return this.decorationsByPath.get(uri.fsPath);
  }

  dispose(): void {
    this.changeEmitter.dispose();
    this.decorationsByPath.clear();
  }
}
