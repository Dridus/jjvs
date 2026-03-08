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

import * as z from 'zod/mini';
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

// ─── Raw JSON schemas and types ────────────────────────────────────────────────
// Schemas validate actual jj CLI output at the trust boundary. Types are derived
// from the schemas so they stay in sync automatically.

/** Schema and type for `json(author)` / `json(committer)` output. */
const RawIdentitySchema = z.object({
  name: z.string(),
  email: z.string(),
  /** ISO 8601 timestamp with timezone. e.g., `"2026-03-07T12:50:29-08:00"`. */
  timestamp: z.string(),
});
export type RawIdentity = z.infer<typeof RawIdentitySchema>;

/**
 * Schema and type for each element produced by `json(parents)`.
 *
 * Note: jj's `json(parents)` produces FULL parent commit objects, not just IDs.
 * The deserialiser extracts only `change_id` and `commit_id` from each parent.
 */
const RawParentCommitSchema = z.object({
  commit_id: z.string(),
  change_id: z.string(),
  /** The parent's own parent commit IDs (as hex strings). */
  parents: z.array(z.string()),
  description: z.string(),
  author: RawIdentitySchema,
  committer: RawIdentitySchema,
});
export type RawParentCommit = z.infer<typeof RawParentCommitSchema>;

/** Schema and type for each element of `json(local_bookmarks)`. */
const RawLocalBookmarkSchema = z.object({
  name: z.string(),
  /** Target commit IDs. Multiple entries indicate a conflicted bookmark. */
  target: z.array(z.string()),
});
export type RawLocalBookmark = z.infer<typeof RawLocalBookmarkSchema>;

/** Schema and type for each element of `json(remote_bookmarks)`. */
const RawRemoteBookmarkSchema = z.object({
  name: z.string(),
  remote: z.string(),
  /** Target commit IDs. Multiple entries indicate a conflicted remote bookmark. */
  target: z.array(z.string()),
  tracking_target: z.array(z.string()),
});
export type RawRemoteBookmark = z.infer<typeof RawRemoteBookmarkSchema>;

/** Schema and type for each element of `json(tags)`. */
const RawTagSchema = z.object({
  name: z.string(),
  target: z.array(z.string()),
});
export type RawTag = z.infer<typeof RawTagSchema>;

/** Schema for the complete shape produced by REVISION_TEMPLATE for each log line. */
const RawRevisionSchema = z.object({
  changeId: z.string(),
  commitId: z.string(),
  description: z.string(),
  author: RawIdentitySchema,
  committer: RawIdentitySchema,
  empty: z.boolean(),
  conflict: z.boolean(),
  immutable: z.boolean(),
  workingCopy: z.boolean(),
  divergent: z.boolean(),
  parents: z.array(RawParentCommitSchema),
  localBookmarks: z.array(RawLocalBookmarkSchema),
  remoteBookmarks: z.array(RawRemoteBookmarkSchema),
  tags: z.array(RawTagSchema),
});
/** The complete shape produced by REVISION_TEMPLATE for each log line. */
export type RawRevision = z.infer<typeof RawRevisionSchema>;

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
 * Graceful degradation: lines that fail JSON.parse or schema validation are
 * skipped. The caller (`JjCliImpl.log`) is responsible for logging skipped
 * lines via the output channel.
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
      continue;
    }
    const parsed = RawRevisionSchema.safeParse(raw);
    if (!parsed.success) continue;
    revisions.push(rawRevisionToRevision(parsed.data));
  }
  return revisions;
}
