/**
 * TreeDataProvider for the jj revision details view (jjvs.details).
 *
 * Shows the files changed in the currently selected revision. When a revision
 * is selected in the revisions tree, `setRevision()` is called with the new
 * revision and repository, triggering an async fetch of file changes via
 * `jj diff --summary -r <changeId>`.
 *
 * ## Data flow
 *
 * 1. `extension.ts` subscribes to `revisionTreeView.onDidChangeSelection`.
 * 2. On selection change it calls `detailsTreeProvider.setRevision(rev, repo)`.
 * 3. The provider fetches file changes asynchronously via `repo.jjCli.diff()`.
 * 4. When the fetch completes it fires `onDidChangeTreeData` to trigger a
 *    VSCode tree refresh.
 * 5. `getChildren()` returns `FileChangeTreeItem[]` (or a placeholder item
 *    while loading / when no revision is selected).
 *
 * ## Stale-request guard
 *
 * Each fetch stores the `changeId` of the revision being loaded. If a new
 * revision is selected while a fetch is in progress, the older result is
 * discarded when it arrives (checked via `_loadingForChangeId`).
 */

import * as vscode from 'vscode';
import type { RepositoryState } from '../../../core/repository';
import type { Revision, FileChange } from '../../../core/types';
import { parseSummaryDiff } from '../../../core/deserializers/diff';
import {
  FileChangeTreeItem,
  LoadingTreeItem,
  EmptyTreeItem,
} from './tree-items';

/** Union of all item types the details view can render. */
export type DetailsTreeItem = FileChangeTreeItem | LoadingTreeItem | EmptyTreeItem;

/**
 * Provides tree data for the `jjvs.details` view.
 *
 * Instantiated once in `extension.ts` and updated via `setRevision()` whenever
 * the revision selection changes in the `jjvs.revisions` tree view.
 */
export class DetailsTreeProvider
  implements vscode.TreeDataProvider<DetailsTreeItem>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<DetailsTreeItem | undefined>();

  /** Fires when the tree data changes, triggering a VSCode tree refresh. */
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private _repository: RepositoryState | null = null;
  private _revision: Revision | null = null;

  /**
   * Cached file changes for the current revision.
   * `undefined` means "not yet loaded" (triggers loading placeholder).
   */
  private _fileChanges: readonly FileChange[] | undefined = undefined;

  /**
   * The changeId of the revision whose diff is currently being fetched.
   * Used to discard stale results when the selection changes rapidly.
   */
  private _loadingForChangeId: string | undefined = undefined;

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Update the revision shown in the details view.
   *
   * Triggers an async fetch of the file changes for the new revision.
   * Pass `null` for either argument to clear the view.
   *
   * @param revision   - The revision to show details for.
   * @param repository - The repository that owns this revision.
   */
  setRevision(revision: Revision | null, repository: RepositoryState | null): void {
    this._revision = revision;
    this._repository = repository;
    this._fileChanges = undefined;
    this._loadingForChangeId = undefined;

    if (revision !== null && repository !== null) {
      this._startLoad(revision, repository);
    } else {
      this.changeEmitter.fire(undefined);
    }
  }

  // ── TreeDataProvider ────────────────────────────────────────────────────────

  getTreeItem(element: DetailsTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(_element?: DetailsTreeItem): DetailsTreeItem[] {
    if (this._revision === null || this._repository === null) {
      return [new EmptyTreeItem('Select a revision to see its changed files')];
    }

    if (this._fileChanges === undefined) {
      // Data is being loaded; show a spinner placeholder.
      return [new LoadingTreeItem()];
    }

    if (this._fileChanges.length === 0) {
      return [new EmptyTreeItem('No file changes in this revision')];
    }

    // At this point _revision and _repository are guaranteed non-null:
    // the early return above handles the null case and _fileChanges is only
    // populated in _startLoad(), which is only called when both are non-null.
    const revision = this._revision;
    const rootPath = this._repository.rootPath;
    if (revision === null) return [];

    return this._fileChanges.map((fc) => new FileChangeTreeItem(fc, revision, rootPath));
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  dispose(): void {
    this.changeEmitter.dispose();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Asynchronously fetch the file changes for `revision` and update state.
   *
   * Fires `onDidChangeTreeData` twice:
   * 1. Immediately on call — to show the loading placeholder.
   * 2. After the fetch completes — to show the actual file list (or error fallback).
   */
  private _startLoad(revision: Revision, repository: RepositoryState): void {
    this._loadingForChangeId = revision.changeId;
    // Fire immediately so the tree shows the loading spinner.
    this.changeEmitter.fire(undefined);

    void repository.jjCli
      .diff({ changeId: revision.changeId, format: 'summary' })
      .then((result) => {
        // Discard stale results if the selection has changed since this fetch started.
        if (this._loadingForChangeId !== revision.changeId) return;

        this._loadingForChangeId = undefined;

        if (result.ok) {
          this._fileChanges = parseSummaryDiff(result.value);
        } else {
          // Degrade gracefully: show an empty list rather than an error overlay.
          // The error is visible via the output channel logger in CommandService.
          this._fileChanges = [];
        }

        this.changeEmitter.fire(undefined);
      });
  }
}
