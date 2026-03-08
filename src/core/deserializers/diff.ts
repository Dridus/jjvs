/**
 * Parsers for `jj diff` text output.
 *
 * jj diff output formats:
 * 1. `jj diff --stat` — per-file summary with line change counts and visual bar.
 * 2. `jj diff --summary` — per-file status letters (A/M/D/R/C) with paths.
 * 3. `jj diff` (default word-diff) or `jj diff --git` — full diff text for display.
 *
 * Note on `addedLines` / `removedLines` accuracy from `--stat` output:
 * The `jj diff --stat` format shows a visual bar (`+++++--`) that represents the
 * proportion of additions vs. deletions relative to the file with the most changes.
 * For files that are entirely added or entirely deleted, counts are exact. For
 * modified files, counts are APPROXIMATE (derived from the bar proportions).
 *
 * For exact per-file add/remove counts, use the `diff.stat().files()` template
 * API via a dedicated `JjCli.revisionFileStat()` method using
 * `DiffStatEntry.lines_added()` / `.lines_removed()`.
 *
 * Verified against jj 0.38.0 on 2026-03-07.
 * Fixture: test/unit/fixtures/diff-stat.fixture.txt
 */

import type { DiffStat, FileChange, FileStatus } from '../types';
import { parseFileStatusChar } from './status';

// ─── Diff stat parser ──────────────────────────────────────────────────────────

/**
 * Parse `jj diff --stat` text output into a `DiffStat` array.
 *
 * Each data line has the format: `<path> | <N> <bar>`
 * The summary line `<N> files changed, <M> insertions(+), <K> deletions(-)`
 * is skipped (it gives totals, not per-file detail).
 *
 * `addedLines` and `removedLines` are:
 * - **Exact** for files that are entirely added (all `+` in bar) or deleted (all `-`).
 * - **Approximate** for modified files (proportional to the visual bar length).
 *
 * Empty input (no changes) returns an empty array.
 */
export function parseDiffStat(stdout: string): readonly DiffStat[] {
  const results: DiffStat[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    // Skip the summary line: "N files changed, M insertions(+), K deletions(-)"
    if (/^\d+ files? changed/.test(trimmed)) continue;

    // Match: `<path> | <N> <bar>` where bar is zero or more +/- chars
    // Note: \- is unnecessary in a character class but needed to avoid lint error from [-]
    const match = /^(.+?)\s*\|\s*(\d+)\s*([+-]*)$/.exec(trimmed);
    if (match === null) continue;

    const path = (match[1] ?? '').trim();
    const totalLines = parseInt(match[2] ?? '0', 10);
    const bar = match[3] ?? '';

    const plusCount = countChar(bar, '+');
    const minusCount = countChar(bar, '-');
    const barTotal = plusCount + minusCount;

    let addedLines: number;
    let removedLines: number;

    if (barTotal === 0) {
      // No bar chars: file with 0 changes (binary file or 0-line diff)
      addedLines = 0;
      removedLines = 0;
    } else if (minusCount === 0) {
      // All additions (new file or entirely replaced content)
      addedLines = totalLines;
      removedLines = 0;
    } else if (plusCount === 0) {
      // All deletions (deleted file)
      addedLines = 0;
      removedLines = totalLines;
    } else {
      // Mixed: use bar proportions as best estimate (approximate)
      addedLines = Math.round(totalLines * (plusCount / barTotal));
      removedLines = totalLines - addedLines;
    }

    results.push({ path, addedLines, removedLines });
  }

  return results;
}

/** Count occurrences of `char` in `str`. */
function countChar(str: string, char: string): number {
  let count = 0;
  for (const c of str) {
    if (c === char) count++;
  }
  return count;
}

/**
 * Extract just the file paths from `jj diff --stat` output.
 * Useful for getting a list of changed files without needing the counts.
 */
export function parseDiffStatPaths(stdout: string): readonly string[] {
  return parseDiffStat(stdout).map((entry) => entry.path);
}

// ─── Summary diff parser ──────────────────────────────────────────────────────

/**
 * Parse `jj diff --summary` text output into a `FileChange` array.
 *
 * Each line has one of the following formats (verified on jj 0.38.0):
 * - `A <path>`          — file was added
 * - `M <path>`          — file was modified
 * - `D <path>`          — file was deleted
 * - `R {<old> => <new>}` — file was renamed (curly-brace notation from jj)
 * - `C {<old> => <new>}` — file was copied (curly-brace notation from jj)
 *
 * The curly-brace notation is how jj represents a single path component that
 * changed: `R {old.ts => new.ts}` or `R {src/ => dst/}file.ts`.
 * This parser normalises all R/C lines to a `FileChange` with `originalPath`.
 *
 * For R/C lines that do not match the expected braced format, the line is
 * treated as a modified file rather than silently dropped, to avoid losing
 * context on unexpected output.
 *
 * Empty input (no changes) returns an empty array.
 */
export function parseSummaryDiff(stdout: string): readonly FileChange[] {
  const results: FileChange[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.length < 3) continue;

    const statusChar = trimmed[0];
    // Status letter must be followed by a space.
    if (trimmed[1] !== ' ') continue;

    const rest = trimmed.slice(2);

    if (statusChar === 'R' || statusChar === 'C') {
      const fileChange = parseRenameOrCopyLine(statusChar === 'R' ? 'renamed' : 'copied', rest);
      if (fileChange !== undefined) {
        results.push(fileChange);
      }
      continue;
    }

    const status = parseFileStatusChar(statusChar);
    if (status !== undefined) {
      results.push({ path: rest, status });
    }
  }

  return results;
}

/**
 * Parse a rename or copy line from `jj diff --summary`.
 *
 * Handles the curly-brace format that jj uses to show path components that
 * changed: `{old => new}` or `prefix/{old => new}/suffix`.
 *
 * Returns `undefined` when the line format is unrecognised, to degrade
 * gracefully rather than emitting a malformed `FileChange`.
 */
function parseRenameOrCopyLine(
  status: Extract<FileStatus, 'renamed' | 'copied'>,
  rest: string,
): FileChange | undefined {
  // Try to find the `{<old> => <new>}` pattern anywhere in the line.
  // jj may embed it mid-path: `dir/{old.ts => new.ts}` or as the full path.
  const braceMatch = /^(.*)\{(.+?) => (.+?)\}(.*)$/.exec(rest);
  if (braceMatch !== null) {
    const prefix = braceMatch[1] ?? '';
    const oldPart = braceMatch[2] ?? '';
    const newPart = braceMatch[3] ?? '';
    const suffix = braceMatch[4] ?? '';
    const originalPath = `${prefix}${oldPart}${suffix}`;
    const newPath = `${prefix}${newPart}${suffix}`;
    return { path: newPath, status, originalPath };
  }

  // Fallback: treat as a simple path (no source info available).
  // Avoids silently dropping the entry on unexpected jj output variants.
  return { path: rest, status };
}
