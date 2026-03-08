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
 * - Expose `isColocated` so Phase 10b can conditionally show git commands
 *
 * ## Deferred to later phases
 * - `acceptInputCommand` / jj describe from SCM input box (Phase 5b)
 * - `QuickDiffProvider` for inline gutter diffs (Phase 5b)
 * - Open-diff command wired to resource state click (Phase 7)
 */

import * as vscode from 'vscode';
import type { RepositoryState } from '../../core/repository';
import type { Logger } from '../output-channel';
import { fileChangeToResourceState } from './resource-groups';
import type { JjFileDecorationProvider } from './decorations';

/**
 * Per-repository SCM provider bridging `RepositoryState` to VSCode's Source
 * Control view.
 */
export class JjvsSCMProvider implements vscode.Disposable {
  private readonly sourceControl: vscode.SourceControl;
  private readonly workingCopyGroup: vscode.SourceControlResourceGroup;
  private readonly subscriptions: vscode.Disposable[] = [];

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

    // Phase 5b: set sourceControl.acceptInputCommand to jjvs.describe

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
