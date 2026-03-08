/**
 * Operation log command implementations.
 *
 * Commands: oplog.undo, oplog.restore.
 *
 * `jjvs.oplog.undo` undoes the most recent operation (`jj undo`).
 *
 * `jjvs.oplog.restore` restores the repository to the state at a chosen
 * operation (`jj op restore <operationId>`). The operation is resolved from
 * the op log tree selection, or from a QuickPick when invoked from the
 * command palette.
 */

import * as vscode from 'vscode';
import type { RevisionCommandContext } from './revision-commands';
import { OperationTreeItem, type OpLogTreeItem } from '../views/op-log/tree-items';
import { formatRelativeTime } from '../views/op-log/tree-items';

// ─── jjvs.oplog.undo ─────────────────────────────────────────────────────────

/**
 * Register `jjvs.oplog.undo`.
 *
 * Undoes the most recent jj operation. Equivalent to `jj undo`.
 *
 * Shows a confirmation dialog because undo modifies repository state and may
 * be difficult to reverse if the user has continued working.
 */
export function registerOpUndoCommand(
  getContext: () => RevisionCommandContext | undefined,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.oplog.undo', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const choice = await vscode.window.showWarningMessage(
      'Undo the last jj operation? This will revert the repository to the state before the most recent operation.',
      { modal: true },
      'Undo',
    );
    if (choice !== 'Undo') return;

    await ctx.service.run({ title: 'Undo last operation' }, (signal) =>
      ctx.cli.opUndo(signal),
    );
  });
}

// ─── jjvs.oplog.restore ──────────────────────────────────────────────────────

/**
 * Register `jjvs.oplog.restore`.
 *
 * Restores the repository to the state captured by a chosen operation.
 * Equivalent to `jj op restore <operationId>`.
 *
 * When invoked from the op log tree context menu, the selected operation is
 * used directly. When invoked from the command palette, a QuickPick shows
 * all available operations.
 */
export function registerOpRestoreCommand(
  getContext: () => RevisionCommandContext | undefined,
  opLogTreeView: vscode.TreeView<OpLogTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.oplog.restore', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    let operationId: string | undefined;
    let operationDescription: string | undefined;

    // Use tree selection if it's an operation item.
    const selected = opLogTreeView.selection[0];
    if (selected instanceof OperationTreeItem) {
      operationId = selected.operation.id;
      operationDescription = selected.operation.description.split('\n')[0]?.trim();
    } else {
      // Fall back to a QuickPick over cached operations.
      const operations = ctx.repository.operations;

      if (operations.length === 0) {
        void vscode.window.showWarningMessage('Jujutsu: No operations found in the log.');
        return;
      }

      const items: vscode.QuickPickItem[] = operations.map((op) => ({
        label: op.description.split('\n')[0]?.trim() ?? op.description,
        description: formatRelativeTime(op.time.end),
        detail: `ID: ${op.id.substring(0, 16)}  ·  User: ${op.user}`,
      }));

      const quickPick = vscode.window.createQuickPick();
      quickPick.title = 'Restore to Operation';
      quickPick.placeholder = 'Select an operation to restore to';
      quickPick.items = items;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;

      const result = await new Promise<vscode.QuickPickItem | undefined>((resolve) => {
        quickPick.onDidAccept(() => {
          resolve(quickPick.activeItems[0]);
          quickPick.hide();
        });
        quickPick.onDidHide(() => resolve(undefined));
        quickPick.show();
      });
      quickPick.dispose();

      if (result === undefined) return;

      // Match the selected item back to an operation by description + time.
      const matchedOp = operations.find(
        (op) =>
          (op.description.split('\n')[0]?.trim() ?? op.description) === result.label &&
          formatRelativeTime(op.time.end) === result.description,
      );

      if (matchedOp === undefined) return;
      operationId = matchedOp.id;
      operationDescription = matchedOp.description.split('\n')[0]?.trim();
    }

    if (operationId === undefined) return;

    const shortId = operationId.substring(0, 16);
    const label = operationDescription ?? shortId;

    const choice = await vscode.window.showWarningMessage(
      `Restore to operation "${label}"? The repository will be set to the state captured by this operation.`,
      { modal: true },
      'Restore',
    );
    if (choice !== 'Restore') return;

    const id = operationId;
    await ctx.service.run({ title: `Restore to operation ${shortId}` }, (signal) =>
      ctx.cli.opRestore(id, signal),
    );
  });
}
