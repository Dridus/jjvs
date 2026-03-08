/**
 * GraphWebviewProvider — manages the jjvs revision graph webview panel.
 *
 * Shows an interactive SVG graph of the jj revision DAG. The graph updates
 * when the repository state changes, highlights the currently-selected
 * revision, and emits events when the user interacts with it.
 *
 * ## Lifecycle
 *
 * - The panel is created lazily on the first call to `show()`.
 * - `setRevisions()` buffers the latest data and forwards it to the panel
 *   when it is open.
 * - The panel is disposed when the user closes it; `show()` creates a new one.
 * - Calling `toggle()` opens the panel if closed, disposes it if open.
 *
 * ## Message protocol
 *
 * Extension → webview (`ExtensionToWebview`):
 *
 * | `loading`        | Content fetch in progress.                          |
 * | `update`         | New revision list and selected change ID.           |
 * | `error`          | Human-readable error description.                   |
 * | `selectRevision` | Programmatic selection sync (from tree view).       |
 *
 * Webview → extension (`WebviewToExtension`):
 *
 * | `ready`             | Webview mounted, ready to receive data.           |
 * | `revisionClicked`   | User clicked a revision node.                     |
 * | `contextMenuAction` | User chose an action from the context menu.       |
 *
 * ## Selection synchronization
 *
 * The graph selection and the revisions tree view selection are kept in sync
 * via two paths:
 *
 * 1. Tree view → graph: `setSelectedRevision(changeId)` sends a
 *    `selectRevision` message to update the graph highlight without reloading
 *    the full revision list.
 *
 * 2. Graph → extension: The `onDidSelectRevision` event fires when the user
 *    clicks a node. Extension activation code subscribes and propagates the
 *    selection to the details, evolog, and preview panels.
 *
 * ## Context menu
 *
 * Context menu actions from the webview are forwarded to the extension via the
 * `onDidContextMenuAction` event. The extension executes the corresponding
 * `jjvs.*` command; complex commands (rebase, squash) show their standard
 * pickers. Copy actions (copyChangeId, copyCommitId) are handled directly in
 * extension.ts using the `changeId` field carried by the event.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { Revision } from '../../../core/types';
import type { OutputChannelLogger } from '../../output-channel';
import { DisposableStore } from '../../disposable-store';

// ── Exported types ─────────────────────────────────────────────────────────────

/**
 * Context menu actions the graph webview can trigger.
 *
 * Must be kept in sync with `ContextMenuAction` in `webview-ui/graph/App.svelte`.
 */
export type GraphContextMenuAction =
  | 'edit'
  | 'newAfter'
  | 'describe'
  | 'squash'
  | 'rebase'
  | 'abandon'
  | 'copyChangeId'
  | 'copyCommitId';

/**
 * A serialized revision suitable for transmission to the graph webview.
 *
 * All fields are JSON-serializable (no `Date` objects). The `Date` timestamps
 * on `Revision.author.timestamp` are converted to ISO 8601 strings here.
 *
 * Must be kept in sync with `GraphRevision` in `webview-ui/graph/dag-layout.ts`.
 */
export interface GraphRevision {
  readonly changeId: string;
  readonly commitId: string;
  readonly description: string;
  readonly authorName: string;
  /** ISO 8601 timestamp string (author.timestamp.toISOString()). */
  readonly authorTimestamp: string;
  readonly parentChangeIds: readonly string[];
  readonly localBookmarks: readonly string[];
  /** Remote bookmarks in `"name@remote"` format. */
  readonly remoteBookmarks: readonly string[];
  readonly tags: readonly string[];
  readonly isWorkingCopy: boolean;
  readonly isEmpty: boolean;
  readonly isImmutable: boolean;
  readonly hasConflict: boolean;
  readonly isDivergent: boolean;
}

// ── Internal message protocol types ───────────────────────────────────────────

/** Messages sent from the extension host to the graph webview. */
type ExtensionToWebview =
  | { readonly type: 'loading' }
  | {
      readonly type: 'update';
      readonly revisions: readonly GraphRevision[];
      readonly selectedChangeId: string | null;
    }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'selectRevision'; readonly changeId: string | null };

/** Messages sent from the graph webview to the extension host. */
type WebviewToExtension =
  | { readonly type: 'ready' }
  | { readonly type: 'revisionClicked'; readonly changeId: string }
  | {
      readonly type: 'contextMenuAction';
      readonly changeId: string;
      readonly action: GraphContextMenuAction;
    }
  | {
      /**
       * User completed a drag-rebase gesture by dropping a revision onto
       * another. The extension should execute `jj rebase -r sourceChangeId
       * -d targetChangeId`.
       */
      readonly type: 'dragRebase';
      readonly sourceChangeId: string;
      readonly targetChangeId: string;
    };

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Convert a `Revision` from the core domain model to the serializable
 * `GraphRevision` format for transmission to the webview.
 */
function toGraphRevision(revision: Revision): GraphRevision {
  return {
    changeId: revision.changeId,
    commitId: revision.commitId,
    description: revision.description,
    authorName: revision.author.name,
    authorTimestamp: revision.author.timestamp.toISOString(),
    parentChangeIds: revision.parentChangeIds,
    localBookmarks: revision.localBookmarks.map((b) => b.name),
    remoteBookmarks: revision.remoteBookmarks.map((b) => `${b.name}@${b.remote}`),
    tags: revision.tags.map((t) => t.name),
    isWorkingCopy: revision.isWorkingCopy,
    isEmpty: revision.isEmpty,
    isImmutable: revision.isImmutable,
    hasConflict: revision.hasConflict,
    isDivergent: revision.isDivergent,
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Manages the lifecycle of the jjvs revision graph webview panel.
 *
 * Instantiated once in `extension.ts` and kept alive for the duration of the
 * extension activation. The panel itself is created and disposed on demand.
 */
export class GraphWebviewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined = undefined;

  /** Latest revision data buffered for sending when the panel opens or re-opens. */
  private currentRevisions: GraphRevision[] = [];
  private currentSelectedChangeId: string | null = null;

  private readonly store = new DisposableStore();

  private readonly _onDidSelectRevision = new vscode.EventEmitter<string>();
  /**
   * Fires when the user clicks a revision node in the graph.
   *
   * The emitted value is the change ID of the clicked revision. Subscribers
   * (in extension.ts) should use this to update the details view, evolog
   * view, and preview panel.
   */
  readonly onDidSelectRevision = this._onDidSelectRevision.event;

  private readonly _onDidContextMenuAction = new vscode.EventEmitter<{
    readonly changeId: string;
    readonly action: GraphContextMenuAction;
  }>();
  /**
   * Fires when the user selects an action from the graph context menu.
   *
   * Extension.ts handles the action by executing the corresponding `jjvs.*`
   * command. Copy actions (copyChangeId, copyCommitId) are handled directly
   * using the `changeId` field.
   */
  readonly onDidContextMenuAction = this._onDidContextMenuAction.event;

  private readonly _onDidDragRebase = new vscode.EventEmitter<{
    readonly sourceChangeId: string;
    readonly targetChangeId: string;
  }>();
  /**
   * Fires when the user completes a drag-rebase gesture in the graph.
   *
   * The source revision should be rebased so that the target revision becomes
   * its new parent: `jj rebase -r sourceChangeId -d targetChangeId`.
   */
  readonly onDidDragRebase = this._onDidDragRebase.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: OutputChannelLogger,
  ) {
    this.store.push(
      this._onDidSelectRevision,
      this._onDidContextMenuAction,
      this._onDidDragRebase,
    );
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Update the revision list displayed in the graph.
   *
   * If the panel is open, an `update` message is sent immediately.
   * If closed, the data is buffered and sent when the panel is next opened.
   *
   * @param revisions       - The latest revision list from the repository.
   * @param selectedChangeId - The currently-selected change ID, or null.
   */
  setRevisions(revisions: readonly Revision[], selectedChangeId: string | null): void {
    this.currentRevisions = revisions.map(toGraphRevision);
    this.currentSelectedChangeId = selectedChangeId;
    if (this.panel !== undefined) {
      this.sendUpdate();
    }
  }

  /**
   * Update the highlighted revision in the graph without reloading the
   * full revision list.
   *
   * Called when the user selects a revision in the tree view, to keep the
   * graph highlight synchronized.
   */
  setSelectedRevision(changeId: string | null): void {
    this.currentSelectedChangeId = changeId;
    if (this.panel !== undefined) {
      void this.panel.webview.postMessage({
        type: 'selectRevision',
        changeId,
      } satisfies ExtensionToWebview);
    }
  }

  /** The change ID of the revision currently selected in the graph, or null. */
  get selectedChangeId(): string | null {
    return this.currentSelectedChangeId;
  }

  /**
   * Open or reveal the graph panel.
   *
   * Creates the panel if it does not exist. Reveals it (without stealing
   * focus) if it is already open but not visible.
   */
  show(): void {
    if (this.panel !== undefined) {
      this.panel.reveal(vscode.ViewColumn.Beside, /* preserveFocus */ true);
      return;
    }
    this.createPanel();
    this.sendUpdate();
  }

  /**
   * Toggle the graph panel open or closed.
   *
   * - If closed: opens and loads the current revisions.
   * - If open: disposes the panel.
   */
  toggle(): void {
    if (this.panel !== undefined) {
      this.panel.dispose();
    } else {
      this.show();
    }
  }

  /** Whether the graph panel is currently open. */
  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  dispose(): void {
    this.panel?.dispose();
    this.store.dispose();
  }

  // ── Panel lifecycle ─────────────────────────────────────────────────────────

  private createPanel(): void {
    this.panel = vscode.window.createWebviewPanel(
      'jjvs.graph',
      'Jujutsu Graph',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
      },
    );

    const nonce = generateNonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webviews', 'graph', 'main.js'),
    );

    this.panel.webview.html = this.buildHtml(nonce, scriptUri);

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewToExtension) => this.handleWebviewMessage(message),
      undefined,
      this.context.subscriptions,
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.logger.debug('Graph panel disposed');
      },
      undefined,
      this.context.subscriptions,
    );

    this.logger.debug('Graph panel created');
  }

  // ── Message handling ────────────────────────────────────────────────────────

  private handleWebviewMessage(message: WebviewToExtension): void {
    if (message.type === 'ready') {
      // Webview has mounted — send the current revision data immediately
      // so the graph renders without waiting for the next repository refresh.
      this.sendUpdate();
    } else if (message.type === 'revisionClicked') {
      this.currentSelectedChangeId = message.changeId;
      this._onDidSelectRevision.fire(message.changeId);
    } else if (message.type === 'contextMenuAction') {
      this._onDidContextMenuAction.fire({
        changeId: message.changeId,
        action: message.action,
      });
    } else if (message.type === 'dragRebase') {
      this._onDidDragRebase.fire({
        sourceChangeId: message.sourceChangeId,
        targetChangeId: message.targetChangeId,
      });
    }
  }

  private sendUpdate(): void {
    if (this.panel === undefined) return;
    void this.panel.webview.postMessage({
      type: 'update',
      revisions: this.currentRevisions,
      selectedChangeId: this.currentSelectedChangeId,
    } satisfies ExtensionToWebview);
  }

  // ── HTML ────────────────────────────────────────────────────────────────────

  /**
   * Build the full HTML page for the graph webview.
   *
   * Content Security Policy:
   * - `script-src`: scripts served from `webview.cspSource` only (the
   *   extension's `dist/` directory via `vscode-resource:`).
   * - `style-src`: `webview.cspSource` plus `'unsafe-inline'` for the
   *   CSS-in-JS injected by esbuild-svelte at runtime.
   * - All other sources are denied by `default-src 'none'`.
   */
  private buildHtml(nonce: string, scriptUri: vscode.Uri): string {
    // safe: buildHtml is only called from createPanel(), which assigns
    // this.panel immediately before calling this method.
    const panel = this.panel as vscode.WebviewPanel;
    const csp = panel.webview.cspSource;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             script-src ${csp} 'nonce-${nonce}';
             style-src ${csp} 'unsafe-inline';" />
  <title>Jujutsu Graph</title>
</head>
<body>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** Generate a cryptographically random nonce for the Content Security Policy. */
function generateNonce(): string {
  return crypto.randomBytes(16).toString('base64');
}
