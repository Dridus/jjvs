/**
 * Unit tests for the DAG layout algorithm in `webview-ui/graph/dag-layout.ts`.
 *
 * The algorithm is pure TypeScript with no browser or VSCode dependencies, so
 * it can be exercised directly with vitest in a Node environment.
 */

import { describe, it, expect } from 'vitest';
import { computeLayout, type GraphRevision } from '../../../../webview-ui/graph/dag-layout';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeRevision(
  changeId: string,
  parentChangeIds: string[] = [],
  overrides: Partial<GraphRevision> = {},
): GraphRevision {
  return {
    changeId,
    commitId: `commit-${changeId}`,
    description: `Description for ${changeId}`,
    authorName: 'Test Author',
    authorTimestamp: '2026-01-01T00:00:00.000Z',
    parentChangeIds,
    localBookmarks: [],
    remoteBookmarks: [],
    tags: [],
    isWorkingCopy: false,
    isEmpty: false,
    isImmutable: false,
    hasConflict: false,
    isDivergent: false,
    ...overrides,
  };
}

// ── computeLayout ─────────────────────────────────────────────────────────────

describe('computeLayout', () => {
  it('returns empty layout for empty input', () => {
    const layout = computeLayout([]);
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.maxColumn).toBe(0);
  });

  it('places a single root revision at row 0 column 0', () => {
    const revisions = [makeRevision('a')];
    const layout = computeLayout(revisions);

    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0]).toMatchObject({ row: 0, column: 0 });
    expect(layout.edges).toHaveLength(0);
    expect(layout.maxColumn).toBe(0);
  });

  it('places a linear chain in column 0 in topological order', () => {
    // newest first: c → b → a (a is the root)
    const revisions = [makeRevision('c', ['b']), makeRevision('b', ['a']), makeRevision('a')];

    const layout = computeLayout(revisions);

    expect(layout.nodes).toHaveLength(3);
    expect(layout.nodes[0]).toMatchObject({ row: 0, column: 0 }); // c
    expect(layout.nodes[1]).toMatchObject({ row: 1, column: 0 }); // b
    expect(layout.nodes[2]).toMatchObject({ row: 2, column: 0 }); // a
    expect(layout.maxColumn).toBe(0);
  });

  it('creates edges for each parent-child relationship', () => {
    const revisions = [makeRevision('b', ['a']), makeRevision('a')];
    const layout = computeLayout(revisions);

    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0]).toMatchObject({
      childChangeId: 'b',
      parentChangeId: 'a',
      fromRow: 0,
      fromColumn: 0,
      toRow: 1,
      toColumn: 0,
    });
  });

  it('assigns a new column to a branch (two children of the same parent)', () => {
    // b1 and b2 are both children of a; they should be in different columns
    const revisions = [makeRevision('b1', ['a']), makeRevision('b2', ['a']), makeRevision('a')];

    const layout = computeLayout(revisions);
    const b1 = layout.nodes.find((n) => n.revision.changeId === 'b1');
    const b2 = layout.nodes.find((n) => n.revision.changeId === 'b2');
    const a = layout.nodes.find((n) => n.revision.changeId === 'a');

    expect(b1).toBeDefined();
    expect(b2).toBeDefined();
    expect(a).toBeDefined();

    // b1 and b2 must be in different columns
    expect(b1!.column).not.toBe(b2!.column);
    expect(b1!.column).toBe(0); // first arrives at column 0
    expect(b2!.column).toBe(1); // second gets a new column
  });

  it('assigns nodeType correctly for each revision flag', () => {
    const revisions = [
      makeRevision('wc', [], { isWorkingCopy: true }),
      makeRevision('cf', [], { hasConflict: true }),
      makeRevision('im', [], { isImmutable: true }),
      makeRevision('em', [], { isEmpty: true }),
      makeRevision('mu', []),
    ];

    const layout = computeLayout(revisions);
    const byId = new Map(layout.nodes.map((n) => [n.revision.changeId, n]));

    expect(byId.get('wc')?.nodeType).toBe('workingCopy');
    expect(byId.get('cf')?.nodeType).toBe('conflict');
    expect(byId.get('im')?.nodeType).toBe('immutable');
    expect(byId.get('em')?.nodeType).toBe('empty');
    expect(byId.get('mu')?.nodeType).toBe('mutable');
  });

  it('working copy takes priority over conflict for nodeType', () => {
    const revision = makeRevision('x', [], { isWorkingCopy: true, hasConflict: true });
    const layout = computeLayout([revision]);
    expect(layout.nodes[0]?.nodeType).toBe('workingCopy');
  });

  it('handles a merge commit (two parents)', () => {
    // m merges p1 and p2
    const revisions = [
      makeRevision('m', ['p1', 'p2']),
      makeRevision('p1', []),
      makeRevision('p2', []),
    ];

    const layout = computeLayout(revisions);
    const m = layout.nodes.find((n) => n.revision.changeId === 'm');
    const p1 = layout.nodes.find((n) => n.revision.changeId === 'p1');
    const p2 = layout.nodes.find((n) => n.revision.changeId === 'p2');

    expect(m).toBeDefined();
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    // m has two outgoing edges
    const edgesFromM = layout.edges.filter((e) => e.childChangeId === 'm');
    expect(edgesFromM).toHaveLength(2);

    // Edges connect m to p1 and p2
    const targetIds = edgesFromM.map((e) => e.parentChangeId).sort();
    expect(targetIds).toEqual(['p1', 'p2']);
  });

  it('skips edges for parents outside the current view (truncated by logLimit)', () => {
    // b's parent 'a' is not in the revision list (outside the view window)
    const revisions = [makeRevision('b', ['a'])];
    const layout = computeLayout(revisions);

    expect(layout.nodes).toHaveLength(1);
    // No edge because 'a' is not in the layout
    expect(layout.edges).toHaveLength(0);
  });

  it('assigns rows in the order revisions are provided', () => {
    const revisions = [
      makeRevision('newest', ['middle']),
      makeRevision('middle', ['oldest']),
      makeRevision('oldest'),
    ];

    const layout = computeLayout(revisions);
    const byId = new Map(layout.nodes.map((n) => [n.revision.changeId, n]));

    expect(byId.get('newest')?.row).toBe(0);
    expect(byId.get('middle')?.row).toBe(1);
    expect(byId.get('oldest')?.row).toBe(2);
  });

  it('computes maxColumn correctly for multiple parallel branches sharing a root', () => {
    // Three branches all heading toward 'root' — they must occupy separate
    // columns simultaneously until root is processed.
    const revisions = [
      makeRevision('b1', ['root']),
      makeRevision('b2', ['root']),
      makeRevision('b3', ['root']),
      makeRevision('root'),
    ];

    const layout = computeLayout(revisions);

    // b1=col0, b2=col1, b3=col2 (all waiting for 'root' at different columns)
    expect(layout.maxColumn).toBe(2);
  });

  it('reuses freed columns for new heads', () => {
    // 'main' → 'root' (linear); 'feature' has no parent in view
    // Column 0: main→root chain. After 'root' is processed, column 0 is freed.
    // 'feature' should reuse column 0.
    const revisions = [
      makeRevision('main', ['root']),
      makeRevision('root'), // root: frees column 0
      makeRevision('feature'), // should reuse column 0
    ];

    const layout = computeLayout(revisions);
    const feature = layout.nodes.find((n) => n.revision.changeId === 'feature');

    expect(feature?.column).toBe(0);
    expect(layout.maxColumn).toBe(0);
  });

  it('produces a snapshot for a typical branching graph', () => {
    const revisions = [
      makeRevision('wc', ['feat-2'], { isWorkingCopy: true }),
      makeRevision('feat-2', ['feat-1']),
      makeRevision('feat-1', ['main-2']),
      makeRevision('main-2', ['main-1']),
      makeRevision('main-1', [], { isImmutable: true }),
    ];

    const layout = computeLayout(revisions);

    expect(
      layout.nodes.map((n) => ({
        id: n.revision.changeId,
        row: n.row,
        col: n.column,
        type: n.nodeType,
      })),
    ).toMatchSnapshot();

    expect(
      layout.edges.map((e) => ({
        from: e.childChangeId,
        to: e.parentChangeId,
        fromRow: e.fromRow,
        fromCol: e.fromColumn,
        toRow: e.toRow,
        toCol: e.toColumn,
      })),
    ).toMatchSnapshot();
  });
});
