import type * as vscode from 'vscode';

/**
 * A container for `vscode.Disposable` objects that can all be disposed together.
 *
 * Prefer this over tracking raw `vscode.Disposable[]` arrays in service classes.
 * The single `dispose()` call makes it easy to register the store itself with
 * `context.subscriptions`, eliminating the category of bugs where an event
 * listener or watcher is forgotten during cleanup.
 *
 * Usage:
 * ```ts
 * class MyService implements vscode.Disposable {
 *   private readonly store = new DisposableStore();
 *
 *   constructor() {
 *     this.store.push(
 *       vscode.workspace.onDidChangeConfiguration(() => this.onConfigChange()),
 *       vscode.window.onDidChangeActiveTextEditor(() => this.onEditorChange()),
 *     );
 *   }
 *
 *   dispose(): void { this.store.dispose(); }
 * }
 * ```
 */
export class DisposableStore implements vscode.Disposable {
  private readonly _items: vscode.Disposable[] = [];

  /**
   * Add one or more disposables to the store.
   * Returns the first argument for chaining when adding a single item.
   */
  push(...items: vscode.Disposable[]): void {
    this._items.push(...items);
  }

  /** Dispose all tracked items and clear the store. */
  dispose(): void {
    for (const item of this._items) {
      item.dispose();
    }
    this._items.length = 0;
  }
}
