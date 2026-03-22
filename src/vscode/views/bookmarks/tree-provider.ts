/**
 * TreeDataProvider for the jj bookmarks tree view (jjvs.bookmarks).
 *
 * Groups bookmarks by name, mirroring `jj bookmark list --all`:
 *   - A local bookmark with remotes becomes a collapsible parent; its remote
 *     entries are children labelled `@remote`.
 *   - A local bookmark with no remotes is a leaf.
 *   - A bookmark name that exists only on one remote is a standalone leaf
 *     labelled `name@remote`.
 *   - A bookmark name that exists on multiple remotes (no local) gets a
 *     collapsible BookmarkGroupItem with `@remote` children.
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
import type { LocalBookmark, RemoteBookmark } from '../../../core/types';
import type { RepositoryState } from '../../../core/repository';
import { extractBookmarksFromRevisions } from '../../../core/deserializers/bookmark';
import {
  BookmarkGroupItem,
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

    // Root: grouped top-level items sorted by bookmark name.
    if (element === undefined) {
      const bookmarks = extractBookmarksFromRevisions(this.repository.revisions);
      return buildTopLevelItems(bookmarks.localBookmarks, bookmarks.remoteBookmarks);
    }

    // Children of a local bookmark that has associated remotes.
    if (element instanceof LocalBookmarkTreeItem && element.remoteBookmarks.length > 0) {
      return element.remoteBookmarks.map((r) => new RemoteBookmarkTreeItem(r, true));
    }

    // Children of a remote-only group (multiple remotes, no local).
    if (element instanceof BookmarkGroupItem) {
      return element.remoteBookmarks.map((r) => new RemoteBookmarkTreeItem(r, true));
    }

    return [];
  }

  dispose(): void {
    this.repositoryChangeDisposable?.dispose();
    this.changeEmitter.dispose();
  }
}

/**
 * Build the flat list of top-level tree items, one entry per unique bookmark name.
 *
 * Rules (matching `jj bookmark list --all` presentation):
 *   - local + remotes  → LocalBookmarkTreeItem (collapsible) with remote children
 *   - local only       → LocalBookmarkTreeItem (leaf)
 *   - one remote only  → RemoteBookmarkTreeItem standalone (leaf)
 *   - multiple remotes → BookmarkGroupItem (collapsible) with remote children
 */
function buildTopLevelItems(
  localBookmarks: readonly LocalBookmark[],
  remoteBookmarks: readonly RemoteBookmark[],
): BookmarkTreeItem[] {
  const localByName = new Map(localBookmarks.map((b) => [b.name, b]));

  const remotesByName = new Map<string, RemoteBookmark[]>();
  for (const remote of remoteBookmarks) {
    const existing = remotesByName.get(remote.name) ?? [];
    existing.push(remote);
    remotesByName.set(remote.name, existing);
  }

  const allNames = new Set([...localByName.keys(), ...remotesByName.keys()]);
  const sortedNames = [...allNames].sort((a, b) => a.localeCompare(b));

  const items: BookmarkTreeItem[] = [];
  for (const name of sortedNames) {
    const local = localByName.get(name);
    const remotes = [...(remotesByName.get(name) ?? [])].sort((a, b) =>
      a.remote.localeCompare(b.remote),
    );

    if (local !== undefined) {
      items.push(new LocalBookmarkTreeItem(local, remotes));
    } else if (remotes[0] !== undefined) {
      // safe: length check guarantees index 0 exists
      items.push(new RemoteBookmarkTreeItem(remotes[0], false));
    } else {
      items.push(new BookmarkGroupItem(name, remotes));
    }
  }

  return items;
}
