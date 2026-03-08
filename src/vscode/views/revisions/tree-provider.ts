/**
 * Revision log TreeDataProvider for the `jjvs.revisions` view.
 *
 * Wraps a `RepositoryState` and adapts its revision list to VSCode's
 * `TreeDataProvider` API. Subscribes to repository change events and fires
 * `onDidChangeTreeData` to trigger view updates.
 *
 * ## Pagination
 *
 * If the repository returns a revision list at the current log limit (meaning
 * there may be more revisions), a `LoadMoreTreeItem` is appended. Clicking it
 * calls `loadMore()`, which increases the limit by `LOAD_MORE_BATCH_SIZE` and
 * triggers a fresh `RepositoryState.refresh()`.
 *
 * ## Multi-repo
 *
 * For Phase 6a, the provider displays the revisions of a single repository.
 * The active repository is set via `setRepository()`. If no repository has
 * been set, the tree is empty.
 */

import * as vscode from 'vscode';
import type { RepositoryState, RepositoryStateEvent } from '../../../core/repository';
import { renderGraph } from './graph-renderer';
import { RevisionTreeItem, LoadMoreTreeItem } from './tree-items';

/** How many additional revisions to load per "Load more..." click. */
const LOAD_MORE_BATCH_SIZE = 50;

/** Union type for all nodes in the revision tree. */
export type RevisionTreeNode = RevisionTreeItem | LoadMoreTreeItem;

/**
 * Tree data provider for the jj revision log (`jjvs.revisions`) view.
 *
 * One global instance is created in `extension.ts`. When the active
 * repository changes (discovery, removal, workspace-folder change), call
 * `setRepository()` to update the provider.
 */
export class RevisionLogTreeProvider
  implements vscode.TreeDataProvider<RevisionTreeNode>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<
    RevisionTreeNode | RevisionTreeNode[] | undefined | null | void
  >();

  /** Fires when the tree data has changed and the view should refresh. */
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private _repository: RepositoryState | null = null;
  private _logLimit: number;

  // Subscription to the current repository's onDidChange event.
  private _repoSubscription: vscode.Disposable | null = null;

  constructor(initialLogLimit: number) {
    this._logLimit = initialLogLimit;
  }

  // ── Repository management ─────────────────────────────────────────────────

  /**
   * Set the repository whose revisions this provider displays.
   *
   * Pass `null` to show an empty tree (e.g., when no jj repo is discovered).
   * The provider unsubscribes from the previous repository's change events
   * and subscribes to the new one.
   */
  setRepository(repository: RepositoryState | null): void {
    this._repoSubscription?.dispose();
    this._repoSubscription = null;
    this._repository = repository;

    if (repository !== null) {
      this._repoSubscription = repository.onDidChange((event: RepositoryStateEvent) => {
        // Skip 'refreshing' events — data hasn't changed yet, so re-rendering
        // would briefly show the previous list again before the update arrives.
        // Re-render on 'changed' (new data) and 'error' (refresh failed, show
        // whatever partial state exists).
        if (event.kind !== 'refreshing') {
          this.changeEmitter.fire();
        }
      });
    }

    this.changeEmitter.fire();
  }

  // ── TreeDataProvider ──────────────────────────────────────────────────────

  getTreeItem(element: RevisionTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RevisionTreeNode): RevisionTreeNode[] {
    // Revisions are top-level items only — no children.
    if (element !== undefined) {
      return [];
    }

    const repository = this._repository;
    if (repository === null) {
      return [];
    }

    const revisions = repository.revisions;
    if (revisions.length === 0) {
      return [];
    }

    const graphRows = renderGraph(revisions);
    const items: RevisionTreeNode[] = revisions.map(
      (revision, index) =>
        new RevisionTreeItem(revision, graphRows[index]?.nodePrefix ?? '○'),
    );

    // Append "Load more..." if the list length equals the current limit,
    // suggesting the repository may have more revisions to show.
    if (revisions.length >= this._logLimit) {
      items.push(new LoadMoreTreeItem(this._logLimit));
    }

    return items;
  }

  // ── Pagination ─────────────────────────────────────────────────────────────

  /**
   * Increase the log limit and trigger a repository refresh to fetch more
   * revisions. Called when the user clicks the "Load more..." item.
   */
  loadMore(): void {
    this._logLimit += LOAD_MORE_BATCH_SIZE;

    if (this._repository !== null) {
      this._repository.updateLogLimit(this._logLimit);
      void this._repository.refresh();
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  dispose(): void {
    this._repoSubscription?.dispose();
    this.changeEmitter.dispose();
  }
}
