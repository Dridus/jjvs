/**
 * Unit tests for the graph prefix renderer.
 *
 * The graph renderer is a pure function that takes a flat list of Revision
 * objects in topological order and returns a graph prefix string per revision.
 * These tests verify the column-tracking algorithm against known DAG shapes.
 *
 * Note: graph-renderer.ts has no `vscode` imports, so it is testable with
 * vitest despite living in the `src/vscode/` layer.
 */

import { describe, it, expect } from 'vitest';
import { renderGraph, nodeCharFor } from '../../../../src/vscode/views/revisions/graph-renderer';
import type { Revision } from '../../../../src/core/types';

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Creates a minimal Revision with only the fields the graph renderer uses.
 */
function makeRevision(
  changeId: string,
  options: {
    parentChangeIds?: string[];
    isWorkingCopy?: boolean;
    hasConflict?: boolean;
    isImmutable?: boolean;
    isEmpty?: boolean;
    isDivergent?: boolean;
  } = {},
): Revision {
  const now = new Date();
  return {
    changeId,
    commitId: `commit-${changeId}`,
    description: '',
    author: { name: 'Test', email: 'test@test.com', timestamp: now },
    committer: { name: 'Test', email: 'test@test.com', timestamp: now },
    parentChangeIds: options.parentChangeIds ?? [],
    parentCommitIds: (options.parentChangeIds ?? []).map((id) => `commit-${id}`),
    localBookmarks: [],
    remoteBookmarks: [],
    tags: [],
    isWorkingCopy: options.isWorkingCopy ?? false,
    isEmpty: options.isEmpty ?? false,
    isImmutable: options.isImmutable ?? false,
    hasConflict: options.hasConflict ?? false,
    isDivergent: options.isDivergent ?? false,
  };
}

/** Extracts just the nodePrefix strings for compact assertions. */
function prefixes(revisions: readonly Revision[]): string[] {
  return renderGraph(revisions).map((row) => row.nodePrefix);
}

// ── nodeCharFor ───────────────────────────────────────────────────────────────

describe('nodeCharFor', () => {
  it('returns @ for the working copy', () => {
    expect(nodeCharFor(makeRevision('a', { isWorkingCopy: true }))).toBe('@');
  });

  it('returns × for a conflicted revision', () => {
    expect(nodeCharFor(makeRevision('a', { hasConflict: true }))).toBe('×');
  });

  it('returns @ for a working copy even when it has a conflict', () => {
    expect(nodeCharFor(makeRevision('a', { isWorkingCopy: true, hasConflict: true }))).toBe('@');
  });

  it('returns ◆ for an immutable revision', () => {
    expect(nodeCharFor(makeRevision('a', { isImmutable: true }))).toBe('◆');
  });

  it('returns ◇ for an empty revision', () => {
    expect(nodeCharFor(makeRevision('a', { isEmpty: true }))).toBe('◇');
  });

  it('returns ○ for a normal mutable revision', () => {
    expect(nodeCharFor(makeRevision('a'))).toBe('○');
  });
});

// ── renderGraph ───────────────────────────────────────────────────────────────

describe('renderGraph', () => {
  it('returns an empty array for an empty input', () => {
    expect(renderGraph([])).toEqual([]);
  });

  it('renders a single revision with no parents', () => {
    const revisions = [makeRevision('a', { isWorkingCopy: true })];
    expect(prefixes(revisions)).toEqual(['@']);
  });

  it('renders a linear chain in a single column', () => {
    const revisions = [
      makeRevision('a', { isWorkingCopy: true, parentChangeIds: ['b'] }),
      makeRevision('b', { parentChangeIds: ['c'] }),
      makeRevision('c', { isImmutable: true }),
    ];
    expect(prefixes(revisions)).toEqual(['@', '○', '◆']);
  });

  it('renders a fork (two heads with a common parent)', () => {
    // Topological order: both heads before their common parent.
    const revisions = [
      makeRevision('a', { isWorkingCopy: true, parentChangeIds: ['c'] }),
      makeRevision('b', { parentChangeIds: ['c'] }),
      makeRevision('c', { isImmutable: true }),
    ];
    const result = prefixes(revisions);
    // 'a' is in column 0; 'b' lands in column 1; 'c' closes both columns.
    expect(result[0]).toBe('@');
    expect(result[1]).toBe('│ ○');
    // 'c' closes both columns: column 1 had a matching entry, so it draws
    // a space (not │) at position 1.
    expect(result[2]).toBe('◆');
  });

  it('renders a merge commit (two parents)', () => {
    // 'a' has two parents: 'b' (first) and 'c' (second).
    const revisions = [
      makeRevision('a', { isWorkingCopy: true, parentChangeIds: ['b', 'c'] }),
      makeRevision('b', { parentChangeIds: ['d'] }),
      makeRevision('c', { parentChangeIds: ['d'] }),
      makeRevision('d', { isImmutable: true }),
    ];
    const result = prefixes(revisions);
    // 'a' is in column 0 (single column at top).
    expect(result[0]).toBe('@');
    // 'b' continues column 0; column 1 was opened for 'c'.
    expect(result[1]).toBe('○ │');
    // 'c' closes column 1.
    expect(result[2]).toBe('│ ○');
    // 'd' closes column 0 (from b) — column 1 also matches so it's suppressed.
    expect(result[3]).toBe('◆');
  });

  it('renders each revision on a new row (length matches input)', () => {
    const revisions = [
      makeRevision('a', { parentChangeIds: ['b'] }),
      makeRevision('b', { parentChangeIds: ['c'] }),
      makeRevision('c'),
    ];
    expect(renderGraph(revisions)).toHaveLength(3);
  });

  it('handles a root revision (no parents) correctly', () => {
    const revisions = [
      makeRevision('a', { isWorkingCopy: true, parentChangeIds: ['root'] }),
      makeRevision('root', { isImmutable: true }),
    ];
    const result = prefixes(revisions);
    expect(result[0]).toBe('@');
    expect(result[1]).toBe('◆');
  });

  it('handles divergent revisions (two columns waiting for same parent)', () => {
    // Divergence: 'a' and 'b' both have 'c' as parent, 'a' was processed first.
    const revisions = [
      makeRevision('a', { parentChangeIds: ['c'], isDivergent: true }),
      makeRevision('b', { parentChangeIds: ['c'], isDivergent: true }),
      makeRevision('c', { isImmutable: true }),
    ];
    const result = prefixes(revisions);
    expect(result[0]).toBe('○');
    expect(result[1]).toBe('│ ○');
    // 'c' closes both columns; column 1 is suppressed (not shown as │).
    expect(result[2]).toBe('◆');
  });
});
