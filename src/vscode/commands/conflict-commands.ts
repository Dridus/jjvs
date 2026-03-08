/**
 * Conflict command implementations.
 *
 * Commands: `jjvs.conflict.resolve`
 *
 * ## Why a terminal instead of CommandService
 *
 * `jj resolve` launches an interactive merge tool (e.g., vimdiff, meld,
 * IntelliJ's merge editor). These tools require an interactive TTY or open a
 * GUI window directly; they cannot be driven via stdio the way non-interactive
 * commands can. Running `jj resolve` through `CommandService`/`JjRunner` would
 * either hang waiting for input or produce garbled output.
 *
 * The integrated terminal gives the user a proper TTY to interact with
 * terminal-based merge tools, and GUI tools (launched as child processes by jj)
 * open their own window regardless of how jj is invoked.
 *
 * After the terminal closes, the repository is refreshed to pick up any
 * conflict resolutions.
 */

import * as vscode from 'vscode';
import type { JjCli } from '../../core/jj-cli';
import type { RepositoryState } from '../../core/repository';
import type { Revision } from '../../core/types';
import type { CommandService } from './command-service';
import { RevisionTreeItem, type LoadMoreTreeItem } from '../views/revisions/tree-items';
import { pickRevision } from '../pickers/revision-picker';
import { shellQuote } from '../shell-quote';

// ─── Context type ─────────────────────────────────────────────────────────────

/** The per-repository dependencies each conflict command needs at invocation time. */
export interface ConflictCommandContext {
  readonly service: CommandService;
  readonly cli: JjCli;
  readonly repository: RepositoryState;
  /** Disposables created during command execution are pushed here so they are cleaned up on deactivation. */
  readonly disposables: vscode.Disposable[];
}

// ─── Shared helper ─────────────────────────────────────────────────────────────

/**
 * Returns the `Revision` from the currently highlighted revision tree item, or
 * `undefined` if nothing is selected or the selection is not a revision item.
 */
function getTreeSelection(
  treeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): Revision | undefined {
  const selected = treeView.selection[0];
  if (selected instanceof RevisionTreeItem) {
    return selected.revision;
  }
  return undefined;
}

// ─── jjvs.conflict.resolve ────────────────────────────────────────────────────

/**
 * Register `jjvs.conflict.resolve`.
 *
 * Opens an integrated terminal and runs `jj resolve -r <changeId>` in it.
 * The user interacts with their configured merge tool (terminal TUI or GUI).
 * When the terminal session ends, the repository is refreshed.
 *
 * ## Resolution flow
 *
 * 1. Determine the target revision:
 *    - If invoked from the context menu, the `RevisionTreeItem` is passed as `treeItem`.
 *    - Otherwise, the currently selected tree item is used if it has a conflict.
 *    - If neither has a conflict but there is exactly one conflicted revision in
 *      the current view, it is selected automatically.
 *    - If there are multiple conflicted revisions, a picker is shown.
 * 2. A new integrated terminal is created, named `jj resolve <shortId>`.
 * 3. `jj resolve -r <shortId>` is sent to the terminal and the terminal is shown.
 * 4. When the terminal closes, the repository is refreshed.
 *
 * @param jjPath - Path to the `jj` binary (from `jjvs.jjPath` configuration).
 */
export function registerResolveConflictCommand(
  getContext: () => ConflictCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
  jjPath: string,
): vscode.Disposable {
  return vscode.commands.registerCommand(
    'jjvs.conflict.resolve',
    async (treeItem?: RevisionTreeItem) => {
      const ctx = getContext();
      if (ctx === undefined) return;

      // Step 1: Resolve the target revision.
      let revision: Revision | undefined;

      if (treeItem instanceof RevisionTreeItem) {
        // Invoked from context menu: use the item that was right-clicked.
        revision = treeItem.revision;
      } else {
        // Invoked from command palette or keybinding.
        const selected = getTreeSelection(revisionTreeView);
        if (selected !== undefined && selected.hasConflict) {
          revision = selected;
        }
      }

      if (revision === undefined) {
        // No directly-accessible conflicted revision: look at all conflicts in the view.
        const conflicted = ctx.repository.revisions.filter((r) => r.hasConflict);
        if (conflicted.length === 0) {
          void vscode.window.showInformationMessage(
            'Jujutsu: No conflicted revisions in the current view.',
          );
          return;
        }

        if (conflicted.length === 1) {
          // Exactly one conflict — no need to prompt.
          revision = conflicted[0];
        } else {
          // Multiple conflicts — show a picker.
          revision = await pickRevision(conflicted, {
            title: 'Resolve Conflicts — Select Revision',
            placeholder: 'Select a conflicted revision to resolve',
          });
          if (revision === undefined) {
            // User cancelled.
            return;
          }
        }
      }

      const shortId = revision.changeId.substring(0, 12);
      const terminalName = `jj resolve ${shortId}`;

      // Step 2: Open an integrated terminal in the repository root.
      const terminal = vscode.window.createTerminal({
        name: terminalName,
        cwd: ctx.repository.rootPath,
      });

      // Step 3: Send the resolve command and show the terminal.
      // shellQuote guards against jjPath values that contain spaces or special chars.
      terminal.sendText(`${shellQuote(jjPath)} resolve -r ${shortId}`);
      terminal.show();

      // Step 4: Refresh the repository when the terminal session ends so that
      // resolved conflicts are reflected in the tree view and status bar.
      const closeListener = vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (closedTerminal === terminal) {
          closeListener.dispose();
          void ctx.repository.refresh();
        }
      });
      ctx.disposables.push(closeListener);
    },
  );
}
