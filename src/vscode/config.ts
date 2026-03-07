/**
 * ConfigService — typed accessor for `jjvs.*` workspace settings.
 *
 * All jjvs settings are read through this service. It provides:
 *
 * - Typed getters that map raw VSCode configuration values to well-typed data.
 * - An `onDidChangeConfig` event that fires when any `jjvs.*` setting changes.
 * - A `getRepositoryConfig()` method that returns a `RepositoryStateConfig`
 *   suitable for passing to `RepositoryManager` and `RepositoryState`.
 *
 * ## Usage
 *
 * ```typescript
 * const config = new ConfigService(context);
 * const jjPath = config.jjPath;
 * config.onDidChangeConfig(() => {
 *   // re-read settings, update components
 * });
 * context.subscriptions.push(config);
 * ```
 *
 * ## Resource-scoped settings
 *
 * Settings with `"scope": "resource"` can differ per workspace folder.
 * Use `getForResource(uri)` to obtain folder-specific values.
 */

import * as vscode from 'vscode';
import { TypedEventEmitter } from '../core/event-emitter';
import { logLevelFromString } from './output-channel';
import type { RepositoryManagerConfig } from '../core/repository-manager';

/** Refresh debounce default (ms). Kept as a constant to avoid magic numbers. */
const DEFAULT_REFRESH_DEBOUNCE_MS = 300;

// ─── ConfigService ────────────────────────────────────────────────────────────

export class ConfigService implements vscode.Disposable {
  private readonly changeEmitter = new TypedEventEmitter<void>();
  private readonly configChangeDisposable: vscode.Disposable;

  /** Fires whenever any `jjvs.*` configuration setting changes. */
  readonly onDidChangeConfig = this.changeEmitter.event;

  constructor() {
    this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('jjvs')) {
        this.changeEmitter.fire(undefined);
      }
    });
  }

  // ── Global / machine settings ──────────────────────────────────────────────

  /** Path to the `jj` binary (defaults to `'jj'` to use PATH resolution). */
  get jjPath(): string {
    return this.get<string>('jjPath') ?? 'jj';
  }

  /** VSCode log level derived from the `jjvs.logLevel` string setting. */
  get logLevel(): vscode.LogLevel {
    return logLevelFromString(this.get<string>('logLevel') ?? 'info');
  }

  /** Rendering style for the revision graph. */
  get graphStyle(): 'text' | 'webview' {
    const value = this.get<string>('graphStyle');
    return value === 'webview' ? 'webview' : 'text';
  }

  /** Position for the preview panel. */
  get previewPosition(): 'auto' | 'beside' | 'below' {
    const value = this.get<string>('preview.position');
    return value === 'beside' ? 'beside' : value === 'below' ? 'below' : 'auto';
  }

  /** Whether to open the preview panel automatically on activation. */
  get previewShowOnStart(): boolean {
    return this.get<boolean>('preview.showOnStart') ?? false;
  }

  // ── Resource-scoped settings ───────────────────────────────────────────────

  /**
   * Default revset expression.
   * Resource-scoped: may differ per workspace folder.
   */
  getRevset(resource?: vscode.Uri): string {
    return this.getForResource<string>('revset', resource) ?? '';
  }

  /**
   * Maximum number of revisions to load per refresh.
   * Resource-scoped: may differ per workspace folder.
   */
  getLogLimit(resource?: vscode.Uri): number {
    return this.getForResource<number>('logLimit', resource) ?? 50;
  }

  /**
   * Maximum number of operations to show in the op log.
   * Resource-scoped: may differ per workspace folder.
   */
  getOplogLimit(resource?: vscode.Uri): number {
    return this.getForResource<number>('oplogLimit', resource) ?? 200;
  }

  /**
   * Default remote name for git operations.
   * Resource-scoped: may differ per workspace folder.
   */
  getDefaultRemote(resource?: vscode.Uri): string {
    return this.getForResource<string>('git.defaultRemote', resource) ?? 'origin';
  }

  /**
   * Whether to automatically refresh views on file-system changes.
   * Resource-scoped: may differ per workspace folder.
   */
  getAutoRefresh(resource?: vscode.Uri): boolean {
    return this.getForResource<boolean>('autoRefresh', resource) ?? true;
  }

  /**
   * Polling fallback interval in ms for auto-refresh when file watching is unavailable.
   * Resource-scoped: may differ per workspace folder.
   */
  getAutoRefreshInterval(resource?: vscode.Uri): number {
    return this.getForResource<number>('autoRefreshInterval', resource) ?? 3000;
  }

  // ── Config aggregates ──────────────────────────────────────────────────────

  /**
   * Returns a `RepositoryManagerConfig` snapshot for the given workspace folder.
   *
   * Pass a folder URI to get resource-scoped settings for that folder.
   * Pass `undefined` to use global defaults.
   */
  getRepositoryConfig(resource?: vscode.Uri): RepositoryManagerConfig {
    return {
      revset: this.getRevset(resource),
      logLimit: this.getLogLimit(resource),
      refreshDebounceMs: DEFAULT_REFRESH_DEBOUNCE_MS,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  dispose(): void {
    this.configChangeDisposable.dispose();
    this.changeEmitter.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private get<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('jjvs').get<T>(key);
  }

  private getForResource<T>(key: string, resource?: vscode.Uri): T | undefined {
    return vscode.workspace.getConfiguration('jjvs', resource).get<T>(key);
  }
}
