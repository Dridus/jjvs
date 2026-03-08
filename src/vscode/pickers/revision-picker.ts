/**
 * Revision picker — a QuickPick for selecting a jj revision.
 *
 * Displays the revision log from a `RepositoryState` as a filterable list.
 * The user can type to narrow results by change ID, description, author name,
 * or bookmark name. Revisions are shown with state indicators (working copy,
 * conflict, immutable).
 *
 * For operations that act on the currently selected tree item (edit, describe,
 * abandon), the picker pre-selects the active tree item so a quick Enter
 * confirms without further navigation.
 */

import * as vscode from 'vscode';
import type { Revision } from '../../core/types';
import { formatRelativeTime } from '../views/revisions/tree-items';

/** A QuickPick item wrapping a single jj Revision. */
interface RevisionQuickPickItem extends vscode.QuickPickItem {
  readonly revision: Revision;
}

/**
 * Show a QuickPick for selecting a single revision.
 *
 * @param revisions - The revision list to display (typically from `RepositoryState.revisions`).
 * @param options - Display and pre-selection options.
 * @returns The selected `Revision`, or `undefined` if the user cancelled.
 */
export async function pickRevision(
  revisions: readonly Revision[],
  options: {
    readonly title: string;
    readonly placeholder?: string;
    /** Pre-select the item matching this change ID. */
    readonly activeChangeId?: string;
    /**
     * When true, immutable revisions are excluded from the list.
     * Use for operations that jj rejects on immutable revisions (abandon, describe).
     */
    readonly excludeImmutable?: boolean;
  },
): Promise<Revision | undefined> {
  const candidates =
    options.excludeImmutable === true ? revisions.filter((r) => !r.isImmutable) : revisions;

  if (candidates.length === 0) {
    void vscode.window.showWarningMessage('Jujutsu: No revisions available to select.');
    return undefined;
  }

  const items = candidates.map(buildItem);

  const quickPick = vscode.window.createQuickPick<RevisionQuickPickItem>();
  quickPick.title = options.title;
  quickPick.placeholder =
    options.placeholder ?? 'Type to filter by change ID, description, or bookmark';
  // Enable matching against the description and detail fields so the filter
  // text works across all displayed revision metadata.
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;
  quickPick.items = items;

  // Pre-select the item that matches the active tree selection (if provided).
  if (options.activeChangeId !== undefined) {
    const activeItem = items.find((i) => i.revision.changeId === options.activeChangeId);
    if (activeItem !== undefined) {
      quickPick.activeItems = [activeItem];
    }
  }

  const result = await new Promise<Revision | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      // Prefer the highlighted (active) item; fall back to first selected.
      const chosen = quickPick.activeItems[0] ?? quickPick.selectedItems[0];
      resolve(chosen?.revision);
      quickPick.hide();
    });
    quickPick.onDidHide(() => resolve(undefined));
    quickPick.show();
  });

  quickPick.dispose();
  return result;
}

// ─── Item builders ────────────────────────────────────────────────────────────

function buildItem(revision: Revision): RevisionQuickPickItem {
  const shortId = revision.changeId.substring(0, 12);
  const descriptionText =
    revision.description.trim() !== '' ? revision.description.trim() : '(no description set)';

  // Truncate long descriptions to keep the label readable.
  const firstLine = descriptionText.split('\n')[0] ?? descriptionText;
  const label = `$(git-commit) ${shortId}  ${firstLine}`;

  const stateFlags: string[] = [];
  if (revision.isWorkingCopy) stateFlags.push('@');
  if (revision.hasConflict) stateFlags.push('⚠ conflict');
  if (revision.isImmutable) stateFlags.push('🔒 immutable');
  const stateText = stateFlags.length > 0 ? ` (${stateFlags.join(', ')})` : '';

  const itemDescription = `${revision.author.name} · ${formatRelativeTime(revision.author.timestamp)}${stateText}`;

  const bookmarkText = buildBookmarkText(revision);

  return {
    label,
    description: itemDescription,
    // exactOptionalPropertyTypes: only include detail when there are bookmarks
    // to avoid assigning undefined to an optional string property.
    ...(bookmarkText !== '' ? { detail: bookmarkText } : {}),
    revision,
  };
}

function buildBookmarkText(revision: Revision): string {
  const parts: string[] = [];
  for (const bm of revision.localBookmarks) {
    parts.push(bm.name);
  }
  for (const bm of revision.remoteBookmarks) {
    if (bm.trackingTargets.length > 0) {
      parts.push(`${bm.remote}/${bm.name}`);
    }
  }
  return parts.length > 0 ? `Bookmarks: ${parts.join(', ')}` : '';
}
