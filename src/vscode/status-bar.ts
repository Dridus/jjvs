/**
 * Conflict count status bar item.
 *
 * Shows the number of conflicted revisions visible in the current revision
 * log view. Hidden when there are no conflicts. Updated by callers whenever
 * the repository state changes (after each refresh cycle).
 *
 * Placed on the left side of the status bar (alongside source-control items)
 * rather than the right (which is reserved for editor state like line/column).
 */

import * as vscode from 'vscode';
import type { Revision } from '../core/types';

/**
 * Status bar item that shows the number of conflicted revisions in the
 * current revision log view.
 *
 * Callers must call `update(revisions)` after each repository refresh and
 * `clear()` when no repository is active.
 */
export class ConflictStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      'jjvs.conflictCount',
      vscode.StatusBarAlignment.Left,
      10,
    );
    this.item.name = 'Jujutsu Conflicts';
    this.item.command = 'jjvs.conflict.resolve';
  }

  /**
   * Recalculate and display the conflict count from the latest revision list.
   *
   * Shows a warning badge when at least one revision has `hasConflict: true`.
   * Hides the item entirely when there are no conflicts.
   */
  update(revisions: readonly Revision[]): void {
    const count = revisions.filter((r) => r.hasConflict).length;
    if (count === 0) {
      this.item.hide();
      return;
    }

    const label = count === 1 ? '1 conflict' : `${count} conflicts`;
    this.item.text = `$(warning) ${label}`;
    this.item.tooltip = new vscode.MarkdownString(
      `**${label}** in the current revision view.\n\nClick to resolve conflicts with \`jj resolve\`.`,
    );
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this.item.show();
  }

  /**
   * Hide the status bar item.
   *
   * Called when no repository is active or when the repository state cannot
   * be determined (e.g., after a failed refresh).
   */
  clear(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
