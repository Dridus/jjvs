/**
 * SCM provider for a single jj repository.
 *
 * Registers a VSCode `SourceControl` instance that shows the current working
 * copy changes in the Source Control panel. One `JjvsSCMProvider` is created
 * per discovered repository by `syncSCMProviders()` in `extension.ts`.
 *
 * ## Responsibilities
 * - Maintain the "Working Copy Changes" resource group from `jj status` data
 * - Drive the shared `JjFileDecorationProvider` with current file statuses
 * - Provide inline gutter diffs via `JjQuickDiffProvider`
 * - Wire the SCM input box to `jj describe` via `acceptInputCommand`
 * - Expose `isColocated` so Phase 10b can conditionally show git commands
 *
 * ## Deferred to later phases
 * - Open-diff command wired to resource state click (Phase 7)
 * - Command serialization via CommandService (Phase 7)
 */

import * as vscode from 'vscode';
import type { RepositoryState } from '../../core/repository';
import type { Logger } from '../output-channel';
import { fileChangeToResourceState } from './resource-groups';
import type { JjFileDecorationProvider } from './decorations';
import { JjQuickDiffProvider } from './quick-diff';

/**
 * Per-repository SCM provider bridging `RepositoryState` to VSCode's Source
 * Control view.
 */
export class JjvsSCMProvider implements vscode.Disposable {
  private readonly sourceControl: vscode.SourceControl;
  private readonly workingCopyGroup: vscode.SourceControlResourceGroup;
  private readonly subscriptions: vscode.Disposable[] = [];

  /**
   * Suppresses the next input box auto-population after a successful `describe`.
   *
   * After calling `jj describe`, we clear the input box and trigger a refresh.
   * Without this guard the post-refresh `updateInputBox()` would immediately
   * re-fill the box with the description we just set.
   */
  private _suppressNextInputUpdate = false;

  constructor(
    private readonly repository: RepositoryState,
    private readonly decorationProvider: JjFileDecorationProvider,
    private readonly logger: Logger,
  ) {
    this.sourceControl = vscode.scm.createSourceControl(
      'jjvs',
      'Jujutsu',
      vscode.Uri.file(repository.rootPath),
    );

    this.workingCopyGroup = this.sourceControl.createResourceGroup(
      'workingCopy',
      'Working Copy Changes',
    );
    // Hide the group header when there are no changes to reduce clutter.
    this.workingCopyGroup.hideWhenEmpty = true;

    // Wire inline gutter diffs for files in this repository.
    this.sourceControl.quickDiffProvider = new JjQuickDiffProvider(repository.rootPath);

    // The ✓ button (and Ctrl+Enter) in the SCM input box runs jj describe.
    // The rootPath argument lets the command handler look up the correct provider
    // when multiple repositories are open in the same workspace.
    this.sourceControl.acceptInputCommand = {
      command: 'jjvs.describeWorkingCopy',
      title: 'Describe Working Copy',
      arguments: [repository.rootPath],
    };

    this.sourceControl.inputBox.placeholder =
      'Describe the working copy (jj describe)';

    this.subscriptions.push(repository.onDidChange(() => this.updateResources()));

    // Reflect whatever state is already available (may be empty before first refresh).
    this.updateResources();
  }

  /** Absolute path to the repository root. */
  get rootPath(): string {
    return this.repository.rootPath;
  }

  /**
   * Whether the underlying repository is a colocated jj+git repository.
   * Used by Phase 10b to conditionally enable git push/fetch commands.
   */
  get isColocated(): boolean {
    return this.repository.kind === 'colocated';
  }

  private updateResources(): void {
    const status = this.repository.workingCopyStatus;

    if (status === undefined) {
      this.workingCopyGroup.resourceStates = [];
      this.decorationProvider.update(this.repository.rootPath, []);
      this.updateInputBox();
      return;
    }

    const { fileChanges } = status;

    this.workingCopyGroup.resourceStates = fileChanges.map((change) =>
      fileChangeToResourceState(this.repository.rootPath, change),
    );

    this.decorationProvider.update(this.repository.rootPath, fileChanges);

    this.logger.debug(
      `SCM: updated ${fileChanges.length} resource states for ${this.repository.rootPath}`,
    );

    this.updateInputBox();
  }

  /**
   * Pre-populate the SCM input box with the working copy description.
   *
   * Only runs when the box is empty to avoid clobbering in-progress text.
   * Skipped once after a successful `executeDescribe` to prevent the freshly-
   * set description from immediately re-filling the box.
   */
  private updateInputBox(): void {
    if (this._suppressNextInputUpdate) {
      this._suppressNextInputUpdate = false;
      return;
    }

    if (this.sourceControl.inputBox.value !== '') return;

    const workingCopyRevision = this.repository.revisions.find((r) => r.isWorkingCopy);
    if (workingCopyRevision !== undefined && workingCopyRevision.description !== '') {
      this.sourceControl.inputBox.value = workingCopyRevision.description;
    }
  }

  /**
   * Execute `jj describe` using the current SCM input box text.
   *
   * Called by the `jjvs.describeWorkingCopy` command, which is registered as
   * `sourceControl.acceptInputCommand`. The command is triggered when the user
   * clicks the ✓ button or presses Ctrl+Enter in the SCM input box.
   *
   * On success: clears the input box and triggers a repository refresh.
   * On failure: shows an error notification and logs to the output channel.
   */
  async executeDescribe(): Promise<void> {
    const text = this.sourceControl.inputBox.value.trim();
    if (text === '') return;

    const result = await this.repository.describe({ description: text });

    if (!result.ok) {
      this.logger.error(
        `jj describe failed for ${this.repository.rootPath}: ${result.error.message}`,
      );
      void vscode.window.showErrorMessage(`Jujutsu: ${result.error.message}`);
      return;
    }

    // Clear the box and suppress the next auto-population so the empty state
    // is visible, giving the user feedback that describe succeeded.
    this._suppressNextInputUpdate = true;
    this.sourceControl.inputBox.value = '';
    void this.repository.refresh();
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.workingCopyGroup.dispose();
    this.decorationProvider.clearRepository(this.repository.rootPath);
    this.sourceControl.dispose();
  }
}
