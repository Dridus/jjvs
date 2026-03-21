/**
 * Tests for the `jj diff` text parsers.
 *
 * Fixture data: test/unit/fixtures/diff-stat.fixture.txt
 * Captured from: jj 0.38.0 on 2026-03-07
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  parseDiffStat,
  parseDiffStatPaths,
  parseSummaryDiff,
} from '../../../src/core/deserializers/diff';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_PATH = resolve(__dirname, '../fixtures/diff-stat.fixture.txt');
const FIXTURE_STAT = readFileSync(FIXTURE_PATH, 'utf-8');

// ─── parseDiffStat ────────────────────────────────────────────────────────────

describe('parseDiffStat', () => {
  it('parses all file entries from the fixture (skips summary line)', () => {
    const entries = parseDiffStat(FIXTURE_STAT);
    expect(entries).toHaveLength(8);
  });

  it('extracts file paths correctly', () => {
    const entries = parseDiffStat(FIXTURE_STAT);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('src/core/jj-cli.ts');
    expect(paths).toContain('src/core/jj-runner.ts');
    expect(paths).toContain('test/unit/result.test.ts');
  });

  it('all new files have removedLines = 0 (all-addition bar)', () => {
    const entries = parseDiffStat(FIXTURE_STAT);
    for (const entry of entries) {
      // All files in the fixture are new (all-+ bar), so removedLines should be 0
      expect(entry.removedLines).toBe(0);
    }
  });

  it('new file with large count has correct addedLines', () => {
    const entries = parseDiffStat(FIXTURE_STAT);
    const cliEntry = entries.find((e) => e.path === 'src/core/jj-cli.ts')!;
    expect(cliEntry).toBeDefined();
    expect(cliEntry.addedLines).toBe(1074);
    expect(cliEntry.removedLines).toBe(0);
  });

  it('returns empty array for empty input', () => {
    expect(parseDiffStat('')).toHaveLength(0);
    expect(parseDiffStat('\n\n')).toHaveLength(0);
  });

  it('returns empty array for only a summary line', () => {
    expect(parseDiffStat('3 files changed, 10 insertions(+), 2 deletions(-)\n')).toHaveLength(0);
  });

  it('handles a purely deleted file (all minus bar)', () => {
    const deletedFileStat =
      'old-service.ts  |  42 ------------------------------------------\n1 file changed, 0 insertions(+), 42 deletions(-)\n';
    const entries = parseDiffStat(deletedFileStat);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe('old-service.ts');
    expect(entries[0]!.addedLines).toBe(0);
    expect(entries[0]!.removedLines).toBe(42);
  });

  it('handles a modified file with mixed plus/minus bar (approximate)', () => {
    // 10 total changes, bar shows 3 plus and 2 minus (ratio 3:2)
    // Expected: addedLines ≈ round(10 * 3/5) = 6, removedLines = 4
    const modifiedStat =
      'src/util.ts  |  10 +++--\n1 file changed, 6 insertions(+), 4 deletions(-)\n';
    const entries = parseDiffStat(modifiedStat);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe('src/util.ts');
    // 10 total; bar "+++--" = 3 plus, 2 minus → addedLines = round(10 * 3/5) = 6
    expect(entries[0]!.addedLines).toBe(6);
    expect(entries[0]!.removedLines).toBe(4);
  });

  it('handles binary files or zero-line-diff entries', () => {
    const binaryStat = 'image.png  |  Bin 0 -> 1234 bytes\n1 file changed\n';
    // Binary files don't match the numeric pattern; they should be skipped
    const entries = parseDiffStat(binaryStat);
    expect(entries).toHaveLength(0);
  });

  it('handles files with spaces in paths', () => {
    const spaceStat = 'my file with spaces.ts  |  5 +++++\n1 file changed, 5 insertions(+)\n';
    const entries = parseDiffStat(spaceStat);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe('my file with spaces.ts');
  });

  it('matches snapshot', () => {
    const entries = parseDiffStat(FIXTURE_STAT);
    expect(entries).toMatchSnapshot();
  });
});

// ─── parseDiffStatPaths ───────────────────────────────────────────────────────

describe('parseDiffStatPaths', () => {
  it('extracts only the paths from diff stat output', () => {
    const paths = parseDiffStatPaths(FIXTURE_STAT);
    expect(paths).toHaveLength(8);
    expect(paths).toContain('src/core/jj-cli.ts');
  });

  it('returns empty array for empty input', () => {
    expect(parseDiffStatPaths('')).toHaveLength(0);
  });
});

// ─── parseSummaryDiff ─────────────────────────────────────────────────────────
//
// The summary format produced by `jj diff --summary` (verified on jj 0.38.0):
//
//   A path/to/added-file.ts
//   M path/to/modified-file.ts
//   D path/to/deleted-file.ts
//   R {old.ts => new.ts}
//   C {original.ts => copy.ts}
//
// This fixture is constructed manually since the format is straightforward
// text output rather than captured machine output.

describe('parseSummaryDiff', () => {
  it('parses added, modified, and deleted files', () => {
    const input = ['A src/new-file.ts', 'M src/existing.ts', 'D src/removed.ts'].join('\n');

    const result = parseSummaryDiff(input);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ path: 'src/new-file.ts', status: 'added' });
    expect(result[1]).toEqual({ path: 'src/existing.ts', status: 'modified' });
    expect(result[2]).toEqual({ path: 'src/removed.ts', status: 'deleted' });
  });

  it('parses a rename with curly-brace notation (same directory)', () => {
    const input = 'R {old-name.ts => new-name.ts}';
    const result = parseSummaryDiff(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'new-name.ts',
      status: 'renamed',
      originalPath: 'old-name.ts',
    });
  });

  it('parses a rename with curly-brace notation (cross-directory)', () => {
    const input = 'R {src/old.ts => dst/new.ts}';
    const result = parseSummaryDiff(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'dst/new.ts',
      status: 'renamed',
      originalPath: 'src/old.ts',
    });
  });

  it('parses a rename with shared prefix (curly-brace mid-path)', () => {
    // jj uses `dir/{old.ts => new.ts}` when only the filename changes
    const input = 'R src/{old.ts => new.ts}';
    const result = parseSummaryDiff(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'src/new.ts',
      status: 'renamed',
      originalPath: 'src/old.ts',
    });
  });

  it('parses a copy with curly-brace notation', () => {
    const input = 'C {original.ts => copy.ts}';
    const result = parseSummaryDiff(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'copy.ts',
      status: 'copied',
      originalPath: 'original.ts',
    });
  });

  it('parses a mixed changeset with multiple status types', () => {
    const input = [
      'A docs/new-guide.md',
      'M src/core/types.ts',
      'D src/old/legacy.ts',
      'R {src/utils.ts => src/helpers.ts}',
    ].join('\n');

    const result = parseSummaryDiff(input);
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ status: 'added', path: 'docs/new-guide.md' });
    expect(result[1]).toMatchObject({ status: 'modified', path: 'src/core/types.ts' });
    expect(result[2]).toMatchObject({ status: 'deleted', path: 'src/old/legacy.ts' });
    expect(result[3]).toMatchObject({
      status: 'renamed',
      path: 'src/helpers.ts',
      originalPath: 'src/utils.ts',
    });
  });

  it('returns empty array for empty input', () => {
    expect(parseSummaryDiff('')).toHaveLength(0);
    expect(parseSummaryDiff('\n\n')).toHaveLength(0);
  });

  it('skips lines that do not match the expected format', () => {
    const input = [
      'A valid-file.ts',
      '  indented line should be skipped',
      '',
      'X unknown-status.ts',
      'M another-valid.ts',
    ].join('\n');

    const result = parseSummaryDiff(input);
    // 'X' is not a recognised status char, so only A and M lines are parsed.
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ status: 'added' });
    expect(result[1]).toMatchObject({ status: 'modified' });
  });

  it('matches snapshot', () => {
    const input = [
      'A src/new-feature.ts',
      'M src/core/types.ts',
      'M src/vscode/extension.ts',
      'D src/deprecated/old.ts',
      'R {src/utils.ts => src/helpers.ts}',
      'C {original.ts => copy.ts}',
    ].join('\n');
    expect(parseSummaryDiff(input)).toMatchSnapshot();
  });
});
