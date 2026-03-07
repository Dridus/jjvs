/**
 * Core domain types for the jjvs extension.
 *
 * These types represent jj concepts in TypeScript. All fields use full names
 * (no abbreviations) per CLAUDE.md conventions.
 *
 * Types are designed to be populated from jj CLI output via `json()` templates
 * (available since jj 0.25.0). The exact JSON mapping is established in the
 * deserializers (src/core/deserializers/). Do not add VSCode imports here.
 *
 * Verified against jj 0.38.0 output on 2026-03-07.
 */

/**
 * How the jj repository relates to a git repository.
 * - `'native'`: a pure jj repository with no git backend
 * - `'colocated'`: a jj repository backed by an existing git repository
 */
export type RepoKind = 'native' | 'colocated';

/**
 * A timestamped identity (author or committer of a revision).
 *
 * jj template: `json(author)` → `{"name":"...","email":"...","timestamp":"..."}`
 * The timestamp is ISO 8601 with timezone offset (e.g., "2026-03-07T12:50:29-08:00").
 */
export interface Identity {
  readonly name: string;
  readonly email: string;
  /** UTC-normalised timestamp. */
  readonly timestamp: Date;
}

/**
 * The status of a file within a revision relative to its parent.
 */
export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  /**
   * A file that participates in an unresolved merge conflict.
   * Currently not produced by any deserializer — `jj status` reports
   * conflicted files without a distinct single-character status code.
   * Reserved for future use when a structured conflict-file API is available
   * (Phase 8 conflict handling).
   */
  | 'conflicted';

/**
 * A file that was changed in a revision.
 */
export interface FileChange {
  readonly path: string;
  readonly status: FileStatus;
  /**
   * The path before a rename or copy.
   * Only set when `status` is `'renamed'` or `'copied'`.
   */
  readonly originalPath?: string;
}

/**
 * A local bookmark reference on a specific revision.
 *
 * jj template: `json(local_bookmarks)` → `[{"name":"main","target":["<commitId>"]}]`
 *
 * The `targets` array has more than one entry when the bookmark is conflicted
 * (multiple commits claim the same bookmark name, typically from concurrent
 * operations). A healthy bookmark has exactly one target.
 */
export interface LocalBookmark {
  readonly name: string;
  /** Commit IDs this bookmark points to. Length > 1 means conflicted. */
  readonly targets: readonly string[];
}

/**
 * A remote-tracking entry associated with a local bookmark.
 *
 * jj template: `json(remote_bookmarks)` →
 *   `[{"name":"main","remote":"origin","target":["<commitId>"],"tracking_target":["<commitId>"]}]`
 */
export interface RemoteBookmark {
  readonly name: string;
  /** The remote name (e.g., `"origin"`). */
  readonly remote: string;
  /** Commit IDs the remote bookmark points to. Length > 1 means conflicted. */
  readonly targets: readonly string[];
  /**
   * The last-known remote state used for tracking divergence.
   * An empty array means no tracking relationship has been established.
   */
  readonly trackingTargets: readonly string[];
}

/**
 * A tag reference.
 *
 * jj template: `json(tags)` → `[{"name":"v1.0","target":["<commitId>"]}]`
 */
export interface Tag {
  readonly name: string;
  /** Commit IDs this tag points to. Length > 1 means conflicted. */
  readonly targets: readonly string[];
}

/**
 * A single revision in the jj log.
 *
 * In jj, every "change" has a stable change ID that persists across rewrites
 * (amends, rebases). The commit ID changes with each rewrite. This is a key
 * distinction from git where the commit hash IS the identity.
 *
 * Template fields verified against `jj log` with `json()` on jj 0.38.0.
 */
export interface Revision {
  /**
   * The stable change identifier (full 32-char alphanumeric, e.g.,
   * `"kqxqutopsoptvlrmpmuurzkkpkwuzomw"`). Persists across rewrites.
   * jj template: `json(change_id)` → `"<string>"`
   */
  readonly changeId: string;

  /**
   * The commit identifier (full 40-char hex hash). Changes on every rewrite.
   * jj template: `json(commit_id)` → `"<string>"`
   */
  readonly commitId: string;

  /**
   * The commit description (message). May be empty for new/unnamed commits.
   * jj output includes a trailing newline; deserializers should trim it.
   * jj template: `json(description)` → `"<string>"`
   */
  readonly description: string;

  /** The author of the change. jj template: `json(author)` */
  readonly author: Identity;

  /**
   * The committer (may differ from author after rebase operations).
   * jj template: `json(committer)`
   */
  readonly committer: Identity;

  /**
   * Change IDs of this revision's parents (extracted from `json(parents)`).
   * The root revision has an empty array.
   */
  readonly parentChangeIds: readonly string[];

  /**
   * Commit IDs of this revision's parents (extracted from `json(parents)`).
   * Provided alongside `parentChangeIds` since both are available in the
   * `json(parents)` output without extra queries.
   */
  readonly parentCommitIds: readonly string[];

  /**
   * Local bookmarks attached to this revision.
   * jj template: `json(local_bookmarks)`
   */
  readonly localBookmarks: readonly LocalBookmark[];

  /**
   * Remote bookmarks associated with this revision.
   * jj template: `json(remote_bookmarks)`
   */
  readonly remoteBookmarks: readonly RemoteBookmark[];

  /**
   * Tags pointing to this revision.
   * jj template: `json(tags)`
   */
  readonly tags: readonly Tag[];

  /**
   * Whether this is the current working copy revision (`@`).
   * jj template: `json(current_working_copy)` → boolean
   */
  readonly isWorkingCopy: boolean;

  /**
   * Whether this revision has no changes relative to its parents.
   * jj template: `json(empty)` → boolean
   */
  readonly isEmpty: boolean;

  /**
   * Whether this revision is immutable (cannot be rewritten).
   * Typically set for revisions reachable from remote bookmarks or roots.
   * jj template: `json(immutable)` → boolean
   */
  readonly isImmutable: boolean;

  /**
   * Whether this revision contains unresolved merge conflicts.
   * jj template: `json(conflict)` → boolean
   */
  readonly hasConflict: boolean;

  /**
   * Whether this change ID has diverged (two commits share the same change ID).
   * Can occur after certain concurrent operations.
   * jj template: `json(divergent)` → boolean
   */
  readonly isDivergent: boolean;
}

/**
 * The time range over which a jj operation executed.
 *
 * jj template: `json(time)` →
 *   `{"start":"2026-03-07T13:19:42.656-08:00","end":"2026-03-07T13:19:42.669-08:00"}`
 */
export interface OperationTime {
  readonly start: Date;
  readonly end: Date;
}

/**
 * An entry in the jj operation log.
 *
 * Every jj command that modifies repository state creates an operation entry.
 * Operations can be listed with `jj op log` and undone with `jj op restore`.
 *
 * Note: jj's op log template has no separate `hostname` keyword; the `user`
 * field contains `"user@hostname"` (e.g., `"alice@Enodia.local"`).
 * Verified against jj 0.38.0.
 */
export interface Operation {
  /** The full operation identifier (hex). */
  readonly id: string;
  /** Human-readable description (e.g., `"new empty commit"`). */
  readonly description: string;
  /**
   * The user who performed the operation in `"user@hostname"` format.
   * jj template: `json(user)` → `"alice@hostname"`
   */
  readonly user: string;
  /** The time range over which the operation executed. */
  readonly time: OperationTime;
}

/**
 * The current state of the working copy, from `jj status`.
 *
 * `jj status` does not support `-T` in jj 0.38.0, so this is populated
 * from text parsing (see `src/core/deserializers/status.ts`).
 */
export interface WorkingCopyStatus {
  /** Change IDs of the working copy's parents. */
  readonly parentChangeIds: readonly string[];
  /** Files changed in the working copy relative to its parents. */
  readonly fileChanges: readonly FileChange[];
  /** Whether any file in the working copy has unresolved conflicts. */
  readonly hasConflicts: boolean;
}

/**
 * Summary information about a discovered jj repository.
 */
export interface RepositoryInfo {
  /** Absolute path to the repository root (the directory containing `.jj/`). */
  readonly rootPath: string;
  /** Whether the repository is colocated with a git repository. */
  readonly kind: RepoKind;
}

/**
 * Per-file diff statistics (lines added/removed).
 * Used for displaying `jj diff --stat` output.
 */
export interface DiffStat {
  readonly path: string;
  readonly addedLines: number;
  readonly removedLines: number;
}
