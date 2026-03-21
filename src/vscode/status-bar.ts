/**
 * Status bar items for jjvs.
 *
 * Two classes are exported:
 *
 * - `JjStatusBar`: Displays the current working-copy change ID, any bookmarks
 *   attached to it, and push/fetch action buttons for colocated jj+git repos.
 *   Placed on the left side at a higher priority than the conflict item so the
 *   change ID appears prominently near the source-control area.
 *
 * - `ConflictStatusBar`: Shows the count of conflicted revisions. Hidden when
 *   there are no conflicts.
 */

import * as vscode from 'vscode';
import type { Revision, RepoKind } from '../core/types';

// ─── JjStatusBar ──────────────────────────────────────────────────────────────

/**
 * Composite status bar component for jjvs.
 *
 * Shows three items in the left status bar:
 *
 * 1. **Current change**: `$(git-commit) <12-char changeId> [bookmark …]`
 *    Clicking it runs `jjvs.describeWorkingCopy` so the user can quickly
 *    describe their current work.
 *
 * 2. **Push button** (`$(cloud-upload)`): Runs `jjvs.git.push`.
 *    Visible only for colocated jj+git repositories.
 *
 * 3. **Fetch button** (`$(cloud-download)`): Runs `jjvs.git.fetch`.
 *    Visible only for colocated jj+git repositories.
 *
 * Call `update(revisions, kind)` after each repository refresh and
 * `clear()` when no repository is active.
 */
export class JjStatusBar implements vscode.Disposable {
  private readonly currentChangeItem: vscode.StatusBarItem;
  private readonly pushItem: vscode.StatusBarItem;
  private readonly fetchItem: vscode.StatusBarItem;

  constructor() {
    // Priority 14: left of ConflictStatusBar (priority 10), right of git built-ins.
    this.currentChangeItem = vscode.window.createStatusBarItem(
      'jjvs.currentChange',
      vscode.StatusBarAlignment.Left,
      14,
    );
    this.currentChangeItem.name = 'Jujutsu Current Change';
    this.currentChangeItem.command = 'jjvs.describeWorkingCopy';

    this.pushItem = vscode.window.createStatusBarItem(
      'jjvs.gitPush',
      vscode.StatusBarAlignment.Left,
      13,
    );
    this.pushItem.name = 'Jujutsu Push';
    this.pushItem.text = '$(cloud-upload)';
    this.pushItem.tooltip = 'Push tracked bookmarks to remote (jj git push)';
    this.pushItem.command = 'jjvs.git.push';

    this.fetchItem = vscode.window.createStatusBarItem(
      'jjvs.gitFetch',
      vscode.StatusBarAlignment.Left,
      12,
    );
    this.fetchItem.name = 'Jujutsu Fetch';
    this.fetchItem.text = '$(cloud-download)';
    this.fetchItem.tooltip = 'Fetch from remote (jj git fetch)';
    this.fetchItem.command = 'jjvs.git.fetch';
  }

  /**
   * Update all status bar items from the latest revision list.
   *
   * @param revisions - The current revision log (used to find the working copy
   *   and extract its bookmarks).
   * @param kind - Whether the repo is `'colocated'` or `'native'`. Push/fetch
   *   buttons are only shown for colocated repos.
   */
  update(revisions: readonly Revision[], kind: RepoKind): void {
    const workingCopy = revisions.find((r) => r.isWorkingCopy);
    if (workingCopy === undefined) {
      this.clear();
      return;
    }

    const shortId = workingCopy.changeId.slice(0, 12);
    const bookmarkNames = workingCopy.localBookmarks.map((b) => b.name);
    const bookmarkSuffix = bookmarkNames.length > 0 ? ` ${bookmarkNames.join(', ')}` : '';

    const firstLine = workingCopy.description.split('\n')[0]?.trim() ?? '';
    const descriptionSuffix = firstLine !== '' ? ` — ${firstLine}` : '';

    this.currentChangeItem.text = `$(git-commit) ${shortId}${bookmarkSuffix}`;
    this.currentChangeItem.tooltip = buildChangeTooltip(workingCopy, descriptionSuffix);
    this.currentChangeItem.show();

    if (kind === 'colocated') {
      this.pushItem.show();
      this.fetchItem.show();
    } else {
      this.pushItem.hide();
      this.fetchItem.hide();
    }
  }

  /**
   * Hide all status bar items.
   *
   * Called when no repository is active or the repository state cannot be
   * determined.
   */
  clear(): void {
    this.currentChangeItem.hide();
    this.pushItem.hide();
    this.fetchItem.hide();
  }

  dispose(): void {
    this.currentChangeItem.dispose();
    this.pushItem.dispose();
    this.fetchItem.dispose();
  }
}

/**
 * Build the tooltip MarkdownString for the current-change status bar item.
 */
function buildChangeTooltip(
  workingCopy: Revision,
  descriptionSuffix: string,
): vscode.MarkdownString {
  const lines: string[] = [
    `**Change** \`${workingCopy.changeId}\``,
    `**Commit** \`${workingCopy.commitId}\``,
  ];

  if (workingCopy.description.trim() !== '') {
    lines.push(`\n${workingCopy.description.trim()}`);
  } else {
    lines.push(`*(no description)*`);
  }

  if (workingCopy.localBookmarks.length > 0) {
    const names = workingCopy.localBookmarks.map((b) => `\`${b.name}\``).join(', ');
    lines.push(`\n**Bookmarks**: ${names}`);
  }

  lines.push(`\n*Click to describe this revision*`);

  const tooltip = new vscode.MarkdownString(lines.join('\n'), true);
  tooltip.isTrusted = true;
  void descriptionSuffix; // included in the status bar text, not the tooltip
  return tooltip;
}

// ─── ConflictStatusBar ────────────────────────────────────────────────────────

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
