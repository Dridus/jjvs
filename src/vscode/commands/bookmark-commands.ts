/**
 * Bookmark command implementations.
 *
 * Commands: bookmark.create, bookmark.move, bookmark.delete,
 *           bookmark.forget, bookmark.track, bookmark.untrack.
 *
 * Each command follows the same pattern as revision commands:
 *   1. Resolve context (service + CLI + repository) via `getContext()`.
 *   2. Resolve the target bookmark from tree selection or a QuickPick.
 *   3. Gather any additional inputs (name, target revision, confirmation).
 *   4. Run the jj CLI operation through `CommandService.run()`.
 *
 * `track` and `untrack` are typically invoked from the bookmarks tree context
 * menu (the selected tree item provides name and remote). `create`, `move`,
 * `delete`, and `forget` also fall back to pickers when invoked from the
 * command palette with no tree selection.
 */

import * as vscode from 'vscode';
import type { RevisionCommandContext } from './revision-commands';
import { pickRevision } from '../pickers/revision-picker';
import {
  LocalBookmarkTreeItem,
  RemoteBookmarkTreeItem,
  type BookmarkTreeItem,
} from '../views/bookmarks/tree-items';

// ─── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Show a QuickPick of local bookmark names derived from the current revision list.
 *
 * @returns The selected bookmark name, or `undefined` if cancelled or no bookmarks exist.
 */
async function pickLocalBookmarkName(
  context: RevisionCommandContext,
  options: { readonly title: string; readonly placeholder?: string },
): Promise<string | undefined> {
  const names = [
    ...new Set(context.repository.revisions.flatMap((r) => r.localBookmarks.map((b) => b.name))),
  ].sort((a, b) => a.localeCompare(b));

  if (names.length === 0) {
    void vscode.window.showWarningMessage('Jujutsu: No local bookmarks found.');
    return undefined;
  }

  const items: vscode.QuickPickItem[] = names.map((name) => ({ label: name }));

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = options.title;
  quickPick.placeholder = options.placeholder ?? 'Type to filter bookmarks';
  quickPick.items = items;

  const result = await new Promise<string | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      const chosen = quickPick.activeItems[0];
      resolve(chosen?.label);
      quickPick.hide();
    });
    quickPick.onDidHide(() => resolve(undefined));
    quickPick.show();
  });

  quickPick.dispose();
  return result;
}

/**
 * Returns the `LocalBookmarkTreeItem` or `RemoteBookmarkTreeItem` from the
 * currently selected bookmark tree item, or `undefined` if nothing is selected
 * or the selection is a section header.
 */
function getBookmarkTreeSelection(
  treeView: vscode.TreeView<BookmarkTreeItem>,
): LocalBookmarkTreeItem | RemoteBookmarkTreeItem | undefined {
  const selected = treeView.selection[0];
  if (selected instanceof LocalBookmarkTreeItem || selected instanceof RemoteBookmarkTreeItem) {
    return selected;
  }
  return undefined;
}

// ─── jjvs.bookmark.create ─────────────────────────────────────────────────────

/**
 * Register `jjvs.bookmark.create`.
 *
 * Creates a new local bookmark at a chosen revision.
 *
 * Flow:
 *   1. Prompt for bookmark name (InputBox).
 *   2. Pick a target revision (revision picker). Defaults to working copy (`@`)
 *      if the user accepts the pre-selected item.
 *   3. Run `jj bookmark create <name> -r <changeId>`.
 */
export function registerBookmarkCreateCommand(
  getContext: () => RevisionCommandContext | undefined,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.bookmark.create', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const name = await vscode.window.showInputBox({
      title: 'Create Bookmark',
      prompt: 'Enter a name for the new bookmark.',
      placeHolder: 'bookmark-name (press Escape to cancel)',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (value.trim() === '') return 'Bookmark name cannot be empty.';
        if (/\s/.test(value)) return 'Bookmark name cannot contain spaces.';
        return undefined;
      },
    });

    if (name === undefined) return;

    // Pick a target revision; default active item is the working copy.
    const workingCopy = ctx.repository.revisions.find((r) => r.isWorkingCopy);
    const targetRevision = await pickRevision(ctx.repository.revisions, {
      title: 'Create Bookmark: Select Target Revision',
      placeholder: 'Select the revision to attach the bookmark to',
      // exactOptionalPropertyTypes: only pass activeChangeId when defined.
      ...(workingCopy !== undefined ? { activeChangeId: workingCopy.changeId } : {}),
    });

    if (targetRevision === undefined) return;

    await ctx.service.run({ title: `Create bookmark ${name}` }, (signal) =>
      ctx.cli.bookmarkCreate(name, targetRevision.changeId, signal),
    );
  });
}

// ─── jjvs.bookmark.move ───────────────────────────────────────────────────────

/**
 * Register `jjvs.bookmark.move`.
 *
 * Moves a local bookmark to a different revision.
 *
 * Flow:
 *   1. Resolve the bookmark name from the tree selection or a local bookmark picker.
 *   2. Pick a target revision.
 *   3. Run `jj bookmark move <name> --to <changeId>`.
 */
export function registerBookmarkMoveCommand(
  getContext: () => RevisionCommandContext | undefined,
  bookmarkTreeView: vscode.TreeView<BookmarkTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.bookmark.move', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    // Use tree selection if it's a local bookmark; otherwise prompt.
    let bookmarkName: string | undefined;
    const selected = getBookmarkTreeSelection(bookmarkTreeView);
    if (selected instanceof LocalBookmarkTreeItem) {
      bookmarkName = selected.bookmark.name;
    } else {
      bookmarkName = await pickLocalBookmarkName(ctx, {
        title: 'Move Bookmark: Select Bookmark',
        placeholder: 'Select the local bookmark to move',
      });
    }

    if (bookmarkName === undefined) return;

    const targetRevision = await pickRevision(ctx.repository.revisions, {
      title: `Move Bookmark: Select Target for "${bookmarkName}"`,
      placeholder: 'Select the revision to move the bookmark to',
    });

    if (targetRevision === undefined) return;

    await ctx.service.run({ title: `Move bookmark ${bookmarkName}` }, (signal) =>
      ctx.cli.bookmarkMove({
        name: bookmarkName,
        revset: targetRevision.changeId,
        signal,
      }),
    );
  });
}

// ─── jjvs.bookmark.delete ─────────────────────────────────────────────────────

/**
 * Register `jjvs.bookmark.delete`.
 *
 * Deletes a local bookmark. When the extension next pushes to a remote, this
 * bookmark will be deleted on the remote as well (unlike `forget`).
 *
 * Requires confirmation before proceeding.
 */
export function registerBookmarkDeleteCommand(
  getContext: () => RevisionCommandContext | undefined,
  bookmarkTreeView: vscode.TreeView<BookmarkTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.bookmark.delete', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    let bookmarkName: string | undefined;
    const selected = getBookmarkTreeSelection(bookmarkTreeView);
    if (selected instanceof LocalBookmarkTreeItem) {
      bookmarkName = selected.bookmark.name;
    } else {
      bookmarkName = await pickLocalBookmarkName(ctx, {
        title: 'Delete Bookmark',
        placeholder: 'Select the local bookmark to delete',
      });
    }

    if (bookmarkName === undefined) return;

    const choice = await vscode.window.showWarningMessage(
      `Delete bookmark "${bookmarkName}"? The bookmark will be removed locally. ` +
        `If pushed to a remote, it will be deleted there too.`,
      { modal: true },
      'Delete',
    );
    if (choice !== 'Delete') return;

    const name = bookmarkName;
    await ctx.service.run({ title: `Delete bookmark ${name}` }, (signal) =>
      ctx.cli.bookmarkDelete([name], signal),
    );
  });
}

// ─── jjvs.bookmark.forget ─────────────────────────────────────────────────────

/**
 * Register `jjvs.bookmark.forget`.
 *
 * Forgets a local bookmark — removes the local tracking reference without
 * deleting the bookmark on the remote. Use this when you want to stop
 * tracking a remote bookmark without affecting it on the server.
 *
 * Equivalent to: `jj bookmark forget <name>`
 */
export function registerBookmarkForgetCommand(
  getContext: () => RevisionCommandContext | undefined,
  bookmarkTreeView: vscode.TreeView<BookmarkTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.bookmark.forget', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    let bookmarkName: string | undefined;
    const selected = getBookmarkTreeSelection(bookmarkTreeView);
    if (selected instanceof LocalBookmarkTreeItem) {
      bookmarkName = selected.bookmark.name;
    } else {
      bookmarkName = await pickLocalBookmarkName(ctx, {
        title: 'Forget Bookmark',
        placeholder: 'Select the local bookmark to forget',
      });
    }

    if (bookmarkName === undefined) return;

    const choice = await vscode.window.showWarningMessage(
      `Forget bookmark "${bookmarkName}"? The local reference will be removed. ` +
        `The bookmark on the remote is not affected.`,
      { modal: true },
      'Forget',
    );
    if (choice !== 'Forget') return;

    const name = bookmarkName;
    await ctx.service.run({ title: `Forget bookmark ${name}` }, (signal) =>
      ctx.cli.bookmarkForget([name], signal),
    );
  });
}

// ─── jjvs.bookmark.track ──────────────────────────────────────────────────────

/**
 * Register `jjvs.bookmark.track`.
 *
 * Starts tracking a remote bookmark locally. After tracking, `jj git fetch`
 * will update the local tracking reference when the remote bookmark moves.
 *
 * Primarily invoked from the remote bookmark context menu. Falls back to
 * asking for bookmark name and remote when invoked from the command palette.
 *
 * Equivalent to: `jj bookmark track <name>@<remote>`
 */
export function registerBookmarkTrackCommand(
  getContext: () => RevisionCommandContext | undefined,
  bookmarkTreeView: vscode.TreeView<BookmarkTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.bookmark.track', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const selected = getBookmarkTreeSelection(bookmarkTreeView);

    let bookmarkName: string | undefined;
    let remote: string | undefined;

    if (selected instanceof RemoteBookmarkTreeItem) {
      bookmarkName = selected.bookmark.name;
      remote = selected.bookmark.remote;
    } else {
      // Collect untracked remote bookmarks from revision list
      const untrackedRemotes = ctx.repository.revisions
        .flatMap((r) => r.remoteBookmarks)
        .filter((b) => b.trackingTargets.length === 0);

      if (untrackedRemotes.length === 0) {
        void vscode.window.showInformationMessage(
          'Jujutsu: No untracked remote bookmarks to track.',
        );
        return;
      }

      const items: vscode.QuickPickItem[] = untrackedRemotes
        .sort((a, b) => {
          const nameComparison = a.name.localeCompare(b.name);
          return nameComparison !== 0 ? nameComparison : a.remote.localeCompare(b.remote);
        })
        .map((b) => ({
          label: `${b.name}@${b.remote}`,
          description: b.targets[0]?.substring(0, 12) ?? '(empty)',
        }));

      const quickPick = vscode.window.createQuickPick();
      quickPick.title = 'Track Remote Bookmark';
      quickPick.placeholder = 'Select a remote bookmark to track';
      quickPick.items = items;

      const result = await new Promise<string | undefined>((resolve) => {
        quickPick.onDidAccept(() => {
          resolve(quickPick.activeItems[0]?.label);
          quickPick.hide();
        });
        quickPick.onDidHide(() => resolve(undefined));
        quickPick.show();
      });
      quickPick.dispose();

      if (result === undefined) return;
      const atIndex = result.lastIndexOf('@');
      bookmarkName = result.substring(0, atIndex);
      remote = result.substring(atIndex + 1);
    }

    if (bookmarkName === undefined || remote === undefined) return;

    const name = bookmarkName;
    const remoteName = remote;
    await ctx.service.run({ title: `Track ${name}@${remoteName}` }, (signal) =>
      ctx.cli.bookmarkTrack(name, remoteName, signal),
    );
  });
}

// ─── jjvs.bookmark.untrack ────────────────────────────────────────────────────

/**
 * Register `jjvs.bookmark.untrack`.
 *
 * Stops tracking a remote bookmark. The remote bookmark remains on the remote;
 * the local tracking reference is removed.
 *
 * Equivalent to: `jj bookmark untrack <name>@<remote>`
 */
export function registerBookmarkUntrackCommand(
  getContext: () => RevisionCommandContext | undefined,
  bookmarkTreeView: vscode.TreeView<BookmarkTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.bookmark.untrack', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const selected = getBookmarkTreeSelection(bookmarkTreeView);

    let bookmarkName: string | undefined;
    let remote: string | undefined;

    if (selected instanceof RemoteBookmarkTreeItem) {
      bookmarkName = selected.bookmark.name;
      remote = selected.bookmark.remote;
    } else {
      // Collect tracked remote bookmarks from revision list
      const trackedRemotes = ctx.repository.revisions
        .flatMap((r) => r.remoteBookmarks)
        .filter((b) => b.trackingTargets.length > 0);

      if (trackedRemotes.length === 0) {
        void vscode.window.showInformationMessage('Jujutsu: No tracked remote bookmarks found.');
        return;
      }

      const items: vscode.QuickPickItem[] = trackedRemotes
        .sort((a, b) => {
          const nameComparison = a.name.localeCompare(b.name);
          return nameComparison !== 0 ? nameComparison : a.remote.localeCompare(b.remote);
        })
        .map((b) => ({
          label: `${b.name}@${b.remote}`,
          description: b.targets[0]?.substring(0, 12) ?? '(empty)',
        }));

      const quickPick = vscode.window.createQuickPick();
      quickPick.title = 'Untrack Remote Bookmark';
      quickPick.placeholder = 'Select a tracked remote bookmark to untrack';
      quickPick.items = items;

      const result = await new Promise<string | undefined>((resolve) => {
        quickPick.onDidAccept(() => {
          resolve(quickPick.activeItems[0]?.label);
          quickPick.hide();
        });
        quickPick.onDidHide(() => resolve(undefined));
        quickPick.show();
      });
      quickPick.dispose();

      if (result === undefined) return;
      const atIndex = result.lastIndexOf('@');
      bookmarkName = result.substring(0, atIndex);
      remote = result.substring(atIndex + 1);
    }

    if (bookmarkName === undefined || remote === undefined) return;

    const name = bookmarkName;
    const remoteName = remote;
    await ctx.service.run({ title: `Untrack ${name}@${remoteName}` }, (signal) =>
      ctx.cli.bookmarkUntrack(name, remoteName, signal),
    );
  });
}
