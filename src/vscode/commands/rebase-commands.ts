/**
 * Rebase command implementation.
 *
 * Multi-step QuickPick flow:
 *   1. Resolve the source revision (tree selection or revision picker)
 *   2. Pick source mode (revision / source+descendants / branch)
 *   3. Pick destination revision
 *   4. Pick placement relative to the destination
 *
 * After a successful rebase, subscribes once to the repository's `onDidChange`
 * event to detect a conflict cascade. If any revisions gained conflicts, shows
 * an informational message with a shortcut to open the conflict resolver.
 */

import * as vscode from 'vscode';
import type { RebaseSourceMode } from '../../core/jj-cli';
import type { Revision } from '../../core/types';
import type { RevisionCommandContext } from './revision-commands';
import { pickRevision } from '../pickers/revision-picker';
import { RevisionTreeItem, type LoadMoreTreeItem } from '../views/revisions/tree-items';

// ─── Placement type ───────────────────────────────────────────────────────────

/** Placement options for `jj rebase`, matching `RebaseOptions.placement`. */
type Placement = 'onto' | 'after' | 'before' | 'insert-after' | 'insert-before';

// ─── Source mode picker ───────────────────────────────────────────────────────

interface SourceModeItem extends vscode.QuickPickItem {
  readonly mode: RebaseSourceMode;
}

/**
 * Show a QuickPick for selecting the rebase source mode.
 *
 * @param sourceRevision - The revision being rebased (used to show its change ID in labels).
 * @returns The selected `RebaseSourceMode`, or `undefined` if cancelled.
 */
async function pickSourceMode(sourceRevision: Revision): Promise<RebaseSourceMode | undefined> {
  const shortId = sourceRevision.changeId.substring(0, 12);

  const items: SourceModeItem[] = [
    {
      label: '$(git-commit) This revision only',
      description: `-r ${shortId}`,
      detail:
        'Rebase only this revision. Its descendants stay in place (may create new conflicts).',
      mode: 'revision',
    },
    {
      label: '$(git-merge) This revision and all descendants',
      description: `-s ${shortId}`,
      detail: 'Rebase this revision and the entire subtree rooted here.',
      mode: 'source',
    },
    {
      label: '$(git-branch) Entire branch',
      description: `-b ${shortId}`,
      detail: 'Rebase all connected revisions in the same bookmark or branch.',
      mode: 'branch',
    },
  ];

  const quickPick = vscode.window.createQuickPick<SourceModeItem>();
  quickPick.title = 'Rebase: Step 1 of 3 — Source Mode';
  quickPick.placeholder = 'How much of the branch to rebase?';
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.items = items;

  const result = await new Promise<RebaseSourceMode | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      const chosen = quickPick.activeItems[0] ?? quickPick.selectedItems[0];
      resolve(chosen?.mode);
      quickPick.hide();
    });
    quickPick.onDidHide(() => resolve(undefined));
    quickPick.show();
  });

  quickPick.dispose();
  return result;
}

// ─── Placement picker ─────────────────────────────────────────────────────────

interface PlacementItem extends vscode.QuickPickItem {
  readonly placement: Placement;
}

/**
 * Show a QuickPick for selecting rebase placement relative to the destination.
 *
 * @returns The selected `Placement`, or `undefined` if cancelled.
 */
async function pickPlacement(): Promise<Placement | undefined> {
  const items: PlacementItem[] = [
    {
      label: '$(arrow-down) Onto (as a child)',
      description: '--destination',
      detail: 'Place the rebased revision as a child of the destination. Standard rebase.',
      placement: 'onto',
    },
    {
      label: '$(arrow-right) After (insert before its children)',
      description: '--after',
      detail:
        'Insert the rebased revision between the destination and its current children.',
      placement: 'after',
    },
    {
      label: '$(arrow-left) Before (insert after its parents)',
      description: '--before',
      detail: 'Insert the rebased revision between the destination and its parents.',
      placement: 'before',
    },
    {
      label: '$(insert) Insert after',
      description: '--insert-after',
      detail: 'Insert the rebased revision into the DAG after the destination.',
      placement: 'insert-after',
    },
    {
      label: '$(insert) Insert before',
      description: '--insert-before',
      detail: 'Insert the rebased revision into the DAG before the destination.',
      placement: 'insert-before',
    },
  ];

  const quickPick = vscode.window.createQuickPick<PlacementItem>();
  quickPick.title = 'Rebase: Step 3 of 3 — Placement';
  quickPick.placeholder = 'Where to place relative to the destination?';
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.items = items;

  const result = await new Promise<Placement | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      const chosen = quickPick.activeItems[0] ?? quickPick.selectedItems[0];
      resolve(chosen?.placement);
      quickPick.hide();
    });
    quickPick.onDidHide(() => resolve(undefined));
    quickPick.show();
  });

  quickPick.dispose();
  return result;
}

// ─── jjvs.rebase ─────────────────────────────────────────────────────────────

/**
 * Register `jjvs.rebase`.
 *
 * Runs a multi-step QuickPick to collect source, source mode, destination, and
 * placement, then delegates to `jj rebase` through `CommandService`. After a
 * successful rebase, listens for the next repository refresh to detect whether
 * any revisions gained conflicts, and surfaces an actionable notification if so.
 */
export function registerRebaseCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.rebase', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    // ── Step 1: resolve source revision ────────────────────────────────────

    // Use the highlighted tree item if available; otherwise prompt.
    const selected = revisionTreeView.selection[0];
    let sourceRevision: Revision | undefined =
      selected instanceof RevisionTreeItem ? selected.revision : undefined;

    if (sourceRevision === undefined) {
      sourceRevision = await pickRevision(ctx.repository.revisions, {
        title: 'Rebase: Select Source Revision',
        placeholder: 'Type to filter by change ID, description, or bookmark',
      });
    }

    if (sourceRevision === undefined) return;

    // ── Step 2: pick source mode ────────────────────────────────────────────

    const mode = await pickSourceMode(sourceRevision);
    if (mode === undefined) return;

    // ── Step 3: pick destination ────────────────────────────────────────────

    // Exclude the source revision from the destination list to prevent
    // trivial self-rebase loops.
    const destinationCandidates = ctx.repository.revisions.filter(
      (r) => r.changeId !== sourceRevision.changeId,
    );

    const destination = await pickRevision(destinationCandidates, {
      title: 'Rebase: Step 2 of 3 — Destination',
      placeholder: 'Select the revision to rebase onto',
    });

    if (destination === undefined) return;

    // ── Step 4: pick placement ──────────────────────────────────────────────

    const placement = await pickPlacement();
    if (placement === undefined) return;

    // ── Execute ─────────────────────────────────────────────────────────────

    const succeeded = await ctx.service.run(
      { title: 'Rebase', showProgress: true },
      (signal) =>
        ctx.cli.rebase({
          revset: sourceRevision.changeId,
          mode,
          destination: destination.changeId,
          // 'onto' is the default; omit the property entirely rather than
          // assigning undefined (exactOptionalPropertyTypes enforcement).
          ...(placement !== 'onto' ? { placement } : {}),
          signal,
        }),
    );

    if (!succeeded) return;

    // ── Post-rebase: detect conflict cascade ────────────────────────────────
    //
    // jj rebase exits 0 even when it creates conflicts (they are stored in
    // commits, not blocking). Subscribe once to the next 'changed' event from
    // the repository — fired when the CommandService's void refresh() completes
    // — to check whether any revisions now have conflicts and surface a prompt.
    const subscription = ctx.repository.onDidChange((event) => {
      if (event.kind !== 'changed') return;
      subscription.dispose();

      const conflicted = ctx.repository.revisions.filter((r) => r.hasConflict);
      if (conflicted.length === 0) return;

      const count = conflicted.length;
      const noun = count === 1 ? 'revision has' : 'revisions have';

      void vscode.window
        .showInformationMessage(
          `Rebase succeeded. ${count} ${noun} conflicts. Resolve them to continue.`,
          'Resolve Conflicts',
        )
        .then((choice) => {
          if (choice === 'Resolve Conflicts') {
            void vscode.commands.executeCommand('jjvs.conflict.resolve');
          }
        });
    });
  });
}
