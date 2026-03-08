/**
 * File-level command implementations for Phase 12b.
 *
 * Commands operate on individual files within a revision, invoked from the
 * context menu of the Jujutsu Details view (jjvs.details).
 *
 * Commands: restoreFile, squashFile, splitFile, showFileHistory.
 *
 * Each command accepts a `FileChangeTreeItem` as its first argument when
 * invoked from the context menu. When invoked from the Command Palette
 * (no argument), it falls back to the current details tree selection.
 *
 * ## Why these are separate from revision-commands.ts
 *
 * These commands operate at the file level rather than the revision level
 * and are tightly coupled to the Details view's tree selection and item types.
 * Keeping them in a separate module keeps revision-commands.ts focused on
 * revision-granularity operations.
 */

import * as vscode from 'vscode';
import type { FileChangeTreeItem } from '../views/details/tree-items';
import type { DetailsTreeItem } from '../views/details/tree-provider';
import type { RevisionCommandContext } from './revision-commands';

// ─── jjvs.details.restoreFile ─────────────────────────────────────────────────

/**
 * Register `jjvs.details.restoreFile`.
 *
 * Restores a single file in a revision to its state in the revision's parent,
 * discarding changes to that file only. This is equivalent to running
 * `jj restore --into <changeId> -- <filePath>`.
 *
 * For the working copy (`@`), the `--into` flag is omitted (jj defaults to `@`).
 *
 * Requires confirmation since restore discards file changes.
 */
export function registerRestoreFileCommand(
  getContext: () => RevisionCommandContext | undefined,
  detailsTreeView: vscode.TreeView<DetailsTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'jjvs.details.restoreFile',
    async (item?: FileChangeTreeItem) => {
      const ctx = getContext();
      if (ctx === undefined) return;

      const fileItem = resolveFileItem(item, detailsTreeView);
      if (fileItem === undefined) {
        void vscode.window.showWarningMessage('Jujutsu: Select a file in the Details view first.');
        return;
      }

      const { fileChange, revision } = fileItem;
      const shortId = revision.changeId.substring(0, 12);
      const fileName = fileChange.path.split('/').pop() ?? fileChange.path;

      const confirm = await vscode.window.showWarningMessage(
        `Restore '${fileName}' in ${shortId} to its parent state? This discards changes to this file.`,
        { modal: true },
        'Restore File',
      );
      if (confirm !== 'Restore File') return;

      await ctx.service.run({ title: 'Restore File' }, (signal) =>
        ctx.cli.restore({
          // Omit changeId for the working copy — jj defaults to @ when --into is absent.
          ...(revision.isWorkingCopy ? {} : { changeId: revision.changeId }),
          paths: [fileChange.path],
          signal,
        }),
      );
    },
  );
}

// ─── jjvs.details.squashFile ──────────────────────────────────────────────────

/**
 * Register `jjvs.details.squashFile`.
 *
 * Squashes a single file from a revision into its direct parent, removing
 * that file's changes from the source revision and merging them into the parent.
 * This is equivalent to `jj squash -r <changeId> -- <filePath>`.
 *
 * Only the selected file is squashed; other files in the source revision remain.
 * Requires confirmation before proceeding.
 */
export function registerSquashFileCommand(
  getContext: () => RevisionCommandContext | undefined,
  detailsTreeView: vscode.TreeView<DetailsTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'jjvs.details.squashFile',
    async (item?: FileChangeTreeItem) => {
      const ctx = getContext();
      if (ctx === undefined) return;

      const fileItem = resolveFileItem(item, detailsTreeView);
      if (fileItem === undefined) {
        void vscode.window.showWarningMessage('Jujutsu: Select a file in the Details view first.');
        return;
      }

      const { fileChange, revision } = fileItem;
      const shortId = revision.changeId.substring(0, 12);
      const fileName = fileChange.path.split('/').pop() ?? fileChange.path;

      const confirm = await vscode.window.showWarningMessage(
        `Squash '${fileName}' from ${shortId} into its parent? The file's changes will be merged into the parent revision.`,
        { modal: true },
        'Squash File',
      );
      if (confirm !== 'Squash File') return;

      await ctx.service.run({ title: 'Squash File' }, (signal) =>
        ctx.cli.squash({
          changeId: revision.changeId,
          paths: [fileChange.path],
          signal,
        }),
      );
    },
  );
}

// ─── jjvs.details.splitFile ───────────────────────────────────────────────────

/**
 * Register `jjvs.details.splitFile`.
 *
 * Splits a single file out of a revision into a new separate revision. The
 * selected file goes into the first (new) revision; all other files in the
 * source revision remain in the second revision.
 *
 * This is equivalent to `jj split -r <changeId> -- <filePath>`.
 *
 * The user is prompted for an optional description for the new first revision.
 */
export function registerSplitFileCommand(
  getContext: () => RevisionCommandContext | undefined,
  detailsTreeView: vscode.TreeView<DetailsTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'jjvs.details.splitFile',
    async (item?: FileChangeTreeItem) => {
      const ctx = getContext();
      if (ctx === undefined) return;

      const fileItem = resolveFileItem(item, detailsTreeView);
      if (fileItem === undefined) {
        void vscode.window.showWarningMessage('Jujutsu: Select a file in the Details view first.');
        return;
      }

      const { fileChange, revision } = fileItem;
      const shortId = revision.changeId.substring(0, 12);
      const fileName = fileChange.path.split('/').pop() ?? fileChange.path;

      // Prompt for an optional description for the first (split-out) revision.
      const firstDescription = await vscode.window.showInputBox({
        title: `Split '${fileName}' from ${shortId}`,
        prompt: `Enter a description for the new revision containing '${fileName}' (optional)`,
        placeHolder: '(press Enter to leave empty, Escape to cancel)',
        ignoreFocusOut: true,
      });

      if (firstDescription === undefined) return;

      await ctx.service.run({ title: 'Split File', showProgress: true }, (signal) =>
        ctx.cli.split({
          changeId: revision.changeId,
          paths: [fileChange.path],
          ...(firstDescription.trim() !== ''
            ? { firstDescription: firstDescription.trim() }
            : {}),
          signal,
        }),
      );
    },
  );
}

// ─── jjvs.details.showFileHistory ────────────────────────────────────────────

/**
 * Register `jjvs.details.showFileHistory`.
 *
 * Filters the Revisions view to show only revisions that modified the selected
 * file. Uses the `file("<path>")` revset function, which lists all revisions
 * that touched the given path.
 *
 * After applying the filter, jjvs navigates to the Revisions view so the user
 * can immediately see the file's history.
 *
 * @param applyRevsetFilter - Callback that sets the revset filter expression
 *   in the Revisions tree provider and updates the view description.
 */
export function registerShowFileHistoryCommand(
  getContext: () => RevisionCommandContext | undefined,
  detailsTreeView: vscode.TreeView<DetailsTreeItem>,
  applyRevsetFilter: (revset: string) => void,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'jjvs.details.showFileHistory',
    async (item?: FileChangeTreeItem) => {
      const ctx = getContext();
      if (ctx === undefined) return;

      const fileItem = resolveFileItem(item, detailsTreeView);
      if (fileItem === undefined) {
        void vscode.window.showWarningMessage('Jujutsu: Select a file in the Details view first.');
        return;
      }

      const { fileChange } = fileItem;

      // Escape the path for use in a revset expression.
      // jj revset strings use double-quote delimiters; escape embedded quotes and backslashes.
      const escapedPath = fileChange.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const revset = `file("${escapedPath}")`;

      applyRevsetFilter(revset);

      // Navigate to the Revisions view so the user sees the filtered history immediately.
      await vscode.commands.executeCommand('workbench.view.extension.jjvs');

      void vscode.window.showInformationMessage(
        `Revisions filtered to: ${revset}. Use "Filter by Revset..." to change or clear the filter.`,
      );
    },
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Resolves the target `FileChangeTreeItem` for a file-level command.
 *
 * Returns the `item` argument if it is a valid `FileChangeTreeItem` (context
 * menu invocation), otherwise falls back to the current tree selection
 * (Command Palette invocation).
 */
function resolveFileItem(
  item: FileChangeTreeItem | undefined,
  treeView: vscode.TreeView<DetailsTreeItem>,
): FileChangeTreeItem | undefined {
  if (item !== undefined && 'fileChange' in item && item.fileChange !== undefined) {
    return item;
  }
  // Fallback: use the current selection in the details tree.
  const selected = treeView.selection[0];
  if (selected !== undefined && 'fileChange' in selected && selected.fileChange !== undefined) {
    return selected as FileChangeTreeItem;
  }
  return undefined;
}
