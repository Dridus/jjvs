/**
 * Bookmark data extraction from revision log output.
 *
 * Uses a log-based approach: `jj log -r 'bookmarks() | remote_bookmarks()'`
 * and collects the `localBookmarks`/`remoteBookmarks` arrays from each revision.
 *
 * `jj bookmark list` also supports `-T` templates (CommitRef type), but the
 * log-based approach was chosen because it reuses the already fully-typed and
 * tested log deserializer. A future enhancement could migrate `JjCli.bookmarkList()`
 * to direct `jj bookmark list -T` parsing without changing `BookmarkListResult` or
 * the domain types `LocalBookmark`/`RemoteBookmark`.
 */

import type { LocalBookmark, RemoteBookmark, Revision } from '../types';

/** Combined bookmark list derived from revision log output. */
export interface BookmarkListResult {
  readonly localBookmarks: readonly LocalBookmark[];
  readonly remoteBookmarks: readonly RemoteBookmark[];
}

/**
 * Extract all bookmark data from an array of revisions.
 *
 * Deduplication: in a consistent jj repository, each bookmark points to exactly
 * one revision. However, during a divergence (two commits with the same change
 * ID), `localBookmarks` on multiple revisions could nominally produce duplicates.
 * This function returns all entries as-is; deduplication is the caller's
 * responsibility if needed.
 *
 * @param revisions - Revisions returned by `jj log -r 'bookmarks() | remote_bookmarks()'`
 */
export function extractBookmarksFromRevisions(revisions: readonly Revision[]): BookmarkListResult {
  const localBookmarks = revisions.flatMap((r) => r.localBookmarks);
  const remoteBookmarks = revisions.flatMap((r) => r.remoteBookmarks);
  return { localBookmarks, remoteBookmarks };
}

/**
 * Extract just local bookmark names from revisions.
 * Useful for revset completion.
 */
export function extractLocalBookmarkNames(revisions: readonly Revision[]): readonly string[] {
  return revisions.flatMap((r) => r.localBookmarks.map((b) => b.name));
}
