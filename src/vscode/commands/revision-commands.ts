/**
 * Revision command implementations.
 *
 * Commands: new, edit, abandon, describe (inline + editor), duplicate.
 *
 * Each exported `register*Command` function takes a lazy context factory
 * (`getContext`) that is called at command invocation time, not at registration
 * time. This ensures commands always use the current repository even after
 * workspace folder changes.
 *
 * ## Command flow pattern
 *
 * 1. Resolve the active context (service + CLI + repository) via `getContext()`.
 * 2. Resolve the target revision from tree selection or revision picker.
 * 3. Gather additional inputs (description text, confirmation, etc.).
 * 4. Run the jj CLI operation through `CommandService.run()`.
 *
 * ## Why CommandService
 *
 * Per CLAUDE.md: "All user-facing commands are registered via CommandService,
 * which handles progress indication, error display and logging, post-command
 * refresh, and command serialization."
 */

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { JjCli } from '../../core/jj-cli';
import type { RepositoryState } from '../../core/repository';
import type { Revision } from '../../core/types';
import type { CommandService } from './command-service';
import { parseDiffStatPaths } from '../../core/deserializers/diff';
import { pickRevision } from '../pickers/revision-picker';
import { RevisionTreeItem, type LoadMoreTreeItem } from '../views/revisions/tree-items';

// ─── Context type ─────────────────────────────────────────────────────────────

/** The per-repository dependencies each command needs at invocation time. */
export interface RevisionCommandContext {
  readonly service: CommandService;
  readonly cli: JjCli;
  readonly repository: RepositoryState;
}

// ─── Shared helper ────────────────────────────────────────────────────────────

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

// ─── jjvs.revision.new ────────────────────────────────────────────────────────

/**
 * Register `jjvs.revision.new`.
 *
 * Creates a new empty revision. If a non-working-copy revision is selected in
 * the tree, the new revision is created as a child of that revision. Otherwise,
 * it is created after the working copy (`@`).
 *
 * The user is prompted for an optional description. Pressing Escape cancels;
 * pressing Enter with an empty input creates the revision with no description.
 */
export function registerNewRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.new', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    // If a non-working-copy revision is selected, use it as the explicit parent
    // so `jj new` creates a child of that revision rather than @.
    const parentChangeId =
      treeSelection !== undefined && !treeSelection.isWorkingCopy
        ? treeSelection.changeId
        : undefined;

    const promptSuffix =
      parentChangeId !== undefined
        ? `after ${parentChangeId.substring(0, 12)}`
        : 'after the working copy (@)';

    const description = await vscode.window.showInputBox({
      title: 'New Revision',
      prompt: `Create a new revision ${promptSuffix}. Enter a description (optional).`,
      placeHolder: '(press Enter for no description, Escape to cancel)',
      ignoreFocusOut: true,
    });

    // undefined means the user pressed Escape — cancel the command.
    if (description === undefined) return;

    await ctx.service.run({ title: 'New' }, (signal) =>
      ctx.cli.newRevision({
        ...(parentChangeId !== undefined ? { revsets: [parentChangeId] } : {}),
        ...(description.trim() !== '' ? { description: description.trim() } : {}),
        signal,
      }),
    );
  });
}

// ─── jjvs.revision.edit ───────────────────────────────────────────────────────

/**
 * Register `jjvs.revision.edit`.
 *
 * Moves the working copy to an existing revision (`jj edit <changeId>`).
 * Pre-selects the currently highlighted tree item in the revision picker.
 */
export function registerEditRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.edit', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    if (treeSelection?.isWorkingCopy) {
      void vscode.window.showInformationMessage(
        'Jujutsu: This revision is already the working copy.',
      );
      return;
    }

    const revision = await pickRevision(ctx.repository.revisions, {
      title: 'Edit Revision',
      placeholder: 'Select a revision to make the working copy',
      // exactOptionalPropertyTypes: only include activeChangeId when defined.
      ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
    });

    if (revision === undefined) return;

    if (revision.isWorkingCopy) {
      void vscode.window.showInformationMessage(
        'Jujutsu: This revision is already the working copy.',
      );
      return;
    }

    await ctx.service.run({ title: 'Edit' }, (signal) =>
      ctx.cli.edit(revision.changeId, signal),
    );
  });
}

// ─── jjvs.revision.abandon ────────────────────────────────────────────────────

/**
 * Register `jjvs.revision.abandon`.
 *
 * Abandons (permanently deletes) a revision. Immutable revisions are excluded
 * from the picker since jj rejects `abandon` on them. Requires confirmation
 * before proceeding.
 */
export function registerAbandonRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.abandon', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    const revision = await pickRevision(ctx.repository.revisions, {
      title: 'Abandon Revision',
      placeholder: 'Select a revision to abandon',
      // exactOptionalPropertyTypes: only include activeChangeId when defined.
      ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
      excludeImmutable: true,
    });

    if (revision === undefined) return;

    const shortId = revision.changeId.substring(0, 12);
    const firstLine =
      revision.description.trim() !== ''
        ? `"${revision.description.trim().split('\n')[0]}"`
        : '(no description)';

    const confirm = await vscode.window.showWarningMessage(
      `Abandon revision ${shortId} ${firstLine}?`,
      { modal: true },
      'Abandon',
    );

    if (confirm !== 'Abandon') return;

    await ctx.service.run({ title: 'Abandon' }, (signal) =>
      ctx.cli.abandon([revision.changeId], signal),
    );
  });
}

// ─── jjvs.revision.describe ───────────────────────────────────────────────────

/**
 * Register `jjvs.revision.describe`.
 *
 * Sets the description of a revision using an inline InputBox pre-populated
 * with the current description. Immutable revisions are excluded.
 *
 * Fast path: if the currently selected tree revision is mutable, it is used
 * directly without showing the picker first.
 *
 * For the working copy, prefer using the SCM input box (`jjvs.describeWorkingCopy`).
 * This command is more useful for describing non-working-copy revisions.
 */
export function registerDescribeRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.describe', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    // Fast path: if the tree has a non-immutable revision selected, use it
    // directly without opening the picker (saves one interaction step).
    let revision: Revision | undefined;
    if (treeSelection !== undefined && !treeSelection.isImmutable) {
      revision = treeSelection;
    } else {
      revision = await pickRevision(ctx.repository.revisions, {
        title: 'Describe Revision',
        placeholder: 'Select a revision to set its description',
        // exactOptionalPropertyTypes: only include activeChangeId when defined.
        ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
        excludeImmutable: true,
      });
    }

    if (revision === undefined) return;

    const shortId = revision.changeId.substring(0, 12);
    const newDescription = await vscode.window.showInputBox({
      title: `Describe ${shortId}`,
      prompt: `Set description for revision ${shortId}`,
      value: revision.description.trim(),
      placeHolder: '(leave empty to clear the description)',
      ignoreFocusOut: true,
    });

    // undefined means the user pressed Escape.
    if (newDescription === undefined) return;

    await ctx.service.run({ title: 'Describe' }, (signal) =>
      ctx.cli.describe({
        changeId: revision.changeId,
        description: newDescription.trim(),
        signal,
      }),
    );
  });
}

// ─── jjvs.revision.describeInEditor ──────────────────────────────────────────

/**
 * Register `jjvs.revision.describeInEditor`.
 *
 * Opens the revision's description in a full VSCode text editor, which is
 * preferable to the inline InputBox for multi-line commit messages. The file
 * is saved to a temporary location with a `.jjmessage` extension.
 *
 * ## Workflow
 *
 * 1. Select a mutable revision (fast-path if one is already selected in tree).
 * 2. Write the current description to a temp file and open it in the editor.
 * 3. The user edits the description and presses `Ctrl+S` / `Cmd+S` to save.
 * 4. On save, jjvs reads the content, runs `jj describe`, and closes the editor.
 *
 * The temp file is deleted after a successful describe. If the user closes the
 * editor without saving, no change is made.
 */
export function registerDescribeInEditorCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.describeInEditor', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    let revision: Revision | undefined;
    if (treeSelection !== undefined && !treeSelection.isImmutable) {
      revision = treeSelection;
    } else {
      revision = await pickRevision(ctx.repository.revisions, {
        title: 'Describe Revision in Editor',
        placeholder: 'Select a revision to open its description in an editor',
        // exactOptionalPropertyTypes: only include activeChangeId when defined.
        ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
        excludeImmutable: true,
      });
    }

    if (revision === undefined) return;

    const shortId = revision.changeId.substring(0, 12);
    // Write the current description to a temp file with a .jjmessage extension
    // so the file type is recognisable and users can configure syntax highlighting.
    const tmpPath = path.join(
      os.tmpdir(),
      `jjvs-describe-${shortId}.jjmessage`,
    );
    const tmpUri = vscode.Uri.file(tmpPath);

    const currentDescription = revision.description.trim();
    await vscode.workspace.fs.writeFile(tmpUri, Buffer.from(currentDescription, 'utf8'));

    const doc = await vscode.workspace.openTextDocument(tmpUri);
    await vscode.window.showTextDocument(doc, { preview: false });

    void vscode.window.showInformationMessage(
      `Editing description for ${shortId}. Save the file (Ctrl+S) to apply.`,
    );

    // Listen for saves on this specific document. The first save applies the
    // description, removes the listener, and closes the editor.
    const saveListener = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
      if (savedDoc.uri.toString() !== tmpUri.toString()) return;

      saveListener.dispose();

      const newDescription = savedDoc.getText().trim();
      const succeeded = await ctx.service.run({ title: 'Describe' }, (signal) =>
        ctx.cli.describe({
          changeId: revision.changeId,
          description: newDescription,
          signal,
        }),
      );

      if (succeeded) {
        // Close the temp editor tab and clean up the file.
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        // Thenable<void> → wrap in Promise so .catch() is available for
        // best-effort cleanup without risking an unhandled rejection.
        void Promise.resolve(vscode.workspace.fs.delete(tmpUri)).catch(() => {
          // Ignore errors if the file is already gone.
        });
      }
    });

    // Clean up the save listener if the document is closed without saving.
    const closeListener = vscode.workspace.onDidCloseTextDocument((closedDoc) => {
      if (closedDoc.uri.toString() === tmpUri.toString()) {
        saveListener.dispose();
        closeListener.dispose();
        void Promise.resolve(vscode.workspace.fs.delete(tmpUri)).catch(() => {});
      }
    });

    // The saveListener and closeListener are self-disposing (each disposes the
    // other when triggered). They will also be cleaned up by the extension host
    // on deactivation since vscode.workspace.onDidSaveTextDocument subscriptions
    // are not manually tracked here — they do not need to be in context.subscriptions
    // because they are intentionally short-lived (scoped to a single editing session).
  });
}

// ─── jjvs.revision.duplicate ─────────────────────────────────────────────────

/**
 * Register `jjvs.revision.duplicate`.
 *
 * Creates a copy of a revision at the same position in the DAG (`jj duplicate`).
 * The duplicate is placed as a sibling of the original with a new change ID.
 */
export function registerDuplicateRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.duplicate', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    const revision = await pickRevision(ctx.repository.revisions, {
      title: 'Duplicate Revision',
      placeholder: 'Select a revision to duplicate',
      // exactOptionalPropertyTypes: only include activeChangeId when defined.
      ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
    });

    if (revision === undefined) return;

    await ctx.service.run({ title: 'Duplicate' }, (signal) =>
      ctx.cli.duplicate([revision.changeId], signal),
    );
  });
}

// ─── jjvs.revision.split ─────────────────────────────────────────────────────

/**
 * Register `jjvs.revision.split`.
 *
 * Splits a revision into two. The user selects which changed files go into the
 * FIRST of the two new revisions; the remaining files stay in the second.
 *
 * ## Flow
 *
 * 1. Resolve the target revision (fast-path from tree selection if mutable).
 * 2. Fetch the list of changed files via `jj diff --stat -r <changeId>`.
 * 3. Show a multi-select QuickPick — the user picks files for the first revision.
 * 4. Optionally enter a description for the first revision.
 * 5. Run `jj split -r <changeId> -- <selectedPaths...>`.
 */
export function registerSplitRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.split', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    // Fast path: mutable tree selection.
    let revision: Revision | undefined;
    if (treeSelection !== undefined && !treeSelection.isImmutable) {
      revision = treeSelection;
    } else {
      revision = await pickRevision(ctx.repository.revisions, {
        title: 'Split Revision',
        placeholder: 'Select a mutable revision to split',
        ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
        excludeImmutable: true,
      });
    }

    if (revision === undefined) return;

    // Fetch changed files in this revision.
    const diffResult = await ctx.cli.diff({ changeId: revision.changeId, format: 'stat' });
    if (!diffResult.ok) {
      void vscode.window.showErrorMessage(
        `Jujutsu: Could not list files for split — ${diffResult.error.message}`,
      );
      return;
    }

    const changedPaths = parseDiffStatPaths(diffResult.value);

    if (changedPaths.length === 0) {
      void vscode.window.showInformationMessage(
        'Jujutsu: This revision has no file changes to split.',
      );
      return;
    }

    if (changedPaths.length === 1) {
      void vscode.window.showInformationMessage(
        'Jujutsu: This revision has only one changed file; split requires at least two.',
      );
      return;
    }

    // Multi-select QuickPick: choose files for the FIRST revision.
    const fileItems = changedPaths.map((filePath) => ({
      label: `$(file) ${filePath}`,
      description: 'first revision',
      filePath,
      picked: false,
    }));

    const shortId = revision.changeId.substring(0, 12);
    const picked = await vscode.window.showQuickPick(fileItems, {
      title: `Split ${shortId} — Select files for the first revision`,
      placeHolder: 'Choose which files go into the first revision (remaining go into the second)',
      canPickMany: true,
      ignoreFocusOut: true,
    });

    // undefined means the user pressed Escape.
    if (picked === undefined) return;

    if (picked.length === 0) {
      void vscode.window.showWarningMessage(
        'Jujutsu: No files selected. Select at least one file for the first revision.',
      );
      return;
    }

    if (picked.length === changedPaths.length) {
      void vscode.window.showWarningMessage(
        'Jujutsu: All files selected — nothing would remain for the second revision. ' +
          'Deselect at least one file.',
      );
      return;
    }

    const selectedPaths = picked.map((item) => item.filePath);

    // Optionally enter a description for the first revision.
    const firstDescription = await vscode.window.showInputBox({
      title: `Split ${shortId} — Description for first revision`,
      prompt: 'Enter a description for the first revision (optional)',
      placeHolder: '(press Enter to leave empty, Escape to cancel)',
      ignoreFocusOut: true,
    });

    // undefined means the user pressed Escape.
    if (firstDescription === undefined) return;

    await ctx.service.run({ title: 'Split', showProgress: true }, (signal) =>
      ctx.cli.split({
        changeId: revision.changeId,
        paths: selectedPaths,
        ...(firstDescription.trim() !== '' ? { firstDescription: firstDescription.trim() } : {}),
        signal,
      }),
    );
  });
}

// ─── jjvs.revision.squash ────────────────────────────────────────────────────

/**
 * Register `jjvs.revision.squash`.
 *
 * Squashes a revision into a target ancestor, combining their changes into a
 * single revision. The default target is the direct parent; the user can pick
 * a different ancestor via `jj squash --into <target>`.
 *
 * ## Flow
 *
 * 1. Resolve the source revision (fast-path from tree selection if mutable).
 * 2. Ask whether to squash into the direct parent or a specific ancestor.
 *    - **Into parent**: runs immediately (most common case).
 *    - **Into ancestor**: shows a second picker listing mutable ancestors.
 * 3. Run `jj squash [-r <changeId>] [--into <target>]`.
 */
export function registerSquashRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.squash', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    // Step 1: Resolve source revision.
    let source: Revision | undefined;
    if (treeSelection !== undefined && !treeSelection.isImmutable) {
      source = treeSelection;
    } else {
      source = await pickRevision(ctx.repository.revisions, {
        title: 'Squash — Select Source',
        placeholder: 'Select a mutable revision to squash',
        ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
        excludeImmutable: true,
      });
    }

    if (source === undefined) return;

    const sourceShortId = source.changeId.substring(0, 12);

    // Step 2: Pick target destination (parent or a specific ancestor).
    const TARGET_PARENT = 'parent';
    const TARGET_ANCESTOR = 'ancestor';
    const destinationChoice = await vscode.window.showQuickPick(
      [
        {
          label: '$(fold-down) Into parent',
          description: 'Squash directly into the parent revision (default)',
          id: TARGET_PARENT,
        },
        {
          label: '$(fold-down) Into specific ancestor...',
          description: 'Choose any mutable ancestor as the destination',
          id: TARGET_ANCESTOR,
        },
      ],
      {
        title: `Squash ${sourceShortId} — Choose target`,
        placeHolder: 'Select where to squash the changes',
        ignoreFocusOut: true,
      },
    );

    if (destinationChoice === undefined) return;

    let intoChangeId: string | undefined;

    if (destinationChoice.id === TARGET_ANCESTOR) {
      // Show a picker for ancestors that are mutable and are not the source itself.
      const ancestors = ctx.repository.revisions.filter(
        (r) => !r.isImmutable && r.changeId !== source.changeId,
      );

      const target = await pickRevision(ancestors, {
        title: `Squash ${sourceShortId} — Select ancestor target`,
        placeholder: 'Select a mutable ancestor to squash into',
      });

      if (target === undefined) return;
      intoChangeId = target.changeId;
    }

    const targetLabel =
      intoChangeId !== undefined
        ? `ancestor ${intoChangeId.substring(0, 12)}`
        : 'its parent';

    const confirm = await vscode.window.showWarningMessage(
      `Squash ${sourceShortId} into ${targetLabel}?`,
      { modal: true },
      'Squash',
    );

    if (confirm !== 'Squash') return;

    await ctx.service.run({ title: 'Squash', showProgress: true }, (signal) =>
      ctx.cli.squash({
        changeId: source.changeId,
        // exactOptionalPropertyTypes: only pass `into` when an ancestor was chosen.
        ...(intoChangeId !== undefined ? { into: intoChangeId } : {}),
        signal,
      }),
    );
  });
}

// ─── jjvs.revision.restore ───────────────────────────────────────────────────

/**
 * Register `jjvs.revision.restore`.
 *
 * Restores the file contents of a revision to match its parent, discarding all
 * local changes. Runs `jj restore [--into <changeId>]`.
 *
 * Most commonly used on the working copy (`@`) to discard all uncommitted changes.
 * Can also be invoked from the context menu on any mutable revision.
 *
 * Requires confirmation since restoring discards changes.
 */
export function registerRestoreRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.restore', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    let revision: Revision | undefined;
    if (treeSelection !== undefined && !treeSelection.isImmutable) {
      revision = treeSelection;
    } else {
      revision = await pickRevision(ctx.repository.revisions, {
        title: 'Restore Revision',
        placeholder: 'Select a mutable revision to restore to its parent state',
        ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
        excludeImmutable: true,
      });
    }

    if (revision === undefined) return;

    const shortId = revision.changeId.substring(0, 12);
    const subject = revision.isWorkingCopy
      ? 'working copy (@)'
      : `revision ${shortId}`;

    const confirm = await vscode.window.showWarningMessage(
      `Restore ${subject} to its parent state? This will discard all changes.`,
      { modal: true },
      'Restore',
    );

    if (confirm !== 'Restore') return;

    await ctx.service.run({ title: 'Restore' }, (signal) =>
      ctx.cli.restore({
        // Use --into to restore a specific revision; omit for working copy (@).
        ...(revision.isWorkingCopy ? {} : { changeId: revision.changeId }),
        signal,
      }),
    );
  });
}

// ─── jjvs.revision.absorb ────────────────────────────────────────────────────

/**
 * Register `jjvs.revision.absorb`.
 *
 * Absorbs changes from the working copy into the appropriate ancestor revisions.
 * jj inspects each changed line and moves it into the ancestor that last touched
 * that region. Only lines that can be unambiguously attributed to an ancestor are
 * absorbed; the rest remain in the working copy.
 *
 * This is equivalent to `jj absorb` with no arguments.
 */
export function registerAbsorbCommand(
  getContext: () => RevisionCommandContext | undefined,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.absorb', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    await ctx.service.run({ title: 'Absorb', showProgress: true }, (signal) =>
      ctx.cli.absorb(signal),
    );
  });
}

// ─── jjvs.revision.revert ────────────────────────────────────────────────────

/**
 * Register `jjvs.revision.revert`.
 *
 * Creates a new revision whose changes are the exact inverse of the selected
 * revision, effectively undoing that revision's changes in the working copy.
 * The inverse revision is placed on top of the current working copy (`@`).
 *
 * This is equivalent to `jj revert -r <changeId> --onto @`.
 *
 * Note: Unlike `jj undo`, `revert` does not remove the original revision from
 * history — it creates a NEW revision that cancels out the original's effect.
 * Use the Operation Log's undo command to remove operations entirely.
 */
export function registerRevertRevisionCommand(
  getContext: () => RevisionCommandContext | undefined,
  revisionTreeView: vscode.TreeView<RevisionTreeItem | LoadMoreTreeItem>,
): vscode.Disposable {
  return vscode.commands.registerCommand('jjvs.revision.revert', async () => {
    const ctx = getContext();
    if (ctx === undefined) return;

    const treeSelection = getTreeSelection(revisionTreeView);

    const revision = await pickRevision(ctx.repository.revisions, {
      title: 'Revert Revision',
      placeholder: 'Select a revision to create an inverse of',
      ...(treeSelection !== undefined ? { activeChangeId: treeSelection.changeId } : {}),
    });

    if (revision === undefined) return;

    const shortId = revision.changeId.substring(0, 12);
    const firstLine =
      revision.description.trim() !== ''
        ? `"${revision.description.trim().split('\n')[0]}"`
        : '(no description)';

    const confirm = await vscode.window.showWarningMessage(
      `Create an inverse of ${shortId} ${firstLine} on top of the working copy?`,
      { modal: true },
      'Revert',
    );

    if (confirm !== 'Revert') return;

    await ctx.service.run({ title: 'Revert', showProgress: true }, (signal) =>
      ctx.cli.revert({
        revsets: [revision.changeId],
        destination: '@',
        signal,
      }),
    );
  });
}
