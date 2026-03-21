/**
 * SCM resource state mapping for jj working copy changes.
 *
 * Maps jj `FileChange` objects to VSCode `SourceControlResourceState` instances
 * with appropriate decorations (icons, tooltips, strikethrough) for each file status.
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import type { FileChange, FileStatus } from '../../core/types';

// Icons and icon lookup copied from the vscode git extension
// See license in resources/icons/LICENSE-git-extension.txt

/** Base path where icons are located in the extension repository */
const iconsRootPath = path.join(path.dirname(__dirname), 'resources', 'icons');

/** Get the path to a specific icon by name and color mode */
function getIconUri(iconName: string, theme: string): vscode.Uri {
  return vscode.Uri.file(path.join(iconsRootPath, theme, `${iconName}.svg`));
}

/** Icons for each file status in the changes view, organized by color mode and kind */
const statusIcons = {
  light: {
    modified: getIconUri('status-modified', 'light'),
    added: getIconUri('status-added', 'light'),
    deleted: getIconUri('status-deleted', 'light'),
    renamed: getIconUri('status-renamed', 'light'),
    copied: getIconUri('status-copied', 'light'),
    untracked: getIconUri('status-untracked', 'light'),
    ignored: getIconUri('status-ignored', 'light'),
    conflict: getIconUri('status-conflict', 'light'),
    typeChanged: getIconUri('status-type-changed', 'light'),
  },
  dark: {
    modified: getIconUri('status-modified', 'dark'),
    added: getIconUri('status-added', 'dark'),
    deleted: getIconUri('status-deleted', 'dark'),
    renamed: getIconUri('status-renamed', 'dark'),
    copied: getIconUri('status-copied', 'dark'),
    untracked: getIconUri('status-untracked', 'dark'),
    ignored: getIconUri('status-ignored', 'dark'),
    conflict: getIconUri('status-conflict', 'dark'),
    typeChanged: getIconUri('status-type-changed', 'dark'),
  },
};

/**
 * Returns VSCode SCM resource decorations for a given jj file status.
 * Uses VS Code's built-in diff icons for visual consistency with other SCM providers.
 */
function fileStatusDecorations(status: FileStatus): vscode.SourceControlResourceDecorations {
  switch (status) {
    case 'added':
      return {
        dark: { iconPath: statusIcons.dark.added },
        light: { iconPath: statusIcons.light.added },
        tooltip: 'Added',
      };
    case 'modified':
      return {
        dark: { iconPath: statusIcons.dark.modified },
        light: { iconPath: statusIcons.light.modified },
        tooltip: 'Modified',
      };
    case 'deleted':
      return {
        dark: { iconPath: statusIcons.dark.deleted },
        light: { iconPath: statusIcons.light.deleted },
        tooltip: 'Deleted',
        strikeThrough: true,
        faded: true,
      };
    case 'renamed':
      return {
        dark: { iconPath: statusIcons.dark.renamed },
        light: { iconPath: statusIcons.light.renamed },
        tooltip: 'Renamed',
      };
    case 'copied':
      return {
        dark: { iconPath: statusIcons.dark.copied },
        light: { iconPath: statusIcons.light.copied },
        tooltip: 'Copied',
      };
    case 'conflicted':
      return {
        dark: { iconPath: statusIcons.dark.conflict },
        light: { iconPath: statusIcons.light.conflict },
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
 * can open the file when the user clicks on it. Diff-on-click is wired to
 * the `JjQuickDiffProvider`.
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
    // contextValue drives when-clause conditions in package.json menus
    // (e.g., "restore file" is gated on this value).
    contextValue: change.status,
  };
}
