/**
 * Text-based graph prefix renderer for the jj revision log tree view.
 *
 * Computes per-revision graph prefix strings by tracking "active columns"
 * as we traverse the revision list in topological order (newest first).
 *
 * Each column represents a chain of parent-child edges. As we process each
 * revision:
 *  - Columns waiting for this revision's changeId are "closed"
 *  - New columns are opened for each of this revision's parents
 *  - The revision is drawn at the leftmost matching column (or a new column
 *    if none exist)
 *
 * This produces prefixes like "○", "│ ○", "│ │ ○" that visually indicate
 * the revision's position in the DAG, similar to `jj log --graph` output.
 *
 * Full connection lines between rows (├─╮, ╰─╯ etc.) require inter-row
 * "filler" items and are rendered by the Graph Webview instead.
 *
 * Note: this module has no `vscode` imports so it can be tested with vitest.
 */

import type { Revision } from '../../../core/types';

/** The graph node character and column-edge characters used in prefixes. */
const GRAPH_CHARS = {
  workingCopy: '@',
  mutable: '○',
  immutable: '◆',
  empty: '◇',
  conflict: '×',
  edge: '│',
  space: ' ',
} as const;

/**
 * The computed graph display information for a single revision row.
 */
export interface GraphRow {
  /**
   * Characters to display before the revision's change ID and description.
   *
   * Examples: `"@"`, `"○"`, `"│ ○"`, `"│ │ ×"`.
   * Columns are separated by single spaces.
   */
  readonly nodePrefix: string;
}

/**
 * Computes graph prefix strings for a list of revisions.
 *
 * @param revisions - Revisions in topological order (newest first), as
 *   returned by `jj log --no-graph`.
 * @returns One `GraphRow` per revision, in the same order.
 */
export function renderGraph(revisions: readonly Revision[]): readonly GraphRow[] {
  const rows: GraphRow[] = [];

  // columns[i] is the changeId this column is waiting to see next,
  // or null if the column slot is currently unoccupied.
  const columns: (string | null)[] = [];

  for (const revision of revisions) {
    // ── 1. Find columns waiting for this revision ──────────────────────────
    const matchingIndices: number[] = [];
    for (let i = 0; i < columns.length; i++) {
      if (columns[i] === revision.changeId) {
        matchingIndices.push(i);
      }
    }

    // ── 2. Determine this revision's display column ────────────────────────
    let revisionColumn: number;
    if (matchingIndices.length === 0) {
      // New head: place in the first available slot, or extend the array.
      const nullIndex = columns.indexOf(null);
      if (nullIndex >= 0) {
        revisionColumn = nullIndex;
      } else {
        revisionColumn = columns.length;
        columns.push(null); // reserve the slot
      }
    } else {
      // Use the leftmost matching column.
      revisionColumn = matchingIndices[0];
      // Multiple matches can occur with divergent changeIds; close the extras.
      for (const idx of matchingIndices.slice(1)) {
        columns[idx] = null;
      }
    }

    // ── 3. Build prefix from current column state ──────────────────────────
    //
    // We compute the prefix BEFORE updating columns for this revision's
    // parents so that the drawn state reflects the edges arriving at this
    // revision, not the edges leaving it.
    const nodeChar = nodeCharFor(revision);

    // How many columns do we need to draw? At minimum we cover the revision's
    // own column. We also cover any columns to the right that are active.
    const numColumns = Math.max(
      revisionColumn + 1,
      columns.reduce((max, col, i) => (col !== null ? i + 1 : max), 0),
    );

    const parts: string[] = [];
    for (let i = 0; i < numColumns; i++) {
      if (i === revisionColumn) {
        parts.push(nodeChar);
      } else if (matchingIndices.includes(i)) {
        // This column also matched this revision (divergence merge-in);
        // draw a space so we don't imply the edge continues downward.
        parts.push(GRAPH_CHARS.space);
      } else if (i < columns.length && columns[i] !== null) {
        parts.push(GRAPH_CHARS.edge);
      } else {
        parts.push(GRAPH_CHARS.space);
      }
    }

    rows.push({ nodePrefix: parts.join(' ') });

    // ── 4. Update columns for this revision's parents ─────────────────────
    const parents = revision.parentChangeIds;
    if (parents.length === 0) {
      // Root revision — no downward edges from here.
      columns[revisionColumn] = null;
    } else {
      // First parent continues this revision's column.
      columns[revisionColumn] = parents[0];
      // Additional parents open new columns (merge edges going down-right).
      for (let p = 1; p < parents.length; p++) {
        const parentId = parents[p];
        // Don't open a duplicate column if this parent is already tracked.
        if (!columns.includes(parentId)) {
          const nullIndex = columns.indexOf(null);
          if (nullIndex >= 0) {
            columns[nullIndex] = parentId;
          } else {
            columns.push(parentId);
          }
        }
      }
    }

    // ── 5. Compact: trim trailing null slots ──────────────────────────────
    while (columns.length > 0 && columns[columns.length - 1] === null) {
      columns.pop();
    }
  }

  return rows;
}

/**
 * Returns the graph node character for a revision.
 *
 * Priority order: working copy > conflict > immutable > empty > mutable.
 * Working copy takes precedence so `@` is always shown for `@`, even when
 * the working copy also has conflicts (the conflict is conveyed by the icon).
 */
export function nodeCharFor(revision: Revision): string {
  if (revision.isWorkingCopy) return GRAPH_CHARS.workingCopy;
  if (revision.hasConflict) return GRAPH_CHARS.conflict;
  if (revision.isImmutable) return GRAPH_CHARS.immutable;
  if (revision.isEmpty) return GRAPH_CHARS.empty;
  return GRAPH_CHARS.mutable;
}
