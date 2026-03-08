/**
 * Remote picker QuickPick for `jj git push` and `jj git fetch`.
 *
 * Remote names are extracted from the remote bookmarks already present in the
 * repository's revision list — no extra `jj git remote list` call is needed.
 * The configured default remote (from `jjvs.git.defaultRemote`) is always
 * offered first, even when it has no bookmarks yet.
 *
 * The QuickPick is free-form: the user can type any remote name that does not
 * appear in the list, which accommodates remotes that have no bookmarks tracked
 * locally.
 */

import * as vscode from 'vscode';
import type { RepositoryState } from '../../core/repository';

/** Options for `pickRemote`. */
export interface PickRemoteOptions {
  /** QuickPick window title (e.g., "Push to Remote"). */
  readonly title: string;
  /** Placeholder text inside the input. */
  readonly placeholder?: string;
  /** The default remote name, pre-selected and shown with a "(default)" badge. */
  readonly defaultRemote: string;
}

/**
 * Show a QuickPick for selecting a git remote.
 *
 * Remote names are derived from the remote bookmarks already cached in
 * `repository.revisions`. The `defaultRemote` is always listed first with a
 * "(default)" description, even when no bookmarks from that remote are present.
 *
 * The picker is free-form: pressing Enter without selecting an item accepts
 * whatever the user has typed as the remote name. This lets users target a
 * remote that has no bookmarks yet (e.g., a freshly cloned repo with only a
 * bare `origin`).
 *
 * @returns The chosen remote name, or `undefined` if the user cancelled.
 */
export async function pickRemote(
  repository: RepositoryState,
  options: PickRemoteOptions,
): Promise<string | undefined> {
  // Collect unique remote names from cached revision data.
  const fromRevisions = new Set<string>(
    repository.revisions.flatMap((r) => r.remoteBookmarks.map((b) => b.remote)),
  );

  // Build the ordered list: default remote first, then alphabetical others.
  const remoteNames: string[] = [options.defaultRemote];
  for (const name of [...fromRevisions].sort()) {
    if (name !== options.defaultRemote) {
      remoteNames.push(name);
    }
  }

  const items: vscode.QuickPickItem[] = remoteNames.map((name): vscode.QuickPickItem =>
    name === options.defaultRemote
      ? { label: name, description: '(default)' }
      : { label: name },
  );

  const quickPick = vscode.window.createQuickPick();
  quickPick.title = options.title;
  quickPick.placeholder = options.placeholder ?? 'Select a remote or type a remote name';
  quickPick.items = items;
  // Pre-select the default remote so pressing Enter immediately accepts it.
  quickPick.activeItems = items.slice(0, 1);

  const chosen = await new Promise<string | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      const selected = quickPick.activeItems[0];
      // Prefer a list selection; fall back to whatever the user typed.
      const name = selected?.label ?? quickPick.value.trim();
      resolve(name !== '' ? name : undefined);
      quickPick.hide();
    });
    quickPick.onDidHide(() => {
      resolve(undefined);
    });
    quickPick.show();
  });

  quickPick.dispose();
  return chosen;
}
