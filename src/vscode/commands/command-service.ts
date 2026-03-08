/**
 * CommandService — centralized command execution for mutating jj operations.
 *
 * All user-facing mutating commands go through `CommandService.run()` to ensure:
 * - The file watcher's next event is suppressed (prevents double refresh)
 * - Progress is shown for long-running operations
 * - jj errors are converted to user-facing error messages and logged
 * - The repository is refreshed after a successful mutation
 * - Concurrent interactive commands are blocked with a friendly message
 *
 * Per CLAUDE.md: "Commands go through CommandService. All user-facing commands
 * are registered via CommandService, which handles progress indication for
 * long-running operations, error display and logging, post-command refresh,
 * command serialization."
 */

import * as vscode from 'vscode';
import type { Result } from '../../core/result';
import type { JjError } from '../../core/jj-runner';
import type { RepositoryState } from '../../core/repository';
import type { FileWatcher } from '../file-watcher';
import type { Logger } from '../output-channel';

/** Options for a single command execution. */
export interface CommandExecutionOptions {
  /** Human-readable title shown in progress notifications and error messages. */
  readonly title: string;
  /**
   * If true, show a cancellable progress notification in the Notification area.
   * Use for operations that may take >500ms (e.g., rebase on large repos).
   * Defaults to false.
   */
  readonly showProgress?: boolean;
}

/**
 * Centralized command execution service scoped to a single repository.
 *
 * Create one `CommandService` per `RepositoryState`. All mutating jj commands
 * must execute through `run()` to satisfy the architecture constraints in CLAUDE.md.
 */
export class CommandService {
  /** True while a command is executing; used to prevent concurrent interactive commands. */
  private _isRunning = false;

  constructor(
    private readonly repository: RepositoryState,
    private readonly fileWatcher: FileWatcher | undefined,
    private readonly logger: Logger,
  ) {}

  /** Whether a command is currently executing for this repository. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Execute a mutating jj command.
   *
   * Handles file-watcher suppression, optional progress UI, error display,
   * and post-command refresh. If a command is already running, shows a warning
   * and returns `false` rather than queuing a second command.
   *
   * @param options - Display and progress options.
   * @param action - The async operation. Receives an `AbortSignal` that is
   *                 cancelled when the user presses Cancel in the progress UI.
   * @returns `true` if the command succeeded; `false` if it failed or was cancelled.
   */
  async run(
    options: CommandExecutionOptions,
    action: (signal: AbortSignal) => Promise<Result<void, JjError>>,
  ): Promise<boolean> {
    if (this._isRunning) {
      void vscode.window.showWarningMessage(
        'A jj operation is already in progress. Please wait for it to complete.',
      );
      return false;
    }

    this._isRunning = true;
    // Suppress the file watcher's next event. jjvs triggers an explicit
    // refresh after mutation, so the fs event would otherwise cause a
    // redundant second refresh cycle.
    this.fileWatcher?.suppressNextChange();

    const abortController = new AbortController();

    try {
      let result: Result<void, JjError>;

      if (options.showProgress === true) {
        result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Jujutsu: ${options.title}`,
            cancellable: true,
          },
          async (_progress, token) => {
            token.onCancellationRequested(() => abortController.abort());
            return action(abortController.signal);
          },
        );
      } else {
        result = await action(abortController.signal);
      }

      if (!result.ok) {
        const error = result.error;
        if (error.kind === 'cancelled') {
          this.logger.debug(`Command "${options.title}" was cancelled`);
          return false;
        }
        const message = formatJjError(options.title, error);
        this.logger.error(message);
        void vscode.window.showErrorMessage(message);
        return false;
      }

      this.logger.debug(`Command "${options.title}" succeeded`);
      void this.repository.refresh();
      return true;
    } finally {
      this._isRunning = false;
    }
  }
}

// ─── Error formatting ─────────────────────────────────────────────────────────

/**
 * Format a `JjError` into a user-readable error message.
 *
 * For non-zero exits, jj's stderr contains the actionable error text
 * (e.g., "Revision `xyz` is immutable"). We surface that directly rather
 * than wrapping it in a generic message.
 */
function formatJjError(commandTitle: string, error: JjError): string {
  switch (error.kind) {
    case 'not-found':
      return `Jujutsu: jj binary not found. Set jjvs.jjPath in settings.`;
    case 'timeout':
      return `Jujutsu: "${commandTitle}" timed out after ${error.timeoutMs}ms.`;
    case 'cancelled':
      return `Jujutsu: "${commandTitle}" was cancelled.`;
    case 'non-zero-exit': {
      const detail = error.stderr.trim() !== '' ? error.stderr.trim() : error.message;
      return `Jujutsu: ${commandTitle} failed — ${detail}`;
    }
    case 'unknown':
      return `Jujutsu: "${commandTitle}" failed — ${error.message}`;
    default: {
      const _exhaustive: never = error;
      void _exhaustive;
      return `Jujutsu: "${commandTitle}" failed.`;
    }
  }
}
