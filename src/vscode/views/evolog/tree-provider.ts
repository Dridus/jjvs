/**
 * TreeDataProvider for the jj evolution log view (jjvs.evolog).
 *
 * Shows all past snapshots of the currently selected revision's change ID.
 * Each snapshot is a distinct commit that was recorded under the same change ID
 * at some point in time (e.g., before/after an amend, rebase, or squash).
 *
 * ## Data flow
 *
 * 1. `extension.ts` subscribes to `revisionTreeView.onDidChangeSelection`.
 * 2. On selection change it calls `evologTreeProvider.setRevision(rev, repo)`.
 * 3. The provider fetches the evolution log asynchronously via `repo.jjCli.evolog()`.
 * 4. When the fetch completes it fires `onDidChangeTreeData` to trigger a refresh.
 * 5. `getChildren()` returns `EvologTreeItem[]` (or a placeholder item while
 *    loading / when no revision is selected).
 *
 * ## Stale-request guard
 *
 * Each fetch stores the `changeId` being loaded. If a new revision is selected
 * before the fetch completes, the older result is discarded.
 */

import * as vscode from 'vscode';
import type { RepositoryState } from '../../../core/repository';
import type { Revision } from '../../../core/types';
import { EvologTreeItem, EvologLoadingTreeItem, EvologEmptyTreeItem } from './tree-items';

/** Union of all item types the evolution log view can render. */
export type EvologTreeItemUnion = EvologTreeItem | EvologLoadingTreeItem | EvologEmptyTreeItem;

/**
 * Provides tree data for the `jjvs.evolog` view.
 *
 * Instantiated once in `extension.ts` and updated via `setRevision()` whenever
 * the revision selection changes in the `jjvs.revisions` tree view.
 */
export class EvologTreeProvider
  implements vscode.TreeDataProvider<EvologTreeItemUnion>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<EvologTreeItemUnion | undefined>();

  /** Fires when the tree data changes, triggering a VSCode tree refresh. */
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private _repository: RepositoryState | null = null;
  private _revision: Revision | null = null;

  /**
   * Cached evolution log entries for the current revision.
   * `undefined` means "not yet loaded" (triggers loading placeholder).
   */
  private _entries: readonly Revision[] | undefined = undefined;

  /**
   * The changeId of the revision whose evolog is currently being fetched.
   * Used to discard stale results when the selection changes rapidly.
   */
  private _loadingForChangeId: string | undefined = undefined;

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Update the revision shown in the evolution log.
   *
   * Triggers an async fetch of the evolution log for the new revision.
   * Pass `null` for either argument to clear the view.
   *
   * @param revision   - The revision to show the evolution log for.
   * @param repository - The repository that owns this revision.
   */
  setRevision(revision: Revision | null, repository: RepositoryState | null): void {
    this._revision = revision;
    this._repository = repository;
    this._entries = undefined;
    this._loadingForChangeId = undefined;

    if (revision !== null && repository !== null) {
      this._startLoad(revision, repository);
    } else {
      this.changeEmitter.fire(undefined);
    }
  }

  // ── TreeDataProvider ────────────────────────────────────────────────────────

  getTreeItem(element: EvologTreeItemUnion): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: EvologTreeItemUnion): EvologTreeItemUnion[] {
    if (this._revision === null || this._repository === null) {
      return [new EvologEmptyTreeItem('Select a revision to see its evolution log')];
    }

    if (this._entries === undefined) {
      return [new EvologLoadingTreeItem()];
    }

    if (this._entries.length === 0) {
      return [new EvologEmptyTreeItem('No evolution history available')];
    }

    const total = this._entries.length;
    return this._entries.map((entry, index) => new EvologTreeItem(entry, index, total));
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.changeEmitter.dispose();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Asynchronously fetch the evolution log for `revision` and update state.
   *
   * Fires `onDidChangeTreeData` twice:
   * 1. Immediately — to show the loading spinner.
   * 2. After the fetch completes — to show the entries (or empty state on error).
   */
  private _startLoad(revision: Revision, repository: RepositoryState): void {
    this._loadingForChangeId = revision.changeId;
    this.changeEmitter.fire(undefined);

    void repository.jjCli
      .evolog(revision.changeId)
      .then((result) => {
        if (this._loadingForChangeId !== revision.changeId) return;

        this._loadingForChangeId = undefined;

        if (result.ok) {
          this._entries = result.value;
        } else {
          // Degrade gracefully: show empty rather than an error overlay.
          this._entries = [];
        }

        this.changeEmitter.fire(undefined);
      });
  }
}
