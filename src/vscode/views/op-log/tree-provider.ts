/**
 * TreeDataProvider for the jj operation log tree view (jjvs.oplog).
 *
 * Shows the operation history as a flat list, most recent first.
 * Each item represents one jj operation (new, describe, rebase, etc.)
 * and can be restored via the context menu action.
 *
 * Operation data is fetched concurrently with revisions during each
 * `RepositoryState.refresh()` cycle. The tree refreshes automatically on
 * every `RepositoryState.onDidChange` event.
 */

import * as vscode from 'vscode';
import type { RepositoryState } from '../../../core/repository';
import { OperationTreeItem, type OpLogTreeItem } from './tree-items';

/**
 * Provides tree data for the `jjvs.oplog` view.
 *
 * Instantiated once in `extension.ts` and wired to a new repository
 * whenever `RepositoryManager` discovers one.
 */
export class OpLogTreeProvider
  implements vscode.TreeDataProvider<OpLogTreeItem>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<OpLogTreeItem | undefined>();
  /** Fires when the tree data changes, triggering a VSCode tree refresh. */
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private repository: RepositoryState | null = null;
  private repositoryChangeDisposable: vscode.Disposable | undefined;

  /**
   * Set the active repository. Pass `null` to clear (empty view when no repo).
   *
   * Subscribes to the new repository's `onDidChange` event to keep the tree
   * view in sync, and disposes the previous subscription.
   */
  setRepository(repository: RepositoryState | null): void {
    this.repositoryChangeDisposable?.dispose();
    this.repositoryChangeDisposable = undefined;
    this.repository = repository;

    if (repository !== null) {
      this.repositoryChangeDisposable = repository.onDidChange(() => {
        this.changeEmitter.fire(undefined);
      });
    }

    // Fire immediately so the view reflects the new (or absent) repository.
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: OpLogTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: OpLogTreeItem): OpLogTreeItem[] {
    if (this.repository === null) {
      return [];
    }

    // Flat list — operations are already sorted most-recent-first by jj.
    return this.repository.operations.map((op) => new OperationTreeItem(op));
  }

  dispose(): void {
    this.repositoryChangeDisposable?.dispose();
    this.changeEmitter.dispose();
  }
}
