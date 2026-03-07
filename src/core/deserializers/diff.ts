/**
 * Parsers for `jj diff` text output.
 *
 * jj diff output formats:
 * 1. `jj diff --stat` — per-file summary with line change counts and visual bar.
 * 2. `jj diff` (default word-diff) or `jj diff --git` — full diff text for display.
 *
 * Note on `addedLines` / `removedLines` accuracy from `--stat` output:
 * The `jj diff --stat` format shows a visual bar (`+++++--`) that represents the
 * proportion of additions vs. deletions relative to the file with the most changes.
 * For files that are entirely added or entirely deleted, counts are exact. For
 * modified files, counts are APPROXIMATE (derived from the bar proportions).
 *
 * For exact per-file add/remove counts, use the `diff.stat().files()` template
 * API (Phase 11a will add a dedicated `JjCli.revisionFileStat()` method using
 * `DiffStatEntry.lines_added()` / `.lines_removed()`).
 *
 * Verified against jj 0.38.0 on 2026-03-07.
 * Fixture: test/unit/fixtures/diff-stat.fixture.txt
 */

import type { DiffStat } from '../types';

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
