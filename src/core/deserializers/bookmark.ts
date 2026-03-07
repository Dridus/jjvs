/**
 * Bookmark data extraction from revision log output.
 *
 * ## Current approach (Phase 3): log-based
 *
 * `jj bookmark list` supports `-T` templates (CommitRef type), but its JSON
 * serialisation format has not been verified against a real repository with
 * bookmarks. Until Phase 10 (bookmarks tree view) tests against a repository
 * that has bookmarks, this module derives bookmark data from `jj log` output,
 * which is already fully typed and tested.
 *
 * The log-based approach queries `jj log -r 'bookmarks() | remote_bookmarks()'`
 * and collects the `localBookmarks`/`remoteBookmarks` arrays from each revision.
 *
 * ## Future approach (Phase 10)
 *
 * `jj bookmark list --all-remotes -T <template>` using CommitRef template fields
 * (`name`, `remote`, `added_targets`, `tracking_ahead_count`, etc.).
 * The migration will only change `JjCli.bookmarkList()` internals; the return
 * type `BookmarkListResult` and the domain types `LocalBookmark`/`RemoteBookmark`
 * will not change.
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
export function extractBookmarksFromRevisions(
  revisions: readonly Revision[],
): BookmarkListResult {
  const localBookmarks = revisions.flatMap((r) => r.localBookmarks);
  const remoteBookmarks = revisions.flatMap((r) => r.remoteBookmarks);
  return { localBookmarks, remoteBookmarks };
}

/**
 * Extract just local bookmark names from revisions.
 * Useful for revset completion (Phase 6b).
 */
export function extractLocalBookmarkNames(revisions: readonly Revision[]): readonly string[] {
  return revisions.flatMap((r) => r.localBookmarks.map((b) => b.name));
}
