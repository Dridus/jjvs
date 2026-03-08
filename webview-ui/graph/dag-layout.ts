/**
 * DAG layout algorithm for the jjvs revision graph webview.
 *
 * Computes (row, column) positions for each revision node and the directed
 * edges between parent-child pairs. The resulting data is suitable for SVG
 * rendering in `App.svelte`.
 *
 * The column-tracking algorithm is adapted from the text-based graph renderer
 * in `src/vscode/views/revisions/graph-renderer.ts`. This module extends it
 * to produce coordinate data rather than text prefix strings.
 */

/**
 * A serialized revision as transmitted from the extension host to the graph
 * webview. All fields are JSON-serializable (no `Date` objects).
 *
 * Must be kept in sync with `GraphRevision` in
 * `src/vscode/webview/graph/provider.ts`.
 */
export interface GraphRevision {
  readonly changeId: string;
  readonly commitId: string;
  readonly description: string;
  readonly authorName: string;
  /** ISO 8601 timestamp string. */
  readonly authorTimestamp: string;
  readonly parentChangeIds: readonly string[];
  readonly localBookmarks: readonly string[];
  /** Remote bookmarks formatted as `"name@remote"`. */
  readonly remoteBookmarks: readonly string[];
  readonly tags: readonly string[];
  readonly isWorkingCopy: boolean;
  readonly isEmpty: boolean;
  readonly isImmutable: boolean;
  readonly hasConflict: boolean;
  readonly isDivergent: boolean;
}

/**
 * The visual type of a graph node, used for color and shape selection in SVG.
 *
 * Priority order: workingCopy > conflict > immutable > empty > mutable.
 */
export type NodeType = 'workingCopy' | 'conflict' | 'immutable' | 'empty' | 'mutable';

/** Position and display data for a single graph node. */
export interface LayoutNode {
  readonly revision: GraphRevision;
  /** Row index (0 = newest, increases downward). */
  readonly row: number;
  /** Column index (0 = leftmost). */
  readonly column: number;
  readonly nodeType: NodeType;
}

/**
 * A directed edge from a child revision to one of its parents.
 *
 * All coordinates are in row/column space. The SVG renderer converts them to
 * pixel coordinates using the configured row height and column width.
 */
export interface LayoutEdge {
  /** The child revision's change ID. */
  readonly childChangeId: string;
  /** The parent revision's change ID. */
  readonly parentChangeId: string;
  readonly fromRow: number;
  readonly fromColumn: number;
  readonly toRow: number;
  readonly toColumn: number;
}

/** The complete layout output for a revision DAG. */
export interface DagLayout {
  readonly nodes: readonly LayoutNode[];
  readonly edges: readonly LayoutEdge[];
  /** Maximum column index used anywhere (0-based). Used for SVG width calculations. */
  readonly maxColumn: number;
}

function nodeTypeFor(revision: GraphRevision): NodeType {
  if (revision.isWorkingCopy) return 'workingCopy';
  if (revision.hasConflict) return 'conflict';
  if (revision.isImmutable) return 'immutable';
  if (revision.isEmpty) return 'empty';
  return 'mutable';
}

/**
 * Compute DAG layout for a list of revisions.
 *
 * @param revisions - Revisions in topological order (newest first, as returned
 *   by `jj log --no-graph`). Parents must appear after their children.
 */
export function computeLayout(revisions: readonly GraphRevision[]): DagLayout {
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];

  // columns[i] = changeId this slot is "heading toward" (waiting to meet),
  // or null if the slot is free.
  const columns: (string | null)[] = [];

  let maxColumn = 0;

  for (let row = 0; row < revisions.length; row++) {
    const revision = revisions[row];

    // ── Find column slots targeting this revision ────────────────────────────
    const matchingIndices: number[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] === revision.changeId) {
        matchingIndices.push(i);
      }
    }

    // ── Assign this revision's column ────────────────────────────────────────
    let nodeColumn: number;
    if (matchingIndices.length === 0) {
      // Head revision (no active parent chain arrives here from above):
      // use the first free slot, or extend the array.
      const nullIndex = columns.indexOf(null);
      nodeColumn = nullIndex >= 0 ? nullIndex : columns.length;
      if (nodeColumn >= columns.length) {
        columns.push(null);
      }
    } else {
      // Use the leftmost matching slot; close any duplicates (divergent changeIds).
      nodeColumn = matchingIndices[0];
      for (const idx of matchingIndices.slice(1)) {
        columns[idx] = null;
      }
    }

    if (nodeColumn > maxColumn) maxColumn = nodeColumn;

    nodes.push({ revision, row, column: nodeColumn, nodeType: nodeTypeFor(revision) });

    // ── Update columns for this revision's parents ───────────────────────────
    const parents = revision.parentChangeIds;
    if (parents.length === 0) {
      // Root revision: this column is now free.
      columns[nodeColumn] = null;
    } else {
      // First parent continues this column (maintains the main-line appearance).
      columns[nodeColumn] = parents[0];

      // Additional parents (merges) open new column slots.
      for (let p = 1; p < parents.length; p++) {
        const parentId = parents[p];
        // Don't open a duplicate column if this parent is already being tracked.
        if (!columns.includes(parentId)) {
          const nullIndex = columns.indexOf(null);
          if (nullIndex >= 0) {
            columns[nullIndex] = parentId;
            if (nullIndex > maxColumn) maxColumn = nullIndex;
          } else {
            columns.push(parentId);
            if (columns.length - 1 > maxColumn) maxColumn = columns.length - 1;
          }
        }
      }
    }

    // Compact: remove trailing null slots to keep the columns array tight.
    while (columns.length > 0 && columns[columns.length - 1] === null) {
      columns.pop();
    }
  }

  // Build edges using the positions computed above.
  const positionByChangeId = new Map<string, { row: number; column: number }>();
  for (const node of nodes) {
    positionByChangeId.set(node.revision.changeId, { row: node.row, column: node.column });
  }

  for (const node of nodes) {
    for (const parentChangeId of node.revision.parentChangeIds) {
      const parentPos = positionByChangeId.get(parentChangeId);
      if (parentPos === undefined) {
        // Parent is outside the current view (truncated by logLimit); skip.
        continue;
      }
      edges.push({
        childChangeId: node.revision.changeId,
        parentChangeId,
        fromRow: node.row,
        fromColumn: node.column,
        toRow: parentPos.row,
        toColumn: parentPos.column,
      });
    }
  }

  return { nodes, edges, maxColumn };
}
