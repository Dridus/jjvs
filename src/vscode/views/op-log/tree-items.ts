/**
 * Tree item classes for the jj operation log tree view (jjvs.oplog).
 *
 * Tree structure (flat list, no sections):
 *   OperationTreeItem("add workspace 'default'")   ← most recent
 *   OperationTreeItem("new empty commit")
 *   OperationTreeItem("describe commit ...")
 *   ...
 *
 * `contextValue` drives `view/item/context` menu visibility:
 *   - `operation` — an operation entry (restore action available)
 */

import * as vscode from 'vscode';
import type { Operation } from '../../../core/types';

/** Union type for all nodes in the op log tree view. */
export type OpLogTreeItem = OperationTreeItem;

// ─── Operation item ───────────────────────────────────────────────────────────

/**
 * A tree item representing a single jj operation in the operation log.
 */
export class OperationTreeItem extends vscode.TreeItem {
  /** The full `Operation` data, available to command handlers via `treeView.selection`. */
  readonly operation: Operation;

  constructor(operation: Operation) {
    // Use the first line of the description as the label.
    const firstLine = operation.description.split('\n')[0]?.trim() ?? operation.description;
    super(firstLine, vscode.TreeItemCollapsibleState.None);

    this.operation = operation;
    this.id = `operation:${operation.id}`;
    this.contextValue = 'operation';
    this.iconPath = new vscode.ThemeIcon('history');
    this.description = formatRelativeTime(operation.time.end);
    this.tooltip = buildOperationTooltip(operation);
    this.accessibilityInformation = {
      label: `Operation: ${firstLine}, ${formatRelativeTime(operation.time.end)}`,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format a date as a human-readable relative time string.
 *
 * - Less than 1 minute: "just now"
 * - Less than 1 hour:   "N minutes ago"
 * - Less than 24 hours: "N hours ago"
 * - Otherwise:          locale date string
 */
export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) {
    return 'just now';
  }
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

function buildOperationTooltip(operation: Operation): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(
    `**${operation.description.split('\n')[0]?.trim() ?? operation.description}**\n\n`,
  );

  if (operation.description.includes('\n')) {
    const rest = operation.description.split('\n').slice(1).join('\n').trim();
    if (rest !== '') {
      md.appendMarkdown(`${rest}\n\n`);
    }
  }

  md.appendMarkdown(`**ID:** \`${operation.id.substring(0, 16)}...\`\n\n`);
  md.appendMarkdown(`**User:** ${operation.user}\n\n`);
  md.appendMarkdown(
    `**Time:** ${operation.time.start.toLocaleString()} → ${operation.time.end.toLocaleString()}`,
  );

  return md;
}
