/**
 * TreeDataProvider for the jj bookmarks tree view (jjvs.bookmarks).
 *
 * Shows two collapsible sections:
 *   - **Local**: all local bookmarks from the current repository
 *   - **Remote**: all remote-tracking bookmarks, sorted by name then remote
 *
 * Bookmark data is derived from the repository's cached revision list.
 * Each revision carries its `localBookmarks` and `remoteBookmarks` arrays,
 * populated from `jj log` output via the `json()` template. No separate
 * `jj bookmark list` call is needed.
 *
 * The tree refreshes automatically on every `RepositoryState.onDidChange`
 * event (fired after each `jj log` run).
 */

import * as vscode from 'vscode';
import type { RepositoryState } from '../../../core/repository';
import { extractBookmarksFromRevisions } from '../../../core/deserializers/bookmark';
import {
  BookmarkSectionItem,
  LocalBookmarkTreeItem,
  RemoteBookmarkTreeItem,
  type BookmarkTreeItem,
} from './tree-items';

/**
 * Provides tree data for the `jjvs.bookmarks` view.
 *
 * Instantiated once in `extension.ts` and wired to a new repository
 * whenever `RepositoryManager` discovers one.
 */
export class BookmarkTreeProvider
  implements vscode.TreeDataProvider<BookmarkTreeItem>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<BookmarkTreeItem | undefined>();
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

  getTreeItem(element: BookmarkTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BookmarkTreeItem): BookmarkTreeItem[] {
    if (this.repository === null) {
      return [];
    }

    // Root level: two section headers
    if (element === undefined) {
      const bookmarks = extractBookmarksFromRevisions(this.repository.revisions);
      return [
        new BookmarkSectionItem('local', bookmarks.localBookmarks.length),
        new BookmarkSectionItem('remote', bookmarks.remoteBookmarks.length),
      ];
    }

    // Children of a section header
    if (element instanceof BookmarkSectionItem) {
      const bookmarks = extractBookmarksFromRevisions(this.repository.revisions);

      if (element.sectionKind === 'local') {
        const sorted = [...bookmarks.localBookmarks].sort((a, b) => a.name.localeCompare(b.name));
        return sorted.map((b) => new LocalBookmarkTreeItem(b));
      }

      if (element.sectionKind === 'remote') {
        const sorted = [...bookmarks.remoteBookmarks].sort((a, b) => {
          const nameComparison = a.name.localeCompare(b.name);
          return nameComparison !== 0 ? nameComparison : a.remote.localeCompare(b.remote);
        });
        return sorted.map((b) => new RemoteBookmarkTreeItem(b));
      }
    }

    return [];
  }

  dispose(): void {
    this.repositoryChangeDisposable?.dispose();
    this.changeEmitter.dispose();
  }
}
