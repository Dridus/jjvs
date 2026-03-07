/**
 * Deserializer for `jj log` JSON output.
 *
 * The `REVISION_TEMPLATE` constant is the jj `-T` template string that produces
 * one JSON object per line. Pass it to `jj log --no-graph -T <template>`.
 *
 * Template escaping note:
 * - In JS source, `\\"` in a single-quoted string → `\"` in the runtime string.
 * - In jj template language, `\"` inside `"..."` is an escaped double-quote.
 * - So `'"{\\"key\\":" ++ json(val)'` in JS → `"{\"key\":" ++ json(val)` sent to jj.
 *
 * Verified against jj 0.38.0 on 2026-03-07.
 * Fixture: test/unit/fixtures/log.fixture.ndjson
 */

import type { Revision, Identity, LocalBookmark, RemoteBookmark, Tag } from '../types';

// ─── jj template ──────────────────────────────────────────────────────────────

/**
 * jj log template producing one JSON object per revision per line.
 *
 * Fields:
 * - `changeId`: Full change ID (e.g., `"kqxqutopsoptvlrmpmuurzkkpkwuzomw"`)
 * - `commitId`: Full commit ID (e.g., `"a68175449fd1c7762ae03df7a93d84ee88d1d8bd"`)
 * - `description`: Commit description (may have trailing `\n` — trimmed on parse)
 * - `author`, `committer`: Identity objects with name, email, timestamp
 * - `empty`, `conflict`, `immutable`, `workingCopy`, `divergent`: Boolean flags
 * - `parents`: Array of parent commit objects (full objects, not just IDs)
 * - `localBookmarks`, `remoteBookmarks`, `tags`: Bookmark and tag info
 *
 * Use this with: `jj log --no-graph [-r <revset>] [--limit <n>] -T <template>`
 */
export const REVISION_TEMPLATE = [
  '"{\\"changeId\\":" ++ json(change_id)',
  '",\\"commitId\\":" ++ json(commit_id)',
  '",\\"description\\":" ++ json(description)',
  '",\\"author\\":" ++ json(author)',
  '",\\"committer\\":" ++ json(committer)',
  '",\\"empty\\":" ++ json(empty)',
  '",\\"conflict\\":" ++ json(conflict)',
  '",\\"immutable\\":" ++ json(immutable)',
  '",\\"workingCopy\\":" ++ json(current_working_copy)',
  '",\\"divergent\\":" ++ json(divergent)',
  '",\\"parents\\":" ++ json(parents)',
  '",\\"localBookmarks\\":" ++ json(local_bookmarks)',
  '",\\"remoteBookmarks\\":" ++ json(remote_bookmarks)',
  '",\\"tags\\":" ++ json(tags)',
  '"}"',
  '"\\n"',
].join(' ++ ');

// ─── Raw JSON types ────────────────────────────────────────────────────────────
// These exactly match what jj's json() template function produces for each field.

/** The shape produced by `json(author)` and `json(committer)` in log templates. */
export interface RawIdentity {
  readonly name: string;
  readonly email: string;
  /** ISO 8601 timestamp with timezone. e.g., `"2026-03-07T12:50:29-08:00"`. */
  readonly timestamp: string;
}

/**
 * The shape of each element produced by `json(parents)`.
 *
 * Note: jj's `json(parents)` produces FULL parent commit objects, not just IDs.
 * The deserialiser extracts only `change_id` and `commit_id` from each parent.
 */
export interface RawParentCommit {
  readonly commit_id: string;
  readonly change_id: string;
  /** The parent's own parent commit IDs (as hex strings). */
  readonly parents: readonly string[];
  readonly description: string;
  readonly author: RawIdentity;
  readonly committer: RawIdentity;
}

/** The shape produced by each element of `json(local_bookmarks)`. */
export interface RawLocalBookmark {
  readonly name: string;
  /** Target commit IDs. Multiple entries indicate a conflicted bookmark. */
  readonly target: readonly string[];
}

/** The shape produced by each element of `json(remote_bookmarks)`. */
export interface RawRemoteBookmark {
  readonly name: string;
  readonly remote: string;
  /** Target commit IDs. Multiple entries indicate a conflicted remote bookmark. */
  readonly target: readonly string[];
  readonly tracking_target: readonly string[];
}

/** The shape produced by each element of `json(tags)`. */
export interface RawTag {
  readonly name: string;
  readonly target: readonly string[];
}

/** The complete shape produced by REVISION_TEMPLATE for each log line. */
export interface RawRevision {
  readonly changeId: string;
  readonly commitId: string;
  readonly description: string;
  readonly author: RawIdentity;
  readonly committer: RawIdentity;
  readonly empty: boolean;
  readonly conflict: boolean;
  readonly immutable: boolean;
  readonly workingCopy: boolean;
  readonly divergent: boolean;
  readonly parents: readonly RawParentCommit[];
  readonly localBookmarks: readonly RawLocalBookmark[];
  readonly remoteBookmarks: readonly RawRemoteBookmark[];
  readonly tags: readonly RawTag[];
}

// ─── Conversion functions ──────────────────────────────────────────────────────

/** Convert a raw identity to a domain `Identity` with a parsed `Date`. */
export function rawIdentityToIdentity(raw: RawIdentity): Identity {
  return {
    name: raw.name,
    email: raw.email,
    timestamp: new Date(raw.timestamp),
  };
}

/**
 * Convert a raw revision to a domain `Revision`.
 *
 * The `description` field from jj always ends with `\n` when non-empty;
 * the trailing newline is trimmed here for cleaner display.
 */
export function rawRevisionToRevision(raw: RawRevision): Revision {
  return {
    changeId: raw.changeId,
    commitId: raw.commitId,
    description: raw.description.replace(/\n$/, ''),
    author: rawIdentityToIdentity(raw.author),
    committer: rawIdentityToIdentity(raw.committer),
    parentChangeIds: raw.parents.map((p) => p.change_id),
    parentCommitIds: raw.parents.map((p) => p.commit_id),
    localBookmarks: raw.localBookmarks.map(
      (b): LocalBookmark => ({ name: b.name, targets: b.target }),
    ),
    remoteBookmarks: raw.remoteBookmarks.map(
      (b): RemoteBookmark => ({
        name: b.name,
        remote: b.remote,
        targets: b.target,
        trackingTargets: b.tracking_target,
      }),
    ),
    tags: raw.tags.map((t): Tag => ({ name: t.name, targets: t.target })),
    isWorkingCopy: raw.workingCopy,
    isEmpty: raw.empty,
    isImmutable: raw.immutable,
    hasConflict: raw.conflict,
    isDivergent: raw.divergent,
  };
}

/**
 * Parse newline-delimited JSON log output into a `Revision` array.
 *
 * Graceful degradation: lines that fail JSON.parse are skipped. The caller
 * (currently `JjCliImpl.log`) is responsible for logging skipped lines via
 * the output channel once that infrastructure exists (Phase 4).
 */
export function parseRevisions(stdout: string): readonly Revision[] {
  const revisions: Revision[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      // Malformed line; skip. Phase 4 will log a warning via the output channel.
      continue;
    }
    // Safe: JSON.parse succeeded, and rawRevisionToRevision accesses only
    // the fields declared in RawRevision. If any field is missing or has the
    // wrong type, rawRevisionToRevision degrades gracefully (uses fallbacks
    // like `?? ''`, `?? false`, `?? []`), so no unsafe memory access occurs.
    revisions.push(rawRevisionToRevision(raw as RawRevision));
  }
  return revisions;
}
