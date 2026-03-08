<script module lang="ts">
  import {
    computeLayout,
    type GraphRevision,
    type LayoutNode,
    type DagLayout,
  } from './dag-layout.js';
  import {
    COL_WIDTH,
    ROW_HEIGHT,
    NODE_RADIUS,
    SVG_PADDING,
    nodeX,
    nodeY,
    nodeAriaLabel,
    type ContextMenuAction,
    type ContextMenuState,
    type DragState,
  } from './graph-utils.js';
  import GraphEdge from './components/GraphEdge.svelte';
  import GraphNode from './components/GraphNode.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import DragOverlay from './components/DragOverlay.svelte';

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

  type ViewState = 'empty' | 'loading' | 'content' | 'error';

  // ── VSCode API ──────────────────────────────────────────────────────────────

  // acquireVsCodeApi is injected by the VSCode webview host at runtime.
  // safe: this global is always present in VSCode webview contexts.
  declare function acquireVsCodeApi(): {
    postMessage(message: unknown): void;
    getState(): unknown;
    setState(state: unknown): void;
  };
</script>

<script lang="ts">

  const vscode = acquireVsCodeApi();

  // ── State ───────────────────────────────────────────────────────────────────

  let viewState: ViewState = $state('empty');
  let revisions: GraphRevision[] = $state([]);
  let selectedChangeId: string | null = $state(null);
  let errorText = $state('');
  let contextMenu: ContextMenuState | null = $state(null);
  let dragState: DragState | null = $state(null);

  // ── Zoom / pan state ─────────────────────────────────────────────────────────

  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 4.0;

  let zoom = $state(1.0);
  let panX = $state(0);
  let panY = $state(0);
  // isPanning drives cursor style changes, so it must be reactive.
  let isPanning = $state(false);

  // Non-reactive tracking for in-progress pan gesture (no re-render needed mid-gesture).
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;

  // Non-reactive tracking for pre-threshold drag detection (distinguish click from drag).
  let potentialDrag: { changeId: string; startX: number; startY: number } | null = null;

  // Set to true when a drag-rebase completes to suppress the synthetic click
  // event that would otherwise fire on the underlying element.
  let isDragComplete = false;

  // ── Layout ──────────────────────────────────────────────────────────────────

  const layout: DagLayout = $derived(computeLayout(revisions));

  // ── Derived SVG dimensions ─────────────────────────────────────────────────

  const svgWidth = $derived((layout.maxColumn + 1) * COL_WIDTH + SVG_PADDING * 2);
  const svgHeight = $derived(Math.max(layout.nodes.length * ROW_HEIGHT, 1));

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

  // ── Revision interaction ─────────────────────────────────────────────────────

  function selectRevision(changeId: string): void {
    selectedChangeId = changeId;
    contextMenu = null;
    vscode.postMessage({ type: 'revisionClicked', changeId });
  }

  function openContextMenu(event: MouseEvent, node: LayoutNode): void {
    // Right-click cancels any active drag rather than opening the context menu.
    if (dragState !== null || potentialDrag !== null) {
      dragState = null;
      potentialDrag = null;
      event.preventDefault();
      return;
    }
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
    // Suppress click events that follow a completed drag gesture.
    if (isDragComplete) {
      isDragComplete = false;
      return;
    }
    contextMenu = null;
    event.stopPropagation();
  }

  // ── Zoom / pan ──────────────────────────────────────────────────────────────

  function clampZoom(value: number): number {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function zoomIn(): void {
    zoom = clampZoom(zoom * 1.2);
  }

  function zoomOut(): void {
    zoom = clampZoom(zoom / 1.2);
  }

  function resetView(): void {
    zoom = 1.0;
    panX = 0;
    panY = 0;
  }

  /**
   * Handle wheel events for zoom (Ctrl+Wheel) and pan (plain Wheel).
   *
   * Ctrl+Wheel zooms the graph centered on the cursor position, preserving the
   * content point under the cursor. Plain Wheel pans vertically; Shift+Wheel
   * pans horizontally.
   */
  function onWheel(event: WheelEvent): void {
    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      // Cursor-centered zoom: adjust pan so the content point under the cursor
      // does not move as the zoom level changes.
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = clampZoom(zoom * factor);
      if (newZoom === zoom) return;

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      // The formula: new_pan = cursor - (cursor - old_pan) * (new_zoom / old_zoom)
      panX = cursorX - (cursorX - panX) * (newZoom / zoom);
      panY = cursorY - (cursorY - panY) * (newZoom / zoom);
      zoom = newZoom;
    } else {
      // Plain wheel: scroll vertically (Shift+wheel scrolls horizontally).
      const dx = event.shiftKey ? -event.deltaY : -event.deltaX;
      const dy = event.shiftKey ? 0 : -event.deltaY;
      panX += dx;
      panY += dy;
    }
  }

  // ── Pointer events (unified pan + drag-rebase) ───────────────────────────────

  /**
   * Unified pointer-down handler on the `.graph-root` element.
   *
   * Determines whether the gesture should begin as a drag-rebase (pointer is
   * on a mutable revision node or row) or a pan (pointer is on background).
   * `setPointerCapture` ensures subsequent move/up events are delivered here
   * regardless of where the pointer moves.
   */
  function onPointerDown(event: PointerEvent): void {
    // Middle-click always pans regardless of target.
    if (event.button === 1) {
      startPan(event);
      return;
    }
    // Right-click is handled by oncontextmenu; ignore here.
    if (event.button !== 0) return;

    const target = event.target as Element;
    const isOnRevision =
      target.classList.contains('node') ||
      target.classList.contains('revision-row') ||
      target.closest('.revision-row') !== null;
    const isOnOverlay =
      target.closest('.context-menu') !== null || target.closest('.zoom-toolbar') !== null;

    if (isOnOverlay) {
      return;
    }

    if (isOnRevision) {
      // Start tracking a potential drag-rebase. Only commit to drag once the
      // pointer moves beyond the drag threshold (6 px).
      const changeId = getChangeIdFromTarget(target);
      if (changeId !== null) {
        const revision = revisions.find((r) => r.changeId === changeId);
        if (revision !== undefined && !revision.isImmutable) {
          potentialDrag = { changeId, startX: event.clientX, startY: event.clientY };
          (event.currentTarget as Element).setPointerCapture(event.pointerId);
        }
      }
    } else {
      startPan(event);
    }
  }

  function startPan(event: PointerEvent): void {
    isPanning = true;
    panStartX = event.clientX;
    panStartY = event.clientY;
    panStartPanX = panX;
    panStartPanY = panY;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    if (isPanning) {
      panX = panStartPanX + (event.clientX - panStartX);
      panY = panStartPanY + (event.clientY - panStartY);
      return;
    }

    if (potentialDrag !== null) {
      const dx = event.clientX - potentialDrag.startX;
      const dy = event.clientY - potentialDrag.startY;
      // Commit to drag mode after 6 px of movement.
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        dragState = {
          sourceChangeId: potentialDrag.changeId,
          ghostX: event.clientX,
          ghostY: event.clientY,
          targetChangeId: findDropTarget(event.clientX, event.clientY),
        };
        potentialDrag = null;
      }
      return;
    }

    if (dragState !== null) {
      dragState = {
        ...dragState,
        ghostX: event.clientX,
        ghostY: event.clientY,
        targetChangeId: findDropTarget(event.clientX, event.clientY),
      };
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if (isPanning) {
      isPanning = false;
      return;
    }

    // potentialDrag without committed dragState → this was a click, not a drag.
    // Clear the ref so the onClick handler fires normally.
    potentialDrag = null;

    if (dragState !== null) {
      const { sourceChangeId, targetChangeId } = dragState;
      dragState = null;
      // Set the flag so click handlers that follow this pointerup know to skip selection.
      isDragComplete = true;
      // Use requestAnimationFrame to clear the flag after all synchronous click
      // handlers have had a chance to run.
      requestAnimationFrame(() => {
        isDragComplete = false;
      });
      if (targetChangeId !== null) {
        vscode.postMessage({ type: 'dragRebase', sourceChangeId, targetChangeId });
      }
    }
  }

  function onPointerCancel(): void {
    isPanning = false;
    potentialDrag = null;
    dragState = null;
  }

  /**
   * Retrieve the `data-changeid` attribute from `target` or its nearest
   * ancestor that has one. Returns null if no such ancestor exists.
   */
  function getChangeIdFromTarget(target: Element): string | null {
    const found =
      target.getAttribute('data-changeid') !== null
        ? target
        : (target.closest('[data-changeid]') as Element | null);
    return found?.getAttribute('data-changeid') ?? null;
  }

  /**
   * Find the topmost valid drag-rebase drop target at the given viewport
   * coordinates.
   *
   * A valid target is a non-immutable revision other than the drag source.
   * The drag ghost element is excluded via `closest('.drag-ghost')`.
   */
  function findDropTarget(clientX: number, clientY: number): string | null {
    if (dragState === null) return null;
    const elements = document.elementsFromPoint(clientX, clientY);
    for (const el of elements) {
      if (el.closest('.drag-ghost') !== null) continue;
      const changeId = el.getAttribute('data-changeid');
      if (changeId === null) continue;
      if (changeId === dragState.sourceChangeId) continue;
      const revision = revisions.find((r) => r.changeId === changeId);
      if (revision === undefined || revision.isImmutable) continue;
      return changeId;
    }
    return null;
  }

  // ── Keyboard ────────────────────────────────────────────────────────────────

  function onRootKeyDown(event: KeyboardEvent): void {
    // Escape: cancel drag or dismiss context menu.
    if (event.key === 'Escape') {
      if (dragState !== null || potentialDrag !== null) {
        dragState = null;
        potentialDrag = null;
        event.stopPropagation();
        return;
      }
      if (contextMenu !== null) {
        contextMenu = null;
        event.stopPropagation();
        return;
      }
    }

    if (contextMenu !== null) return;

    // Ctrl+0: reset zoom and pan.
    if (event.key === '0' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      resetView();
      return;
    }

    // Ctrl++ / Ctrl+=: zoom in.
    if ((event.key === '=' || event.key === '+') && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      zoomIn();
      return;
    }

    // Ctrl+-: zoom out.
    if (event.key === '-' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      zoomOut();
      return;
    }

    if (layout.nodes.length === 0) return;

    // Arrow keys: navigate revision list.
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

  // ── Derived ─────────────────────────────────────────────────────────────────

  const dropTargetChangeId = $derived(dragState?.targetChangeId ?? null);
  const isDragging = $derived(dragState !== null);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="graph-root"
  class:is-panning={isPanning}
  class:is-dragging={isDragging}
  onclick={dismissContextMenu}
  onkeydown={onRootKeyDown}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
  onwheel={onWheel}
  ondragstart={(e) => e.preventDefault()}
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
    <!--
      .graph-canvas is the pannable / zoomable content layer. CSS transform is
      applied here with transform-origin: 0 0 so that coordinates relative to
      the viewport top-left stay predictable.
    -->
    <div
      class="graph-canvas"
      style="transform: translate({panX}px, {panY}px) scale({zoom}); transform-origin: 0 0;"
    >
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
              <GraphEdge {edge} />
            {/each}
          </g>
          <g class="nodes">
            {#each layout.nodes as node (node.revision.changeId)}
              <circle
                class="node node-{node.nodeType}"
                class:node-selected={selectedChangeId === node.revision.changeId}
                class:node-drop-target={dropTargetChangeId === node.revision.changeId}
                class:node-drag-source={dragState?.sourceChangeId === node.revision.changeId}
                data-changeid={node.revision.changeId}
                cx={nodeX(node.column)}
                cy={nodeY(node.row)}
                r={NODE_RADIUS}
                role="button"
                tabindex="0"
                aria-label={nodeAriaLabel(node)}
                onclick={(e) => {
                  e.stopPropagation();
                  if (isDragComplete) { isDragComplete = false; return; }
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

          `data-changeid` attributes enable hit-testing during drag-rebase.
        -->
        <div class="revision-list" role="listbox" aria-label="Revisions">
          {#each layout.nodes as node (node.revision.changeId)}
            <GraphNode
              {node}
              selected={selectedChangeId === node.revision.changeId}
              isDropTarget={dropTargetChangeId === node.revision.changeId}
              isDragSource={dragState?.sourceChangeId === node.revision.changeId}
              onclick={(e) => {
                e.stopPropagation();
                if (isDragComplete) { isDragComplete = false; return; }
                selectRevision(node.revision.changeId);
              }}
              oncontextmenu={(e) => openContextMenu(e, node)}
              onselect={() => selectRevision(node.revision.changeId)}
            />
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!--
    Zoom toolbar overlay — shown in the bottom-right corner when there is
    content to display. Buttons zoom in/out and reset the view. Tooltips
    show the keyboard shortcuts.
  -->
  {#if viewState === 'content'}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="zoom-toolbar" role="toolbar" aria-label="Zoom controls">
      <button
        class="zoom-btn"
        aria-label="Zoom out"
        title="Zoom out (Ctrl+−)"
        onclick={(e) => {
          e.stopPropagation();
          zoomOut();
        }}
      >−</button>
      <button
        class="zoom-btn zoom-level"
        aria-label="Reset zoom to 100%"
        title="Reset zoom (Ctrl+0)"
        onclick={(e) => {
          e.stopPropagation();
          resetView();
        }}
      >{Math.round(zoom * 100)}%</button>
      <button
        class="zoom-btn"
        aria-label="Zoom in"
        title="Zoom in (Ctrl+=)"
        onclick={(e) => {
          e.stopPropagation();
          zoomIn();
        }}
      >+</button>
    </div>
  {/if}

  {#if dragState !== null}
    <DragOverlay drag={dragState} />
  {/if}

  {#if contextMenu !== null}
    <ContextMenu menu={contextMenu} onaction={dispatchContextAction} />
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

  /* ── Root container ──────────────────────────────────────────────────────── */

  .graph-root {
    width: 100%;
    height: 100vh;
    overflow: hidden;
    outline: none;
    position: relative;
    cursor: grab;
  }

  /* Override cursor for interactive child elements inside the canvas. */
  .graph-root :global(.node),
  .graph-root :global(.revision-row) {
    cursor: pointer;
  }

  /* Grabbing cursor overrides everything while a pan or drag is in progress. */
  .graph-root.is-panning,
  .graph-root.is-panning :global(*),
  .graph-root.is-dragging,
  .graph-root.is-dragging :global(*) {
    cursor: grabbing;
  }

  /* ── Zoomable / pannable canvas ──────────────────────────────────────────── */

  .graph-canvas {
    transform-origin: 0 0;
    user-select: none;
    display: inline-block;
    position: absolute;
    top: 0;
    left: 0;
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

  /* ── SVG node circles ────────────────────────────────────────────────────── */

  .node {
    stroke: var(--vscode-editor-background);
    stroke-width: 1.5;
    outline: none;
  }

  .node:hover,
  .node:focus {
    stroke: var(--vscode-focusBorder, #007fd4);
    stroke-width: 2;
  }

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

  .node-selected {
    stroke: var(--vscode-focusBorder, #007fd4);
    stroke-width: 2;
  }

  .node-drag-source {
    opacity: 0.5;
  }

  .node-drop-target {
    stroke: var(--vscode-terminal-ansiYellow, #c5ac00);
    stroke-width: 3;
    filter: drop-shadow(0 0 3px var(--vscode-terminal-ansiYellow, #c5ac00));
  }

  /* ── Revision list container ─────────────────────────────────────────────── */

  .revision-list {
    flex: 1;
    overflow: hidden;
    min-width: 0;
  }

  /* ── Zoom toolbar ─────────────────────────────────────────────────────────── */

  .zoom-toolbar {
    position: fixed;
    bottom: 12px;
    right: 12px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background));
    border: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border, #454545));
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 100;
    cursor: default;
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 26px;
    padding: 0 6px;
    background: none;
    border: none;
    border-right: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border, #454545));
    cursor: pointer;
    color: var(--vscode-foreground);
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-editor-font-size, 13px);
    line-height: 1;
  }

  .zoom-btn:last-child {
    border-right: none;
  }

  .zoom-btn:hover {
    background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground));
  }

  .zoom-btn:focus {
    outline: 1px solid var(--vscode-focusBorder, #007fd4);
    outline-offset: -1px;
  }

  .zoom-level {
    min-width: 46px;
    font-variant-numeric: tabular-nums;
    font-size: 0.85em;
  }
</style>
