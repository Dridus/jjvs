/**
 * SCM resource state mapping for jj working copy changes.
 *
 * Maps jj `FileChange` objects to VSCode `SourceControlResourceState` instances
 * with appropriate decorations (icons, tooltips, strikethrough) for each file status.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { FileChange, FileStatus } from '../../core/types';

/**
 * Returns VSCode SCM resource decorations for a given jj file status.
 * Uses VS Code's built-in diff icons for visual consistency with other SCM providers.
 */
function fileStatusDecorations(status: FileStatus): vscode.SourceControlResourceDecorations {
  switch (status) {
    case 'added':
      return {
        iconPath: new vscode.ThemeIcon('diff-added'),
        tooltip: 'Added',
      };
    case 'modified':
      return {
        iconPath: new vscode.ThemeIcon('diff-modified'),
        tooltip: 'Modified',
      };
    case 'deleted':
      return {
        iconPath: new vscode.ThemeIcon('diff-removed'),
        tooltip: 'Deleted',
        strikeThrough: true,
        faded: true,
      };
    case 'renamed':
      return {
        iconPath: new vscode.ThemeIcon('diff-renamed'),
        tooltip: 'Renamed',
      };
    case 'copied':
      return {
        iconPath: new vscode.ThemeIcon('diff-added'),
        tooltip: 'Copied',
      };
    case 'conflicted':
      return {
        iconPath: new vscode.ThemeIcon('warning'),
        tooltip: 'Conflicted',
      };
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return {};
    }
  }
}

/**
 * Convert a `FileChange` from `jj status` output to a VSCode
 * `SourceControlResourceState` suitable for display in the SCM panel.
 *
 * The `resourceUri` points to the file in the working tree so that VSCode
 * can open the file when the user clicks on it. Diff-on-click will be wired
 * to a `QuickDiffProvider` command in Phase 5b and Phase 7.
 */
export function fileChangeToResourceState(
  rootPath: string,
  change: FileChange,
): vscode.SourceControlResourceState {
  const absolutePath = path.join(rootPath, change.path);
  const resourceUri = vscode.Uri.file(absolutePath);
  return {
    resourceUri,
    decorations: fileStatusDecorations(change.status),
    // contextValue drives when-clause conditions in package.json menus.
    // Phase 7 adds context menu commands gated on this value (e.g., "restore file").
    contextValue: change.status,
  };
}
