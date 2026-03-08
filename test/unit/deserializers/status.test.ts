/**
 * Tests for the `jj status` text parser.
 *
 * Fixture data: test/unit/fixtures/status-*.fixture.txt
 * Captured from: jj 0.38.0 on 2026-03-07
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseStatus, parseFileStatusChar } from '../../../src/core/deserializers/status';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, `../fixtures/${name}`), 'utf-8');
}

const WITH_CHANGES = loadFixture('status-with-changes.fixture.txt');
const NO_CHANGES = loadFixture('status-no-changes.fixture.txt');
const WITH_CONFLICTS = loadFixture('status-conflicts.fixture.txt');

// ─── parseFileStatusChar ──────────────────────────────────────────────────────

describe('parseFileStatusChar', () => {
  it('maps known status characters to FileStatus values', () => {
    expect(parseFileStatusChar('A')).toBe('added');
    expect(parseFileStatusChar('M')).toBe('modified');
    expect(parseFileStatusChar('D')).toBe('deleted');
    expect(parseFileStatusChar('R')).toBe('renamed');
    expect(parseFileStatusChar('C')).toBe('copied');
  });

  it('returns undefined for unknown characters', () => {
    expect(parseFileStatusChar('X')).toBeUndefined();
    expect(parseFileStatusChar('')).toBeUndefined();
    expect(parseFileStatusChar(undefined)).toBeUndefined();
    expect(parseFileStatusChar('?')).toBeUndefined();
  });
});

// ─── parseStatus — with changes ───────────────────────────────────────────────

describe('parseStatus with changes', () => {
  it('parses all file changes', () => {
    const status = parseStatus(WITH_CHANGES);
    expect(status.fileChanges).toHaveLength(5);
  });

  it('correctly identifies added files', () => {
    const status = parseStatus(WITH_CHANGES);
    const added = status.fileChanges.filter((f) => f.status === 'added');
    expect(added).toHaveLength(3);
    expect(added.map((f) => f.path)).toContain('src/core/jj-runner.ts');
    expect(added.map((f) => f.path)).toContain('src/core/result.ts');
    expect(added.map((f) => f.path)).toContain('src/core/types.ts');
  });

  it('correctly identifies modified files', () => {
    const status = parseStatus(WITH_CHANGES);
    const modified = status.fileChanges.filter((f) => f.status === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0]!.path).toBe('README.md');
  });

  it('correctly identifies deleted files', () => {
    const status = parseStatus(WITH_CHANGES);
    const deleted = status.fileChanges.filter((f) => f.status === 'deleted');
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.path).toBe('old-file.txt');
  });

  it('extracts the parent change ID', () => {
    const status = parseStatus(WITH_CHANGES);
    expect(status.parentChangeIds).toContain('ytzyotyo');
  });

  it('hasConflicts is false when no conflicts', () => {
    const status = parseStatus(WITH_CHANGES);
    expect(status.hasConflicts).toBe(false);
  });
});

// ─── parseStatus — no changes ─────────────────────────────────────────────────

describe('parseStatus with no changes', () => {
  it('returns empty fileChanges', () => {
    const status = parseStatus(NO_CHANGES);
    expect(status.fileChanges).toHaveLength(0);
  });

  it('still extracts parent change ID', () => {
    const status = parseStatus(NO_CHANGES);
    expect(status.parentChangeIds).toContain('ytzyotyo');
  });

  it('hasConflicts is false', () => {
    const status = parseStatus(NO_CHANGES);
    expect(status.hasConflicts).toBe(false);
  });
});

// ─── parseStatus — conflicts ──────────────────────────────────────────────────

describe('parseStatus with conflicts', () => {
  it('sets hasConflicts to true', () => {
    const status = parseStatus(WITH_CONFLICTS);
    expect(status.hasConflicts).toBe(true);
  });

  it('still parses file changes before the conflict section', () => {
    const status = parseStatus(WITH_CONFLICTS);
    expect(status.fileChanges.some((f) => f.path === 'src/conflict.ts')).toBe(true);
  });
});

// ─── parseStatus — snapshots ──────────────────────────────────────────────────

describe('parseStatus snapshots', () => {
  it('with-changes fixture matches snapshot', () => {
    expect(parseStatus(WITH_CHANGES)).toMatchSnapshot();
  });

  it('no-changes fixture matches snapshot', () => {
    expect(parseStatus(NO_CHANGES)).toMatchSnapshot();
  });

  it('conflicts fixture matches snapshot', () => {
    expect(parseStatus(WITH_CONFLICTS)).toMatchSnapshot();
  });
});

// ─── parseStatus — edge cases ─────────────────────────────────────────────────

describe('parseStatus edge cases', () => {
  it('handles empty input gracefully', () => {
    const status = parseStatus('');
    expect(status.fileChanges).toHaveLength(0);
    expect(status.parentChangeIds).toHaveLength(0);
    expect(status.hasConflicts).toBe(false);
  });

  it('handles output with multiple parents (merge commits)', () => {
    const mergeStatus = [
      'Working copy changes:',
      'M file.ts',
      'Working copy  (@) : abc12345 def67890 merge result',
      'Parent commit (@-): parent111 commit111 first parent',
      'Parent commit (@-): parent222 commit222 second parent',
      '',
    ].join('\n');
    const status = parseStatus(mergeStatus);
    expect(status.parentChangeIds).toHaveLength(2);
    expect(status.parentChangeIds).toContain('parent111');
    expect(status.parentChangeIds).toContain('parent222');
  });

  it('handles paths with spaces correctly', () => {
    const statusWithSpaces = [
      'Working copy changes:',
      'A path with spaces/file.ts',
      'Working copy  (@) : abc12345 def67890 (no description set)',
      'Parent commit (@-): parent111 commit111 parent',
      '',
    ].join('\n');
    const status = parseStatus(statusWithSpaces);
    expect(status.fileChanges[0]?.path).toBe('path with spaces/file.ts');
  });
});
