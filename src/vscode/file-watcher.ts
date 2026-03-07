/**
 * File watcher for jj repository state changes.
 *
 * Watches `<repoRoot>/.jj/op_heads/` for file-system changes to detect when
 * jj operations have been performed. When a change is detected, `onDidChange`
 * fires so the `RepositoryManager` can call `scheduleRefresh()`.
 *
 * ## Self-command suppression
 *
 * Commands executed by jjvs itself should not trigger a redundant UI refresh
 * because jjvs already refreshes explicitly after mutations. Self-commands are
 * suppressed using a "command-in-flight" lock:
 *
 * 1. Before executing a jj command, call `suppressNextChange()`.
 * 2. The first file-system event after `suppressNextChange()` is discarded.
 * 3. If no event arrives within `SUPPRESSION_TIMEOUT_MS`, the suppression
 *    is automatically released so the watcher doesn't get permanently stuck.
 *
 * ## Fallback polling
 *
 * If the workspace is on a file system that doesn't support native file
 * watching (e.g., NFS, WSL1), VSCode's `FileSystemWatcher` may not fire
 * reliably. A polling fallback runs at `fallbackIntervalMs` to ensure the
 * UI stays current.
 *
 * ## Multiple repositories
 *
 * Create one `FileWatcher` per `RepositoryState`. `RepositoryManager` owns
 * all watchers and disposes them when a repo is removed from the workspace.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TypedEventEmitter, type Disposable } from '../core/event-emitter';

/** How long (ms) to wait for the file-system event after suppressing a change. */
const SUPPRESSION_TIMEOUT_MS = 5_000;

// ─── FileWatcher ──────────────────────────────────────────────────────────────

export class FileWatcher implements Disposable {
  private readonly changeEmitter = new TypedEventEmitter<void>();

  /** Fires when a jj operation has modified the repository state. */
  readonly onDidChange = this.changeEmitter.event;

  private readonly watcher: vscode.FileSystemWatcher | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly fallbackTimer: ReturnType<typeof setInterval> | undefined;

  private _suppressionTimer: ReturnType<typeof setTimeout> | undefined;
  private _isSuppressed = false;
  private _lastModTime = 0;

  constructor(
    /** Absolute path to the jj repository root (containing `.jj/`). */
    private readonly rootPath: string,
    /** Fallback polling interval in ms. Set to `0` to disable polling. */
    fallbackIntervalMs: number = 3000,
  ) {
    const opHeadsPattern = new vscode.RelativePattern(
      path.join(rootPath, '.jj', 'op_heads'),
      '**/*',
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(opHeadsPattern);

    const handler = (): void => this.handleChange();
    this.subscriptions.push(
      this.watcher.onDidChange(handler),
      this.watcher.onDidCreate(handler),
      this.watcher.onDidDelete(handler),
    );

    if (fallbackIntervalMs > 0) {
      this.fallbackTimer = setInterval(() => this.pollForChanges(), fallbackIntervalMs);
    }
  }

  /**
   * Suppress the next file-system change event.
   *
   * Call this before executing a jj command from jjvs to prevent a redundant
   * refresh. The suppression is automatically released after `SUPPRESSION_TIMEOUT_MS`
   * in case the command does not produce a file-system event.
   */
  suppressNextChange(): void {
    this._isSuppressed = true;

    if (this._suppressionTimer !== undefined) {
      clearTimeout(this._suppressionTimer);
    }

    this._suppressionTimer = setTimeout(() => {
      this._isSuppressed = false;
      this._suppressionTimer = undefined;
    }, SUPPRESSION_TIMEOUT_MS);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private handleChange(): void {
    if (this._isSuppressed) {
      // Consume the suppression and clear the timeout
      this._isSuppressed = false;
      if (this._suppressionTimer !== undefined) {
        clearTimeout(this._suppressionTimer);
        this._suppressionTimer = undefined;
      }
      return;
    }

    this.changeEmitter.fire(undefined);
  }

  /**
   * Fallback: poll `op_heads/` modification time.
   *
   * Fires `onDidChange` if the directory mtime has advanced since the last poll.
   * This handles file systems where native events are unreliable.
   */
  private pollForChanges(): void {
    const opHeadsPath = path.join(this.rootPath, '.jj', 'op_heads');
    try {
      const stat = fs.statSync(opHeadsPath);
      const mtime = stat.mtimeMs;
      if (mtime > this._lastModTime) {
        const previous = this._lastModTime;
        this._lastModTime = mtime;
        // Skip the very first poll to avoid a spurious refresh on startup.
        // `previous === 0` means this is the initial observation; just record
        // the current mtime as a baseline without firing a change event.
        if (previous !== 0) {
          this.handleChange();
        }
      }
    } catch {
      // op_heads/ may not exist if this is not a valid jj repo root — ignore
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  dispose(): void {
    if (this._suppressionTimer !== undefined) {
      clearTimeout(this._suppressionTimer);
      this._suppressionTimer = undefined;
    }
    if (this.fallbackTimer !== undefined) {
      clearInterval(this.fallbackTimer);
    }
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
    this.watcher?.dispose();
    this.changeEmitter.dispose();
  }
}
