/**
 * Per-repository state aggregator.
 *
 * `RepositoryState` holds the latest fetched data for a single jj repository
 * and fires `onDidChange` events whenever the data is updated. UI components
 * (tree views, SCM provider, status bar) subscribe to these events to re-render.
 *
 * ## Refresh semantics
 *
 * - `refresh()` is idempotent if a refresh is already running. If a second
 *   refresh is requested while one is in progress, a follow-up refresh is
 *   scheduled to run immediately after the current one completes.
 *
 * - Read commands (`jj log`, `jj status`) are launched concurrently with
 *   `Promise.all()` to minimise latency.
 *
 * - Mutating commands (Phase 7+) acquire a per-repository command lock via
 *   the `withMutation()` guard, which prevents concurrent mutation and
 *   triggers a refresh on completion.
 *
 * ## Relationship to other components
 *
 * - `RepositoryState` is created and owned by `RepositoryManager`.
 * - `FileWatcher` (VSCode layer) calls `scheduleRefresh()` on `op_heads/` changes.
 * - `CommandService` (Phase 7) uses `withMutation()` to serialize commands.
 */

import type { JjCli } from './jj-cli';
import type { Revision, WorkingCopyStatus, RepoKind } from './types';
import { TypedEventEmitter, type Disposable } from './event-emitter';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Configuration snapshot passed from ConfigService (VSCode layer) to RepositoryState. */
export interface RepositoryStateConfig {
  /** Default revset expression for `jj log`. Empty string uses jj's default. */
  readonly revset: string;
  /** Maximum number of revisions to fetch per refresh cycle. */
  readonly logLimit: number;
  /** Debounce window in milliseconds for coalescing rapid refresh requests. */
  readonly refreshDebounceMs: number;
}

// ─── Events ───────────────────────────────────────────────────────────────────

/**
 * Discriminated union of events fired by `RepositoryState`.
 *
 * - `'changed'`: State has been updated (revisions, status, or both).
 * - `'refreshing'`: A refresh has started. UI can show a loading indicator.
 * - `'error'`: A refresh failed. The previous state is retained.
 */
export type RepositoryStateEvent =
  | { readonly kind: 'changed' }
  | { readonly kind: 'refreshing' }
  | { readonly kind: 'error'; readonly message: string };

// ─── RepositoryState ──────────────────────────────────────────────────────────

/**
 * Observable state for a single jj repository.
 *
 * Instances are created and owned by `RepositoryManager`. Never use a
 * module-level singleton — each repository has its own `RepositoryState`.
 */
export class RepositoryState implements Disposable {
  private readonly changeEmitter = new TypedEventEmitter<RepositoryStateEvent>();

  /** Subscribe to state change events. Returns a disposable subscription. */
  readonly onDidChange = this.changeEmitter.event;

  private _revisions: readonly Revision[] = [];
  private _workingCopyStatus: WorkingCopyStatus | undefined = undefined;
  private _isRefreshing = false;
  private _lastError: string | undefined = undefined;

  // Refresh scheduling state — ensures a follow-up refresh runs if one was
  // requested while a refresh was already in progress.
  private _refreshInProgress = false;
  private _refreshScheduled = false;

  // Debounce timer for coalescing rapid refresh requests.
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(
    /** Absolute path to the jj repository root (the directory containing `.jj/`). */
    readonly rootPath: string,
    /** Whether this repo is a native jj repo or a colocated jj+git repo. */
    readonly kind: RepoKind,
    private readonly cli: JjCli,
    private readonly config: RepositoryStateConfig,
  ) {}

  // ── Getters ────────────────────────────────────────────────────────────────

  /** The most recently fetched revision log entries. Empty before first refresh. */
  get revisions(): readonly Revision[] {
    return this._revisions;
  }

  /** The most recently fetched working copy status. `undefined` before first refresh. */
  get workingCopyStatus(): WorkingCopyStatus | undefined {
    return this._workingCopyStatus;
  }

  /** `true` while a refresh is in progress. */
  get isRefreshing(): boolean {
    return this._isRefreshing;
  }

  /** The most recent error message, if the last refresh failed. */
  get lastError(): string | undefined {
    return this._lastError;
  }

  // ── Refresh ────────────────────────────────────────────────────────────────

  /**
   * Trigger a debounced refresh.
   *
   * Multiple calls within `config.refreshDebounceMs` are coalesced into a
   * single refresh. Use this in response to file-system events.
   */
  scheduleRefresh(signal?: AbortSignal): void {
    if (this._debounceTimer !== undefined) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = undefined;
      void this.refresh(signal);
    }, this.config.refreshDebounceMs);
  }

  /**
   * Immediately trigger a refresh (no debounce).
   *
   * If a refresh is already running, schedules a follow-up refresh to run
   * immediately after the current one completes. This ensures the most recent
   * state is always reflected after commands that modify repo state.
   */
  async refresh(signal?: AbortSignal): Promise<void> {
    if (this._refreshInProgress) {
      this._refreshScheduled = true;
      return;
    }

    this._refreshInProgress = true;
    this._refreshScheduled = false;
    this._isRefreshing = true;
    this.changeEmitter.fire({ kind: 'refreshing' });

    try {
      await this.doRefresh(signal);
    } finally {
      this._refreshInProgress = false;
      this._isRefreshing = false;
      this.changeEmitter.fire({ kind: 'changed' });

      if (this._refreshScheduled) {
        // A refresh was requested while this one ran; run one more to capture
        // any changes that occurred during the current refresh.
        void this.refresh(signal);
      }
    }
  }

  private async doRefresh(signal: AbortSignal | undefined): Promise<void> {
    const logOptions = {
      ...(this.config.revset !== '' ? { revset: this.config.revset } : {}),
      limit: this.config.logLimit,
      ...(signal !== undefined ? { signal } : {}),
    };

    // Run log and status concurrently — both are read-only.
    const [revisionsResult, statusResult] = await Promise.all([
      this.cli.log(logOptions),
      this.cli.status(signal),
    ]);

    if (revisionsResult.ok) {
      this._revisions = revisionsResult.value;
    } else {
      this._lastError = revisionsResult.error.message;
      this.changeEmitter.fire({ kind: 'error', message: revisionsResult.error.message });
    }

    if (statusResult.ok) {
      this._workingCopyStatus = statusResult.value;
    } else if (this._lastError === undefined) {
      this._lastError = statusResult.error.message;
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  dispose(): void {
    if (this._debounceTimer !== undefined) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = undefined;
    }
    this.changeEmitter.dispose();
  }
}
