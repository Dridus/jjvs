/**
 * Tree item classes for the jj revision log tree view.
 *
 * `RevisionTreeItem` represents a single jj revision with:
 * - A graph node prefix (from `graph-renderer.ts`) embedded in the label
 * - The short change ID (12 chars) bolded via TreeItemLabel highlights
 * - Bookmarks inline in the label
 * - Author + relative timestamp as the faded description
 * - A ThemeIcon that conveys conflict / working-copy / immutable state
 * - A hover tooltip with the full revision metadata
 * - A context value that drives `view/item/context` menu visibility
 *
 * `LoadMoreTreeItem` is appended when the revision list is truncated.
 */

import * as vscode from 'vscode';
import type { Revision } from '../../../core/types';

/** Number of characters of the change ID to display in the tree label. */
const SHORT_ID_LENGTH = 12;

/**
 * The base context value for revision tree items.
 *
 * Menu `when` clauses use `viewItem =~ /^revision/` to match any revision
 * item regardless of the additional pipe-separated flags.
 */
export const REVISION_CONTEXT_BASE = 'revision';

/**
 * A tree item representing a single revision in the jj revision log.
 */
export class RevisionTreeItem extends vscode.TreeItem {
  /** The full revision data, available to command handlers via `treeView.selection`. */
  readonly revision: Revision;

  constructor(revision: Revision, nodePrefix: string) {
    const shortChangeId = revision.changeId.substring(0, SHORT_ID_LENGTH);
    const displayDescription =
      revision.description.trim() !== '' ? revision.description.trim() : '(no description set)';

    const bookmarkText = buildBookmarkText(revision);
    const bookmarkSuffix = bookmarkText !== '' ? `  ${bookmarkText}` : '';

    const fullLabelText = `${nodePrefix}  ${shortChangeId}  ${displayDescription}${bookmarkSuffix}`;

    // Bold just the short change ID in the label.
    const idStart = nodePrefix.length + 2;
    const idEnd = idStart + SHORT_ID_LENGTH;

    super(
      { label: fullLabelText, highlights: [[idStart, idEnd]] } satisfies vscode.TreeItemLabel,
      vscode.TreeItemCollapsibleState.None,
    );

    this.revision = revision;

    // Stable identity so VSCode can preserve selection across refreshes.
    this.id = revision.changeId;

    // Faded secondary text: author name + relative age.
    this.description = `${revision.author.name}  ·  ${formatRelativeTime(revision.author.timestamp)}`;

    // Icon conveys state with color; the graph prefix conveys column position.
    const icon = iconPathFor(revision);
    if (icon !== undefined) {
      this.iconPath = icon;
    }

    // Pipe-separated flags for context-menu `when` clauses.
    this.contextValue = buildContextValue(revision);

    // Full details in the hover tooltip.
    this.tooltip = buildTooltip(revision);

    // Accessibility: provide a meaningful spoken label for screen readers.
    // The default tree item label contains graph characters that would be
    // read aloud verbatim; the accessibilityInformation label is cleaner.
    this.accessibilityInformation = {
      label: buildAccessibilityLabel(revision, shortChangeId),
    };
  }
}

/**
 * A "Load more..." item appended to the revision list when it is truncated.
 *
 * Clicking it fires `jjvs.revisions.loadMore` with the current limit so the
 * provider can increment it and trigger a fresh fetch.
 */
export class LoadMoreTreeItem extends vscode.TreeItem {
  constructor(readonly currentLimit: number) {
    super('Load more...', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('more');
    this.contextValue = 'loadMore';
    this.command = {
      command: 'jjvs.revisions.loadMore',
      title: 'Load More Revisions',
      arguments: [currentLimit],
    };
    this.accessibilityInformation = {
      label: `Load more revisions (currently showing ${currentLimit})`,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a ThemeIcon that conveys the revision's state.
 *
 * - Conflicted: warning icon in warning foreground color
 * - Working copy: arrow-right icon in active selection color
 * - Immutable: lock icon
 * - Normal mutable: no icon (tree item uses default)
 */
function iconPathFor(revision: Revision): vscode.ThemeIcon | undefined {
  if (revision.hasConflict) {
    return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
  }
  if (revision.isWorkingCopy) {
    return new vscode.ThemeIcon(
      'arrow-right',
      new vscode.ThemeColor('list.activeSelectionIconForeground'),
    );
  }
  if (revision.isImmutable) {
    return new vscode.ThemeIcon('lock');
  }
  return undefined;
}

/**
 * Builds the contextValue string for a revision tree item.
 *
 * Always starts with "revision". Additional pipe-separated flags are appended
 * for working copy, conflict, immutable, and divergent states.
 *
 * Example: `"revision|workingCopy|conflict"` for a conflicted working copy.
 *
 * Menu `when` clauses use regex matching: `viewItem =~ /^revision/` matches
 * any revision item; `viewItem =~ /workingCopy/` restricts to working-copy.
 */
function buildContextValue(revision: Revision): string {
  const flags: string[] = [REVISION_CONTEXT_BASE];
  if (revision.isWorkingCopy) flags.push('workingCopy');
  if (revision.hasConflict) flags.push('conflict');
  if (revision.isImmutable) flags.push('immutable');
  if (revision.isDivergent) flags.push('divergent');
  return flags.join('|');
}

/**
 * Builds a compact inline bookmark/tag string for display in the tree label.
 *
 * Format: `[main] [origin/main] [⚐ v1.0]`
 * Conflicted bookmarks are prefixed with `⚠ `.
 */
function buildBookmarkText(revision: Revision): string {
  const parts: string[] = [];
  for (const bm of revision.localBookmarks) {
    const prefix = bm.targets.length > 1 ? '⚠ ' : '';
    parts.push(`[${prefix}${bm.name}]`);
  }
  for (const bm of revision.remoteBookmarks) {
    // Show remote bookmarks that have a tracking relationship.
    if (bm.trackingTargets.length > 0) {
      parts.push(`[${bm.remote}/${bm.name}]`);
    }
  }
  for (const tag of revision.tags) {
    parts.push(`[⚐ ${tag.name}]`);
  }
  return parts.join(' ');
}

/**
 * Builds a MarkdownString hover tooltip with the full revision metadata.
 */
function buildTooltip(revision: Revision): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.supportHtml = false;

  const shortChangeId = revision.changeId.substring(0, SHORT_ID_LENGTH);
  const shortCommitId = revision.commitId.substring(0, SHORT_ID_LENGTH);

  if (revision.isWorkingCopy) md.appendMarkdown('**Working copy** (`@`)\n\n');
  if (revision.hasConflict) md.appendMarkdown('⚠ **Has unresolved conflicts**\n\n');
  if (revision.isImmutable) md.appendMarkdown('🔒 **Immutable** (cannot be rewritten)\n\n');
  if (revision.isDivergent)
    md.appendMarkdown('⚠ **Divergent** (multiple commits share this change ID)\n\n');

  md.appendMarkdown(`**Change ID**: \`${shortChangeId}\`\n\n`);
  md.appendMarkdown(`**Commit ID**: \`${shortCommitId}\`\n\n`);
  md.appendMarkdown(
    `**Author**: ${revision.author.name} <${revision.author.email}> · ${formatRelativeTime(revision.author.timestamp)}\n\n`,
  );

  const descriptionText = revision.description.trim();
  if (descriptionText !== '') {
    md.appendMarkdown(`**Description**:\n\n${descriptionText}\n\n`);
  } else {
    md.appendMarkdown(`**Description**: *(empty)*\n\n`);
  }

  const allBookmarks = [
    ...revision.localBookmarks.map((b) => b.name),
    ...revision.remoteBookmarks.map((b) => `${b.remote}/${b.name}`),
    ...revision.tags.map((t) => `⚐ ${t.name}`),
  ];
  if (allBookmarks.length > 0) {
    md.appendMarkdown(`**Bookmarks / Tags**: ${allBookmarks.join(', ')}\n\n`);
  }

  return md;
}

/**
 * Builds a clean spoken label for screen readers.
 *
 * The visual label embeds graph characters (○, │, @) that would be read
 * aloud verbatim and confusingly. This label uses plain English state words.
 */
function buildAccessibilityLabel(revision: Revision, shortChangeId: string): string {
  const state: string[] = [];
  if (revision.isWorkingCopy) state.push('working copy');
  if (revision.hasConflict) state.push('has conflicts');
  if (revision.isImmutable) state.push('immutable');
  if (revision.isDivergent) state.push('divergent');

  const statePrefix = state.length > 0 ? `${state.join(', ')} ` : '';
  const description =
    revision.description.trim() !== '' ? revision.description.trim() : 'no description';
  return `${statePrefix}revision ${shortChangeId}: ${description}`;
}

/**
 * Formats a `Date` as a human-readable relative time string.
 *
 * Examples: "5s ago", "3m ago", "2h ago", "4d ago", "2mo ago", "1y ago".
 */
export function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return `${diffSecs}s ago`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}
