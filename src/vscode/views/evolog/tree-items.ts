/**
 * Tree item classes for the jj evolution log view (jjvs.evolog).
 *
 * The evolution log shows all past snapshots of the currently selected
 * revision's change ID — i.e., every commit that has ever been recorded
 * under that change ID. This reflects how the revision evolved over time
 * through amendments, rebases, and other operations.
 *
 * - `EvologTreeItem`: one snapshot (commit) in the evolution history.
 * - `EvologLoadingTreeItem`: shown while entries are being fetched.
 * - `EvologEmptyTreeItem`: shown when no revision is selected or the
 *   evolog is empty.
 */

import * as vscode from 'vscode';
import type { Revision } from '../../../core/types';
import { formatRelativeTime } from '../revisions/tree-items';

/** Number of commit ID characters to show in the tree label. */
const SHORT_COMMIT_ID_LENGTH = 12;

// ─── EvologTreeItem ───────────────────────────────────────────────────────────

/**
 * A tree item representing a single snapshot in the evolution log.
 *
 * Each snapshot corresponds to a distinct commit under the same change ID.
 * Snapshots are listed newest-first (index 0 = current state of the revision).
 *
 * The label shows the short commit ID (bolded) followed by the first line of
 * the description at the time of that snapshot. The secondary description
 * shows the relative timestamp of the committer (when the snapshot was created).
 */
export class EvologTreeItem extends vscode.TreeItem {
  /** The revision (snapshot) this item represents. */
  readonly revision: Revision;

  constructor(revision: Revision, index: number, total: number) {
    const firstLine = revision.description.trim().split('\n')[0] || '(no description)';
    const shortCommitId = revision.commitId.substring(0, SHORT_COMMIT_ID_LENGTH);

    super(
      {
        label: `${shortCommitId}  ${firstLine}`,
        highlights: [[0, SHORT_COMMIT_ID_LENGTH]],
      } satisfies vscode.TreeItemLabel,
      vscode.TreeItemCollapsibleState.None,
    );

    this.revision = revision;

    // committer.timestamp reflects when this particular snapshot was written,
    // which is what users care about when reading an evolution log.
    this.description = formatRelativeTime(revision.committer.timestamp);

    // The most recent entry (index 0) uses a filled circle; older entries use
    // an outline so users can quickly identify the "current" snapshot.
    this.iconPath =
      index === 0
        ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.blue'))
        : new vscode.ThemeIcon('circle-outline');

    this.contextValue = 'evologEntry';
    this.tooltip = buildTooltip(revision, index, total);
    this.accessibilityInformation = {
      label: buildAccessibilityLabel(firstLine, index, total, revision),
    };
  }
}

// ─── EvologLoadingTreeItem ────────────────────────────────────────────────────

/** Placeholder shown while evolution log entries are being fetched. */
export class EvologLoadingTreeItem extends vscode.TreeItem {
  constructor() {
    super('Loading...', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('loading~spin');
    this.contextValue = 'loading';
    this.tooltip = 'Fetching evolution log for the selected revision…';
    this.accessibilityInformation = { label: 'Loading evolution log' };
  }
}

// ─── EvologEmptyTreeItem ──────────────────────────────────────────────────────

/** Placeholder shown when no revision is selected or the evolog is empty. */
export class EvologEmptyTreeItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
    this.contextValue = 'empty';
    this.tooltip = message;
    this.accessibilityInformation = { label: message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Builds a hover tooltip with snapshot metadata. */
function buildTooltip(revision: Revision, index: number, total: number): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.supportHtml = false;

  const shortCommitId = revision.commitId.substring(0, SHORT_COMMIT_ID_LENGTH);

  md.appendMarkdown(
    `**Snapshot ${index + 1} of ${total}**${index === 0 ? ' _(current)_' : ''}\n\n`,
  );
  md.appendMarkdown(`**Commit ID**: \`${shortCommitId}\`\n\n`);
  md.appendMarkdown(
    `**Committed**: ${revision.committer.name} · ${formatRelativeTime(revision.committer.timestamp)}\n\n`,
  );
  md.appendMarkdown(
    `**Authored**: ${revision.author.name} · ${formatRelativeTime(revision.author.timestamp)}\n\n`,
  );

  const descriptionText = revision.description.trim();
  if (descriptionText !== '') {
    md.appendMarkdown(`**Description**:\n\n${descriptionText}\n\n`);
  } else {
    md.appendMarkdown(`**Description**: *(empty)*\n\n`);
  }

  return md;
}

/** Builds a spoken label for screen readers. */
function buildAccessibilityLabel(
  firstLine: string,
  index: number,
  total: number,
  revision: Revision,
): string {
  const age = formatRelativeTime(revision.committer.timestamp);
  const current = index === 0 ? ', current' : '';
  return `Snapshot ${index + 1} of ${total}${current}: ${firstLine}, ${age}`;
}
