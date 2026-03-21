/**
 * Parser for `jj status` text output.
 *
 * jj status has no `-T` template support as of jj 0.38.0. This module parses
 * the human-readable text output into a `WorkingCopyStatus` value.
 *
 * Verified output format (jj 0.38.0, 2026-03-07):
 * ```
 * Working copy changes:
 * A path/to/added-file.txt
 * M path/to/modified-file.txt
 * D path/to/deleted-file.txt
 * Working copy  (@) : <shortChangeId> <shortCommitId> (optional-flags) description
 * Parent commit (@-): <shortChangeId> <shortCommitId> description
 * ```
 *
 * When no changes:
 * ```
 * The working copy has no changes.
 * Working copy  (@) : <shortChangeId> <shortCommitId> (empty) (no description set)
 * Parent commit (@-): <shortChangeId> <shortCommitId> description
 * ```
 *
 * When there are conflicts:
 * ```
 * Working copy changes:
 * M conflicted-file.ts
 * Conflicted files:
 *   conflicted-file.ts
 * Working copy  (@) : <shortChangeId> <shortCommitId> description
 * Parent commit (@-): <shortChangeId> <shortCommitId> description
 * ```
 *
 * Fixture: test/unit/fixtures/status-*.fixture.txt
 */

import type { WorkingCopyStatus, FileChange, FileStatus } from '../types';

// ─── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse `jj status` text output into a `WorkingCopyStatus`.
 *
 * Notes:
 * - `parentChangeIds` contains **short** (8-character) change IDs extracted
 *   from the "Parent commit" line. For full change IDs, query
 *   `jj log --no-graph -r @` separately.
 * - File status lines for merge conflicts show `C` status for conflicted files.
 *   jj also has a `Conflicted files:` section; `hasConflicts` is set to `true`
 *   when that section is present.
 */
export function parseStatus(stdout: string): WorkingCopyStatus {
  const lines = stdout.split('\n');
  const fileChanges: FileChange[] = [];
  const parentChangeIds: string[] = [];
  let inChangesSection = false;
  let hasConflicts = false;

  for (const line of lines) {
    if (line === 'Working copy changes:') {
      inChangesSection = true;
      continue;
    }

    if (line === 'Conflicted files:') {
      hasConflicts = true;
      inChangesSection = false;
      continue;
    }

    // File status lines: `<statusChar> <path>`
    // The status char is the first character, followed by a space, then the path.
    if (inChangesSection && line.length >= 3 && line[1] === ' ') {
      const statusChar = line[0];
      const path = line.slice(2);
      const status = parseFileStatusChar(statusChar);
      if (status !== undefined) {
        fileChanges.push({ path, status });
        continue;
      }
    }

    // End the changes section when we reach the "Working copy" line.
    if (line.startsWith('Working copy ') || line.startsWith('Parent commit')) {
      inChangesSection = false;
    }

    // Extract the parent change ID from "Parent commit (@-): <shortChangeId> ..."
    // The short change ID is the first whitespace-delimited token after the ': '.
    const parentMatch = /^Parent commit \(@-\):\s+(\S+)/.exec(line);
    if (parentMatch?.[1] !== undefined) {
      parentChangeIds.push(parentMatch[1]);
    }
  }

  return { parentChangeIds, fileChanges, hasConflicts };
}

/**
 * Map a single-character jj file status to a domain `FileStatus`.
 *
 * jj status characters:
 * - `A` → added
 * - `M` → modified
 * - `D` → deleted
 * - `R` → renamed
 * - `C` → copied
 *
 * Returns `undefined` for unrecognised characters (silently ignored in
 * `parseStatus`).
 */
export function parseFileStatusChar(char: string | undefined): FileStatus | undefined {
  switch (char) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    default:
      return undefined;
  }
}
