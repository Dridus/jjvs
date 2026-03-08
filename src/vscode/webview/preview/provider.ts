/**
 * PreviewPanelProvider — manages the jjvs preview webview panel.
 *
 * Shows `jj show <changeId>` output with ANSI color rendering in a Svelte
 * webview panel. The panel auto-updates when the revision selection changes
 * in the Revisions tree view.
 *
 * ## Lifecycle
 *
 * - The panel is created lazily on the first call to `show()`.
 * - If the panel is already open, `show()` reveals it.
 * - Calling `toggle()` opens the panel if it is closed, or disposes it if open.
 * - The panel is fully disposed when the user closes it; subsequent calls to
 *   `show()` create a fresh panel.
 *
 * ## Message protocol (extension → webview)
 *
 * | Message type | Fields          | Meaning                              |
 * |--------------|-----------------|--------------------------------------|
 * | `loading`    | —               | Content fetch in progress (spinner)  |
 * | `update`     | `content`       | Rendered ANSI text to display        |
 * | `error`      | `message`       | Human-readable error description     |
 *
 * No messages are sent from webview to extension in this phase.
 *
 * ## Position configuration
 *
 * Controlled by the `jjvs.preview.position` setting:
 * - `"auto"` (default): opens beside the active editor when one is open;
 *   falls back to `ViewColumn.Two` otherwise.
 * - `"beside"`: always opens in `ViewColumn.Beside`.
 * - `"below"`: same as beside (VSCode does not natively support a
 *   fixed-below position for webview panels).
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { JjCli } from '../../../core/jj-cli';
import type { Revision } from '../../../core/types';
import type { RepositoryState } from '../../../core/repository';
import type { ConfigService } from '../../config';
import type { OutputChannelLogger } from '../../output-channel';
import { DisposableStore } from '../../disposable-store';

/**
 * Messages sent from the extension host to the preview webview.
 *
 * `changeId` is included in `update` messages so the webview can distinguish
 * between a new revision being selected (different changeId → scroll to top)
 * and the same revision being re-loaded after an auto-refresh (same changeId →
 * preserve the user's current scroll position).
 */
type WebviewMessage =
  | { readonly type: 'loading' }
  | { readonly type: 'update'; readonly content: string; readonly changeId: string }
  | { readonly type: 'error'; readonly message: string };

/**
 * Factory that creates a color-enabled `JjCli` for a given repository root path.
 * Used by the provider to obtain `jj show --color always` output.
 */
export type ColorCliFactory = (rootPath: string) => JjCli;

/**
 * Manages the lifecycle of the jjvs preview webview panel.
 *
 * Instantiated once in `extension.ts` and kept alive for the duration of the
 * extension activation. The panel itself is created/disposed on demand.
 */
export class PreviewPanelProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined = undefined;
  private currentRevision: Revision | null = null;
  private currentRepository: RepositoryState | null = null;

  /** Stale-request guard: the changeId whose fetch is currently in-flight. */
  private loadingForChangeId: string | undefined = undefined;

  private readonly store = new DisposableStore();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly configService: ConfigService,
    private readonly colorCliFactory: ColorCliFactory,
    private readonly logger: OutputChannelLogger,
  ) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Update the revision shown in the preview panel.
   *
   * If the panel is open, its content is refreshed immediately.
   * If the panel is closed, the revision is stored so the correct content
   * appears when the panel is next opened.
   *
   * @param revision   - The revision to preview, or `null` to clear.
   * @param repository - The repository owning this revision, or `null`.
   */
  setRevision(revision: Revision | null, repository: RepositoryState | null): void {
    this.currentRevision = revision;
    this.currentRepository = repository;

    if (this.panel !== undefined) {
      this.loadContent();
    }
  }

  /**
   * Open or reveal the preview panel.
   *
   * Creates the panel if it does not exist. Reveals it (without stealing focus)
   * if it is already open but not visible.
   */
  show(): void {
    if (this.panel !== undefined) {
      this.panel.reveal(this.resolveViewColumn(), /* preserveFocus */ true);
      return;
    }

    this.createPanel();
    this.loadContent();
  }

  /**
   * Toggle the preview panel open or closed.
   *
   * - If closed: opens and loads the current revision.
   * - If open: disposes the panel (closes it).
   */
  toggle(): void {
    if (this.panel !== undefined) {
      this.panel.dispose();
    } else {
      this.show();
    }
  }

  /** Whether the preview panel is currently open. */
  get isOpen(): boolean {
    return this.panel !== undefined;
  }

  dispose(): void {
    this.panel?.dispose();
    this.store.dispose();
  }

  // ── Panel lifecycle ────────────────────────────────────────────────────────

  private createPanel(): void {
    const column = this.resolveViewColumn();

    this.panel = vscode.window.createWebviewPanel(
      'jjvs.preview',
      'Jujutsu Preview',
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
      },
    );

    const nonce = generateNonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webviews', 'preview', 'main.js'),
    );

    this.panel.webview.html = this.buildHtml(nonce, scriptUri);

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.loadingForChangeId = undefined;
        this.logger.debug('Preview panel disposed');
      },
      undefined,
      this.context.subscriptions,
    );

    this.logger.debug('Preview panel created');
  }

  // ── Content loading ────────────────────────────────────────────────────────

  private loadContent(): void {
    const panel = this.panel;
    if (panel === undefined) return;

    if (this.currentRevision === null || this.currentRepository === null) {
      void panel.webview.postMessage({
        type: 'update',
        content: '',
        changeId: '',
      } satisfies WebviewMessage);
      return;
    }

    const { changeId } = this.currentRevision;
    const rootPath = this.currentRepository.rootPath;

    this.loadingForChangeId = changeId;
    void panel.webview.postMessage({ type: 'loading' } satisfies WebviewMessage);

    const cli = this.colorCliFactory(rootPath);

    void cli.showWithColor(changeId).then((result) => {
      if (this.loadingForChangeId !== changeId || this.panel === undefined) return;
      this.loadingForChangeId = undefined;

      if (result.ok) {
        void this.panel.webview.postMessage({
          type: 'update',
          content: result.value,
          changeId,
        } satisfies WebviewMessage);
      } else {
        const msg =
          result.error.kind === 'not-found'
            ? 'jj binary not found'
            : result.error.kind === 'cancelled'
              ? ''
              : result.error.message;

        if (msg !== '') {
          void this.panel.webview.postMessage({
            type: 'error',
            message: msg,
          } satisfies WebviewMessage);
        }
      }
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Resolve the view column for opening the panel.
   *
   * - `"beside"` or `"auto"` with an active editor: `ViewColumn.Beside`
   * - `"auto"` with no active editor: `ViewColumn.Two`
   * - `"below"`: `ViewColumn.Beside` (VSCode has no fixed-below column for panels)
   */
  private resolveViewColumn(): vscode.ViewColumn {
    const position = this.configService.previewPosition;
    if (position === 'beside') return vscode.ViewColumn.Beside;
    if (position === 'below') return vscode.ViewColumn.Beside;
    // 'auto': prefer beside the active editor, otherwise open in column 2
    return vscode.window.activeTextEditor !== undefined
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.Two;
  }

  /**
   * Build the full HTML page for the webview.
   *
   * The Content Security Policy:
   * - `script-src`: allows only scripts loaded from `webview.cspSource` (the
   *   extension's `dist/` directory served via `vscode-resource:` or
   *   `https://file+.vscode-resource.vscode-cdn.net`).
   * - `style-src`: allows `webview.cspSource` plus `'unsafe-inline'` for
   *   the CSS-in-JS that esbuild-svelte injects at runtime.
   * - All other sources are denied by `default-src 'none'`.
   */
  private buildHtml(nonce: string, scriptUri: vscode.Uri): string {
    // safe: buildHtml is only called from createPanel(), which assigns this.panel
    // immediately before calling this method.
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
  <title>Jujutsu Preview</title>
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
