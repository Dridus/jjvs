/**
 * QuickDiffProvider and original-content provider for inline gutter diffs.
 *
 * VSCode's QuickDiff feature shows change indicators (added/modified/deleted
 * lines) in the editor gutter for files under source control. To compute the
 * diff, VSCode needs the "original" (base) content of each file.
 *
 * For jj, the base content is the file at the working copy's first parent
 * revision (`@-`). When `@-` does not contain the file (newly added), the
 * content provider returns an empty string, producing "all-added" gutter marks.
 *
 * ## Architecture
 *
 * - `JjQuickDiffProvider` — implements `vscode.QuickDiffProvider` per repository.
 *   Assigned to `sourceControl.quickDiffProvider` so VSCode scopes it correctly.
 *
 * - `JjOriginalContentProvider` — implements `vscode.TextDocumentContentProvider`
 *   for the `jj-original` URI scheme. A single global instance handles all
 *   repos (rootPath is encoded in the URI query).
 *
 * ## URI format
 *
 * `jj-original:/<relative-path>?<JSON: { rootPath, revision }>`
 *
 * The path component carries the relative path for display in the diff editor
 * title. The JSON query encodes the repository root and revision revset.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { RepositoryState } from '../../core/repository';

/** URI scheme used to serve original file content from a jj parent revision. */
export const JJ_ORIGINAL_SCHEME = 'jj-original';

/** Shape of the query JSON encoded in `jj-original` URIs. */
interface OriginalUriQuery {
  readonly rootPath: string;
  readonly revision: string;
}

/**
 * Build a `jj-original` URI for a given file at a given revision.
 *
 * @param rootPath   - Absolute repository root path.
 * @param relativePath - Path relative to the repository root (forward slashes).
 * @param revision   - jj revset identifying the revision (e.g. `"@-"`).
 */
export function buildOriginalUri(
  rootPath: string,
  relativePath: string,
  revision: string,
): vscode.Uri {
  const query: OriginalUriQuery = { rootPath, revision };
  return vscode.Uri.from({
    scheme: JJ_ORIGINAL_SCHEME,
    // Forward-slash path for display (diff editor title shows this)
    path: '/' + relativePath.replace(/\\/g, '/'),
    query: JSON.stringify(query),
  });
}

// ─── QuickDiffProvider ────────────────────────────────────────────────────────

/**
 * Per-repository QuickDiffProvider.
 *
 * Assigned to `SourceControl.quickDiffProvider` so VSCode only calls it for
 * files that belong to that SCM instance. Maps each workspace file URI to a
 * `jj-original:` URI representing the file at the working copy's parent (`@-`).
 */
export class JjQuickDiffProvider implements vscode.QuickDiffProvider {
  constructor(private readonly rootPath: string) {}

  provideOriginalResource(uri: vscode.Uri): vscode.Uri | undefined {
    if (uri.scheme !== 'file') return undefined;

    const filePath = uri.fsPath;
    const rootWithSep = this.rootPath.endsWith(path.sep) ? this.rootPath : this.rootPath + path.sep;

    if (filePath !== this.rootPath && !filePath.startsWith(rootWithSep)) {
      return undefined;
    }

    const relativePath = path.relative(this.rootPath, filePath);
    return buildOriginalUri(this.rootPath, relativePath, '@-');
  }
}

// ─── TextDocumentContentProvider ─────────────────────────────────────────────

/**
 * Global content provider for `jj-original:` URIs.
 *
 * A single instance is registered for the extension lifetime and handles all
 * repositories. The rootPath encoded in the URI query determines which
 * `RepositoryState` to delegate the file-show call to.
 *
 * Fires `onDidChange` to invalidate cached content after a repository refresh,
 * ensuring gutter indicators update when the parent revision changes (e.g.,
 * after `jj rebase` or `jj squash`).
 */
export class JjOriginalContentProvider
  implements vscode.TextDocumentContentProvider, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri>();

  /** VSCode subscribes to this to know when to re-request content. */
  readonly onDidChange = this.changeEmitter.event;

  /**
   * URIs that have been served by this provider, keyed by their string form.
   *
   * `onDidChange` must fire the *exact* URI that was previously served; VSCode
   * matches by identity. We track served URIs so `invalidateRepository` can
   * fire the correct per-file events rather than a synthetic root URI that
   * wouldn't match any open document.
   *
   * The map grows over the session as files are opened, but entries are small
   * (URI objects) and bounded by the number of unique files the user views.
   */
  private readonly servedUris = new Map<string, vscode.Uri>();

  constructor(
    /**
     * Returns the `RepositoryState` whose root path is a prefix of (or equal
     * to) the given path. Backed by `RepositoryManager.getRepositoryForPath`.
     */
    private readonly getRepositoryForPath: (filePath: string) => RepositoryState | undefined,
  ) {}

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    // Track this URI so invalidateRepository can fire the correct change event.
    this.servedUris.set(uri.toString(), uri);

    // safe: URI was constructed by buildOriginalUri which always encodes valid JSON
    const { rootPath, revision } = JSON.parse(uri.query) as OriginalUriQuery;

    const relativePath = uri.path.startsWith('/') ? uri.path.slice(1) : uri.path;

    const repository = this.getRepositoryForPath(rootPath);
    if (repository === undefined) return '';

    const result = await repository.fileShow(relativePath, revision);

    if (!result.ok) {
      // File doesn't exist at the parent revision (newly added) → empty original
      // produces "all-added" gutter marks.
      return '';
    }

    return result.value;
  }

  /**
   * Notify VSCode that the original content for all previously-served files
   * under `rootPath` may have changed.
   *
   * Call this after a repository refresh that could have altered the parent
   * revision (e.g., after rebase, squash, undo). VSCode re-requests content
   * for any open editors whose base URI is in the served set for this repo.
   */
  invalidateRepository(rootPath: string): void {
    for (const [, uri] of this.servedUris) {
      // safe: all entries were inserted after being constructed by buildOriginalUri
      const query = JSON.parse(uri.query) as OriginalUriQuery;
      if (query.rootPath === rootPath) {
        this.changeEmitter.fire(uri);
      }
    }
  }

  dispose(): void {
    this.servedUris.clear();
    this.changeEmitter.dispose();
  }
}
