<script lang="ts">
  import {
    computeLayout,
    type GraphRevision,
    type LayoutNode,
    type LayoutEdge,
    type DagLayout,
  } from './dag-layout.js';

  // ── Type declarations ───────────────────────────────────────────────────────

  /** Messages sent from the extension host to this webview. */
  type ExtensionMessage =
    | { readonly type: 'loading' }
    | {
        readonly type: 'update';
        readonly revisions: readonly GraphRevision[];
        readonly selectedChangeId: string | null;
      }
    | { readonly type: 'error'; readonly message: string }
    | { readonly type: 'selectRevision'; readonly changeId: string | null };

  /** Actions the user can trigger from the context menu. */
  type ContextMenuAction =
    | 'edit'
    | 'newAfter'
    | 'describe'
    | 'squash'
    | 'rebase'
    | 'abandon'
    | 'copyChangeId'
    | 'copyCommitId';

  type ContextMenuState = {
    readonly x: number;
    readonly y: number;
    readonly changeId: string;
    readonly isImmutable: boolean;
    readonly isWorkingCopy: boolean;
  };

  type ViewState = 'empty' | 'loading' | 'content' | 'error';

  // ── VSCode API ──────────────────────────────────────────────────────────────

  // acquireVsCodeApi is injected by the VSCode webview host at runtime.
  // safe: this global is always present in VSCode webview contexts.
  declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };

  const vscode = acquireVsCodeApi();

  // ── State ───────────────────────────────────────────────────────────────────

  let viewState: ViewState = $state('empty');
  let revisions: GraphRevision[] = $state([]);
  let selectedChangeId: string | null = $state(null);
  let errorText = $state('');
  let contextMenu: ContextMenuState | null = $state(null);

  // ── Layout ──────────────────────────────────────────────────────────────────

  const layout: DagLayout = $derived(computeLayout(revisions));

  // ── Display constants ───────────────────────────────────────────────────────

  /** Horizontal spacing between graph columns, in pixels. */
  const COL_WIDTH = 18;
  /** Vertical spacing between graph rows, in pixels. */
  const ROW_HEIGHT = 32;
  /** Radius of a revision node circle, in pixels. */
  const NODE_RADIUS = 5;
  /** Horizontal padding added on each side of the SVG. */
  const SVG_PADDING = 4;

  const svgWidth = $derived((layout.maxColumn + 1) * COL_WIDTH + SVG_PADDING * 2);
  const svgHeight = $derived(Math.max(layout.nodes.length * ROW_HEIGHT, 1));

  // ── Coordinate helpers ──────────────────────────────────────────────────────

  function nodeX(col: number): number {
    return SVG_PADDING + col * COL_WIDTH + COL_WIDTH / 2;
  }

  function nodeY(row: number): number {
    return row * ROW_HEIGHT + ROW_HEIGHT / 2;
  }

  /**
   * Build an SVG path `d` attribute for a parent-child edge.
   *
   * Edges between the same column are straight vertical lines. Edges between
   * different columns use a symmetric cubic bezier that starts and ends
   * vertically, with the inflection point at the midpoint between the two rows.
   * This produces smooth S-curves for branching and merging edges.
   */
  function edgePath(edge: LayoutEdge): string {
    const x1 = nodeX(edge.fromColumn);
    const y1 = nodeY(edge.fromRow);
    const x2 = nodeX(edge.toColumn);
    const y2 = nodeY(edge.toRow);
    if (edge.fromColumn === edge.toColumn) {
      return `M${x1},${y1} L${x2},${y2}`;
    }
    const midY = (y1 + y2) / 2;
    return `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  }

  // ── Message handling ────────────────────────────────────────────────────────

  $effect(() => {
    const handler = (event: MessageEvent<ExtensionMessage>): void => {
      const msg = event.data;
      if (msg.type === 'loading') {
        viewState = 'loading';
      } else if (msg.type === 'update') {
        // Spread into a new array to make it mutable for $state.
        revisions = [...msg.revisions];
        selectedChangeId = msg.selectedChangeId;
        viewState = revisions.length === 0 ? 'empty' : 'content';
      } else if (msg.type === 'error') {
        errorText = msg.message;
        viewState = 'error';
      } else if (msg.type === 'selectRevision') {
        selectedChangeId = msg.changeId;
      }
    };

    window.addEventListener('message', handler);
    // Signal readiness so the extension sends the initial revision data.
    vscode.postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  });

  // ── Interaction ─────────────────────────────────────────────────────────────

  function selectRevision(changeId: string): void {
    selectedChangeId = changeId;
    contextMenu = null;
    vscode.postMessage({ type: 'revisionClicked', changeId });
  }

  function openContextMenu(event: MouseEvent, node: LayoutNode): void {
    event.preventDefault();
    event.stopPropagation();
    contextMenu = {
      x: event.clientX,
      y: event.clientY,
      changeId: node.revision.changeId,
      isImmutable: node.revision.isImmutable,
      isWorkingCopy: node.revision.isWorkingCopy,
    };
  }

  function dispatchContextAction(action: ContextMenuAction): void {
    if (contextMenu === null) return;
    const { changeId } = contextMenu;
    contextMenu = null;
    vscode.postMessage({ type: 'contextMenuAction', changeId, action });
  }

  function dismissContextMenu(event: MouseEvent): void {
    // Dismiss context menu on clicks outside it.
    contextMenu = null;
    event.stopPropagation();
  }

  function onRootKeyDown(event: KeyboardEvent): void {
    if (contextMenu !== null) {
      if (event.key === 'Escape') {
        contextMenu = null;
        event.stopPropagation();
      }
      return;
    }

    if (layout.nodes.length === 0) return;

    const currentIndex =
      selectedChangeId !== null
        ? layout.nodes.findIndex((n) => n.revision.changeId === selectedChangeId)
        : -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = layout.nodes[Math.min(currentIndex + 1, layout.nodes.length - 1)];
      if (next !== undefined) selectRevision(next.revision.changeId);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = layout.nodes[Math.max(currentIndex - 1, 0)];
      if (prev !== undefined) selectRevision(prev.revision.changeId);
    }
  }

  // ── Display helpers ─────────────────────────────────────────────────────────

  function shortId(changeId: string): string {
    return changeId.substring(0, 8);
  }

  function formatTimestamp(isoString: string): string {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime();
      if (diffMs < 60_000) return 'just now';
      if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
      if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
      if (diffMs < 2_592_000_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
      return new Date(isoString).toLocaleDateString();
    } catch {
      return '';
    }
  }

  function firstLine(description: string): string {
    const trimmed = description.trim();
    if (trimmed === '') return '(no description)';
    const nl = trimmed.indexOf('\n');
    return nl >= 0 ? trimmed.substring(0, nl) : trimmed;
  }

  /** Accessible label for a graph node circle. */
  function nodeAriaLabel(node: LayoutNode): string {
    const prefix = node.revision.isWorkingCopy ? 'Working copy: ' : '';
    const desc = firstLine(node.revision.description);
    return `${prefix}${desc} (${shortId(node.revision.changeId)})`;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="graph-root"
  onclick={dismissContextMenu}
  onkeydown={onRootKeyDown}
  role="presentation"
  tabindex="-1"
>
  {#if viewState === 'empty'}
    <p class="status">No revisions to display. Open a jj repository to view the graph.</p>
  {:else if viewState === 'loading'}
    <p class="status loading">Loading revision graph…</p>
  {:else if viewState === 'error'}
    <p class="status error">{errorText}</p>
  {:else}
    <div class="graph-body">
      <!--
        SVG graph column: edges and node circles drawn at the correct row/column
        positions. Edges are drawn first so they appear behind nodes.
      -->
      <svg
        class="dag-svg"
        width={svgWidth}
        height={svgHeight}
        style="min-width: {svgWidth}px"
        aria-hidden="true"
      >
        <g class="edges">
          {#each layout.edges as edge (`${edge.childChangeId}-${edge.parentChangeId}`)}
            <path class="edge" d={edgePath(edge)} />
          {/each}
        </g>
        <g class="nodes">
          {#each layout.nodes as node (node.revision.changeId)}
            <circle
              class="node node-{node.nodeType}"
              class:node-selected={selectedChangeId === node.revision.changeId}
              cx={nodeX(node.column)}
              cy={nodeY(node.row)}
              r={NODE_RADIUS}
              role="button"
              tabindex="0"
              aria-label={nodeAriaLabel(node)}
              onclick={(e) => {
                e.stopPropagation();
                selectRevision(node.revision.changeId);
              }}
              oncontextmenu={(e) => openContextMenu(e, node)}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selectRevision(node.revision.changeId);
                }
              }}
            />
          {/each}
        </g>
      </svg>

      <!--
        Revision info column: one row per revision, aligned with the SVG rows
        above via the fixed ROW_HEIGHT. Each row shows: bookmarks, change ID,
        description, author, and timestamp.
      -->
      <!-- listbox/option roles allow aria-selected and tabindex on selectable rows -->
      <div class="revision-list" role="listbox" aria-label="Revisions">
        {#each layout.nodes as node (node.revision.changeId)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="revision-row"
            class:selected={selectedChangeId === node.revision.changeId}
            style="height: {ROW_HEIGHT}px"
            role="option"
            aria-selected={selectedChangeId === node.revision.changeId}
            tabindex="0"
            onclick={(e) => {
              e.stopPropagation();
              selectRevision(node.revision.changeId);
            }}
            oncontextmenu={(e) => openContextMenu(e, node)}
            onkeydown={(e) => {
              if (e.key === 'Enter') selectRevision(node.revision.changeId);
            }}
          >
            <!-- Bookmark and tag pills -->
            <span class="rev-refs">
              {#each node.revision.localBookmarks as bookmark}
                <span class="badge badge-bookmark">{bookmark}</span>
              {/each}
              {#each node.revision.remoteBookmarks as remote}
                <span class="badge badge-remote">{remote}</span>
              {/each}
              {#each node.revision.tags as tag}
                <span class="badge badge-tag">{tag}</span>
              {/each}
            </span>

            <!-- Short change ID -->
            <span class="rev-id">{shortId(node.revision.changeId)}</span>

            <!-- First line of description -->
            <span class="rev-description" title={node.revision.description.trim()}>
              {firstLine(node.revision.description)}
            </span>

            <!-- Author name and relative timestamp -->
            <span class="rev-meta">
              {node.revision.authorName} · {formatTimestamp(node.revision.authorTimestamp)}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Custom context menu overlay (shown on right-click of a revision node or row) -->
  {#if contextMenu !== null}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="context-menu"
      style="left: {contextMenu.x}px; top: {contextMenu.y}px"
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      {#if !contextMenu.isWorkingCopy}
        <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('edit')}>
          Edit Revision
        </button>
      {/if}
      <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('newAfter')}>
        New Revision After…
      </button>
      {#if !contextMenu.isImmutable}
        <button
          class="menu-item"
          role="menuitem"
          onclick={() => dispatchContextAction('describe')}
        >
          Describe…
        </button>
        <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('squash')}>
          Squash into Parent…
        </button>
        <button class="menu-item" role="menuitem" onclick={() => dispatchContextAction('rebase')}>
          Rebase…
        </button>
        <hr class="menu-separator" />
        <button
          class="menu-item menu-item-destructive"
          role="menuitem"
          onclick={() => dispatchContextAction('abandon')}
        >
          Abandon
        </button>
        <hr class="menu-separator" />
      {/if}
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => dispatchContextAction('copyChangeId')}
      >
        Copy Change ID
      </button>
      <button
        class="menu-item"
        role="menuitem"
        onclick={() => dispatchContextAction('copyCommitId')}
      >
        Copy Commit ID
      </button>
    </div>
  {/if}
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1.4;
    overflow: hidden;
  }

  .graph-root {
    width: 100%;
    height: 100vh;
    overflow: auto;
    outline: none;
    position: relative;
  }

  /* ── Status messages ─────────────────────────────────────────────────────── */

  .status {
    padding: 16px;
    margin: 0;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
  }

  .loading {
    opacity: 0.7;
  }

  .error {
    color: var(--vscode-errorForeground);
    font-style: normal;
  }

  /* ── Graph layout ────────────────────────────────────────────────────────── */

  .graph-body {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    min-height: 100%;
  }

  .dag-svg {
    flex-shrink: 0;
    display: block;
  }

  /* ── SVG edges ───────────────────────────────────────────────────────────── */

  .edge {
    fill: none;
    stroke: var(--vscode-foreground);
    stroke-width: 1.5;
    opacity: 0.3;
  }

  /* ── SVG node circles ────────────────────────────────────────────────────── */

  .node {
    cursor: pointer;
    stroke: var(--vscode-editor-background);
    stroke-width: 1.5;
    outline: none;
  }

  .node:hover,
  .node:focus {
    stroke: var(--vscode-focusBorder, #007fd4);
    stroke-width: 2;
  }

  /* Node type fills — ordered so .node-selected overrides the stroke below */
  .node-workingCopy {
    fill: var(--vscode-terminal-ansiYellow, #c5ac00);
  }
  .node-conflict {
    fill: var(--vscode-terminal-ansiRed, #cd3131);
  }
  .node-immutable {
    fill: var(--vscode-terminal-ansiBrightBlue, #729fcf);
  }
  .node-mutable {
    fill: var(--vscode-terminal-ansiGreen, #14a84b);
  }
  .node-empty {
    fill: none;
    stroke: var(--vscode-descriptionForeground, #8b8b8b);
    stroke-width: 1.5;
  }

  /* Selected state overrides the node-type stroke (.node-selected defined last
     to win the CSS cascade when both classes apply at equal specificity) */
  .node-selected {
    stroke: var(--vscode-focusBorder, #007fd4);
    stroke-width: 2;
  }

  /* ── Revision info rows ──────────────────────────────────────────────────── */

  .revision-list {
    flex: 1;
    overflow: hidden;
    min-width: 0;
  }

  .revision-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 4px;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    border-left: 2px solid transparent;
    user-select: none;
    outline: none;
  }

  .revision-row:hover {
    background: var(--vscode-list-hoverBackground);
  }

  .revision-row:focus {
    background: var(--vscode-list-hoverBackground);
    border-left-color: var(--vscode-focusBorder, #007fd4);
  }

  .revision-row.selected {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
    border-left-color: var(--vscode-focusBorder, #007fd4);
  }

  /* ── Revision row content ────────────────────────────────────────────────── */

  .rev-refs {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
    align-items: center;
  }

  /* Hide the refs container entirely when it has no children */
  .rev-refs:empty {
    display: none;
  }

  .badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.75em;
    font-weight: 500;
    white-space: nowrap;
    line-height: 1.4;
  }

  .badge-bookmark {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
  }

  .badge-remote {
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #ffffff);
    opacity: 0.75;
  }

  .badge-tag {
    background: var(--vscode-terminal-ansiYellow, #c5ac00);
    color: var(--vscode-editor-background);
  }

  .rev-id {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.85em;
    color: var(--vscode-terminal-ansiCyan, #00bcd4);
    flex-shrink: 0;
  }

  .revision-row.selected .rev-id {
    color: var(--vscode-list-activeSelectionForeground);
  }

  .rev-description {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--vscode-foreground);
  }

  .revision-row.selected .rev-description {
    color: var(--vscode-list-activeSelectionForeground);
  }

  .rev-meta {
    font-size: 0.82em;
    color: var(--vscode-descriptionForeground);
    flex-shrink: 0;
  }

  .revision-row.selected .rev-meta {
    color: var(--vscode-list-activeSelectionForeground);
    opacity: 0.85;
  }

  /* ── Context menu ────────────────────────────────────────────────────────── */

  .context-menu {
    position: fixed;
    background: var(--vscode-menu-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border, #454545));
    border-radius: 4px;
    padding: 4px 0;
    min-width: 180px;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 5px 12px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    color: var(--vscode-menu-foreground, var(--vscode-foreground));
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-editor-font-size, 13px);
    white-space: nowrap;
  }

  .menu-item:hover,
  .menu-item:focus {
    background: var(--vscode-menu-selectionBackground, var(--vscode-list-hoverBackground));
    color: var(--vscode-menu-selectionForeground, var(--vscode-foreground));
    outline: none;
  }

  .menu-item-destructive {
    color: var(--vscode-terminal-ansiRed, #cd3131);
  }

  .menu-separator {
    border: none;
    border-top: 1px solid
      var(--vscode-menu-separatorBackground, var(--vscode-panel-border, #454545));
    margin: 4px 0;
  }
</style>
