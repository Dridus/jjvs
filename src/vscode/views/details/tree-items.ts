/**
 * Tree item classes for the jj revision details view (jjvs.details).
 *
 * The details view shows the files changed in the selected revision:
 * - `FileChangeTreeItem`: a single file change with status icon and click-to-diff.
 * - `LoadingTreeItem`: shown while file changes are being fetched.
 * - `EmptyTreeItem`: shown when no revision is selected or no files changed.
 *
 * Status icons follow VSCode's git decoration conventions so users see
 * familiar visual cues (A = green, M = orange, D = red, etc.).
 *
 * Clicking a `FileChangeTreeItem` executes `jjvs.details.openDiff`, which
 * opens the VSCode diff editor comparing the file at the parent revision
 * (left) vs the file at the selected revision (right).
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { FileChange, FileStatus, Revision } from '../../../core/types';

/**
 * Context value base for file change items. Used in `view/item/context` when clauses.
 *
 * Additional pipe-separated flags are appended:
 * - `|mutable` — the containing revision is not immutable (file-level ops are available)
 * - `|conflicted` — the file is in a conflicted state
 *
 * Example: `"fileChange|mutable"`, `"fileChange|mutable|conflicted"`, `"fileChange"`
 */
export const FILE_CHANGE_CONTEXT_BASE = 'fileChange';

// ─── FileChangeTreeItem ───────────────────────────────────────────────────────

/**
 * A tree item representing a single file changed in a revision.
 *
 * The label is the filename (basename), with the directory path shown as faded
 * secondary text. For renamed/copied files, the original path is included in
 * the tooltip.
 *
 * Clicking the item executes `jjvs.details.openDiff` to open a VSCode diff
 * editor for this file.
 */
export class FileChangeTreeItem extends vscode.TreeItem {
  /** The file change this item represents. */
  readonly fileChange: FileChange;
  /** The revision that contains this file change. */
  readonly revision: Revision;
  /** Absolute path to the repository root. */
  readonly rootPath: string;

  constructor(fileChange: FileChange, revision: Revision, rootPath: string) {
    const fileName = path.basename(fileChange.path);
    const dirPath = path.dirname(fileChange.path);

    super(
      { label: fileName, highlights: [] } satisfies vscode.TreeItemLabel,
      vscode.TreeItemCollapsibleState.None,
    );

    this.fileChange = fileChange;
    this.revision = revision;
    this.rootPath = rootPath;

    // Show the directory path as faded secondary text (omit '.' for root-level files).
    if (dirPath !== '.') {
      this.description = dirPath;
    }

    // For renamed/copied files, append the original name/path in the description.
    if (
      (fileChange.status === 'renamed' || fileChange.status === 'copied') &&
      fileChange.originalPath !== undefined
    ) {
      const originalName = path.basename(fileChange.originalPath);
      this.description =
        this.description !== undefined
          ? `${this.description}  ←  ${originalName}`
          : `←  ${originalName}`;
    }

    this.iconPath = iconForStatus(fileChange.status);
    this.contextValue = buildContextValue(fileChange, revision);
    this.tooltip = buildTooltip(fileChange);

    // Click to open diff.
    this.command = {
      command: 'jjvs.details.openDiff',
      title: 'Open Diff',
      arguments: [this],
    };

    this.accessibilityInformation = {
      label: buildAccessibilityLabel(fileChange),
    };
  }
}

// ─── LoadingTreeItem ──────────────────────────────────────────────────────────

/**
 * Placeholder shown in the details view while file changes are being fetched.
 */
export class LoadingTreeItem extends vscode.TreeItem {
  constructor() {
    super('Loading...', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('loading~spin');
    this.contextValue = 'loading';
    this.tooltip = 'Fetching file changes for the selected revision…';
    this.accessibilityInformation = { label: 'Loading file changes' };
  }
}

// ─── EmptyTreeItem ────────────────────────────────────────────────────────────

/**
 * Placeholder shown when no revision is selected or the revision has no files.
 */
export class EmptyTreeItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
    this.contextValue = 'empty';
    this.tooltip = message;
    this.accessibilityInformation = { label: message };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a ThemeIcon with the color convention matching VSCode's git
 * file decorations, so the details view looks visually consistent with
 * the SCM view and Explorer file badges.
 */
function iconForStatus(status: FileStatus): vscode.ThemeIcon {
  switch (status) {
    case 'added':
      return new vscode.ThemeIcon(
        'diff-added',
        new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
      );
    case 'modified':
      return new vscode.ThemeIcon(
        'diff-modified',
        new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'),
      );
    case 'deleted':
      return new vscode.ThemeIcon(
        'diff-removed',
        new vscode.ThemeColor('gitDecoration.deletedResourceForeground'),
      );
    case 'renamed':
      return new vscode.ThemeIcon(
        'diff-renamed',
        new vscode.ThemeColor('gitDecoration.renamedResourceForeground'),
      );
    case 'copied':
      // jj supports copy tracking; use the added color since a copy is a new file.
      return new vscode.ThemeIcon(
        'copy',
        new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
      );
    case 'conflicted':
      return new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
  }
}

/**
 * Builds a `contextValue` string for a file change item.
 *
 * Always starts with `"fileChange"`. Additional pipe-separated flags are
 * appended so `view/item/context` when-clauses can target specific states:
 * - `mutable`: the containing revision is not immutable (enables file-level operations)
 * - `conflicted`: the file is in a conflict state
 */
function buildContextValue(fileChange: FileChange, revision: Revision): string {
  const parts: string[] = [FILE_CHANGE_CONTEXT_BASE];
  if (!revision.isImmutable) parts.push('mutable');
  if (fileChange.status === 'conflicted') parts.push('conflicted');
  return parts.join('|');
}

/**
 * Builds a hover tooltip with the file path and status details.
 */
function buildTooltip(fileChange: FileChange): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = false;
  md.supportHtml = false;

  const statusLabel = capitalizeStatus(fileChange.status);
  md.appendMarkdown(`**${statusLabel}**: \`${fileChange.path}\``);

  if (
    fileChange.originalPath !== undefined &&
    (fileChange.status === 'renamed' || fileChange.status === 'copied')
  ) {
    const verb = fileChange.status === 'renamed' ? 'Renamed from' : 'Copied from';
    md.appendMarkdown(`\n\n${verb}: \`${fileChange.originalPath}\``);
  }

  return md;
}

/**
 * Builds a clean spoken label for screen readers.
 *
 * Uses the full path (not just the basename) so screen reader users get
 * complete context without having to navigate to the description field.
 */
function buildAccessibilityLabel(fileChange: FileChange): string {
  const statusLabel = capitalizeStatus(fileChange.status);
  if (
    fileChange.originalPath !== undefined &&
    (fileChange.status === 'renamed' || fileChange.status === 'copied')
  ) {
    const verb = fileChange.status === 'renamed' ? 'renamed from' : 'copied from';
    return `${statusLabel}: ${fileChange.path}, ${verb} ${fileChange.originalPath}`;
  }
  return `${statusLabel}: ${fileChange.path}`;
}

/** Capitalise the first character of a `FileStatus` for display. */
function capitalizeStatus(status: FileStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
