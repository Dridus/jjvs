/**
 * Shared constants, types, and pure helper functions for the graph webview.
 *
 * Extracted from App.svelte to allow sub-components to share layout math
 * and display logic without circular imports.
 */

import type { LayoutEdge, LayoutNode } from './dag-layout.js';

// ── Layout constants ──────────────────────────────────────────────────────────

/** Horizontal spacing between graph columns, in pixels. */
export const COL_WIDTH = 18;
/** Vertical spacing between graph rows, in pixels. */
export const ROW_HEIGHT = 32;
/** Radius of a revision node circle, in pixels. */
export const NODE_RADIUS = 5;
/** Horizontal padding added on each side of the SVG. */
export const SVG_PADDING = 4;

// ── Coordinate helpers ────────────────────────────────────────────────────────

export function nodeX(col: number): number {
  return SVG_PADDING + col * COL_WIDTH + COL_WIDTH / 2;
}

export function nodeY(row: number): number {
  return row * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/**
 * Build an SVG path `d` attribute for a parent-child edge.
 *
 * Edges between the same column are straight vertical lines. Edges between
 * different columns use a symmetric cubic bezier that starts and ends
 * vertically, with the inflection point at the midpoint between the two rows.
 */
export function edgePath(edge: LayoutEdge): string {
  const x1 = nodeX(edge.fromColumn);
  const y1 = nodeY(edge.fromRow);
  const x2 = nodeX(edge.toColumn);
  const y2 = nodeY(edge.toRow);
  if (edge.fromColumn === edge.toColumn) {
    return `M${x1},${y1} L${x2},${y2}`;
  }
  const midY = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export function shortId(changeId: string): string {
  return changeId.substring(0, 8);
}

export function formatTimestamp(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 60_000) return 'just now';
    if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
    if (diffMs < 2_592_000_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
    return new Date(isoString).toLocaleDateString();
  } catch {
    return '';
  }
}

export function firstLine(description: string): string {
  const trimmed = description.trim();
  if (trimmed === '') return '(no description)';
  const nl = trimmed.indexOf('\n');
  return nl >= 0 ? trimmed.substring(0, nl) : trimmed;
}

/** Accessible label for a graph node circle. */
export function nodeAriaLabel(node: LayoutNode): string {
  const prefix = node.revision.isWorkingCopy ? 'Working copy: ' : '';
  const desc = firstLine(node.revision.description);
  return `${prefix}${desc} (${shortId(node.revision.changeId)})`;
}

// ── Shared types ──────────────────────────────────────────────────────────────

/** Actions the user can trigger from the context menu. */
export type ContextMenuAction =
  | 'edit'
  | 'newAfter'
  | 'describe'
  | 'squash'
  | 'rebase'
  | 'abandon'
  | 'copyChangeId'
  | 'copyCommitId';

export type ContextMenuState = {
  readonly x: number;
  readonly y: number;
  readonly changeId: string;
  readonly isImmutable: boolean;
  readonly isWorkingCopy: boolean;
};

/**
 * Active drag-rebase state.
 *
 * A drag is initiated by pressing and holding on a mutable revision node or
 * row, then moving more than the drag threshold. Releasing over a valid
 * (non-immutable, non-self) revision sends a `dragRebase` message to the
 * extension host.
 */
export type DragState = {
  readonly sourceChangeId: string;
  /** Current cursor position in viewport coordinates. */
  ghostX: number;
  ghostY: number;
  /**
   * Change ID of the revision currently under the cursor (valid drop target),
   * or null if no valid target is under the cursor.
   */
  targetChangeId: string | null;
};
