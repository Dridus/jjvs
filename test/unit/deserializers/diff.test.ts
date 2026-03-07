/**
 * Tests for the `jj diff` text parsers.
 *
 * Fixture data: test/unit/fixtures/diff-stat.fixture.txt
 * Captured from: jj 0.38.0 on 2026-03-07
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseDiffStat, parseDiffStatPaths } from '../../../src/core/deserializers/diff';

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
    const deletedFileStat = 'old-service.ts  |  42 ------------------------------------------\n1 file changed, 0 insertions(+), 42 deletions(-)\n';
    const entries = parseDiffStat(deletedFileStat);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.path).toBe('old-service.ts');
    expect(entries[0]!.addedLines).toBe(0);
    expect(entries[0]!.removedLines).toBe(42);
  });

  it('handles a modified file with mixed plus/minus bar (approximate)', () => {
    // 10 total changes, bar shows 3 plus and 2 minus (ratio 3:2)
    // Expected: addedLines ≈ round(10 * 3/5) = 6, removedLines = 4
    const modifiedStat = 'src/util.ts  |  10 +++--\n1 file changed, 6 insertions(+), 4 deletions(-)\n';
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
